// ====================== TOAST NOTIFICATIONS ======================
const toastContainer = document.getElementById('toastContainer');

function showToast(message, type = 'info', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ====================== THEME TOGGLE ======================
(function initTheme() {
  const KEY = "multivid-theme";
  const saved = localStorage.getItem(KEY);
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = saved || (prefersLight ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", theme);

  window.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;

    btn.setAttribute("aria-label", `Switch to ${theme === "light" ? "dark" : "light"} theme`);
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "T") {
      e.preventDefault();
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(KEY, next);
    }
  });

  window.toggleTheme = function() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(KEY, next);
  };
})();

// ====================== DOM ELEMENTS ======================
const infoForm = document.getElementById("infoForm");
const videoUrlInput = document.getElementById("videoUrl");
const infoBtn = document.getElementById("infoBtn");
const resultCard = document.getElementById("resultCard");
const formatsList = document.getElementById("formatsList");
const pasteDemoBtn = document.getElementById("pasteDemoBtn");
const ffmpegStatus = document.getElementById("ffmpegStatus");
const bestBtn = document.getElementById("bestBtn");
const audioBtn = document.getElementById("audioBtn");
const subtitleBtn = document.getElementById("subtitleBtn");
const pasteBtn = document.getElementById("pasteBtn");
const clearUrlBtn = document.getElementById("clearUrlBtn");
const thumbOverlay = document.getElementById("thumbOverlay");

const thumbnail = document.getElementById("thumbnail");
const titleEl = document.getElementById("title");
const uploaderEl = document.getElementById("uploader");
const durationEl = document.getElementById("duration");
const siteEl = document.getElementById("site");

const progressModal = document.getElementById("progressModal");
const progressTitle = document.getElementById("progressTitle");
const progressFileName = document.getElementById("progressFileName");
const progressBar = document.getElementById("progressBar");
const percentText = document.getElementById("percentText");
const sizeText = document.getElementById("sizeText");
const speedText = document.getElementById("speedText");
const etaText = document.getElementById("etaText");
const cancelBtn = document.getElementById("cancelBtn");

const hasFfmpeg = document.body.dataset.ffmpeg === "true";
let currentVideo = null;
let currentTaskId = null;
let progressSource = null;
let progressInterval = null;

// ====================== INITIALIZATION ======================
ffmpegStatus.textContent = hasFfmpeg
  ? "✓ ffmpeg ready — MP3 enabled"
  : "⚠ ffmpeg not found — MP3 may not work";
ffmpegStatus.className = hasFfmpeg ? 'helper-text success' : 'helper-text';

if (!hasFfmpeg) {
  audioBtn.disabled = true;
}

// Show/hide clear button based on input
videoUrlInput.addEventListener('input', () => {
  clearUrlBtn.classList.toggle('hidden', !videoUrlInput.value);
});

clearUrlBtn.addEventListener('click', () => {
  videoUrlInput.value = '';
  clearUrlBtn.classList.add('hidden');
  videoUrlInput.focus();
});

// Paste from clipboard
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    videoUrlInput.value = text;
    clearUrlBtn.classList.toggle('hidden', !text);
    videoUrlInput.focus();
    showToast('URL pasted from clipboard', 'success');
  } catch (err) {
    showToast('Could not access clipboard', 'error');
  }
});

// Paste demo URL
pasteDemoBtn.addEventListener("click", () => {
  videoUrlInput.value = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  clearUrlBtn.classList.remove('hidden');
  videoUrlInput.focus();
});

// Keyboard shortcut: Ctrl+V focuses input
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'v' && document.activeElement !== videoUrlInput) {
    videoUrlInput.focus();
  }
});

function setBusy(isBusy) {
  infoBtn.disabled = isBusy;
  const btnText = infoBtn.querySelector('.btn-text');
  const btnLoader = infoBtn.querySelector('.btn-loader');

  if (isBusy) {
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
  } else {
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
  }
}

// ====================== FORMAT RENDERING ======================
function renderFormats(formats) {
  formatsList.innerHTML = "";

  if (!formats || formats.length === 0) {
    formatsList.innerHTML = `
      <div class="format-card">
        <div class="format-info">
          <div class="format-title">No formats available</div>
          <div class="format-meta">Try another link.</div>
        </div>
      </div>`;
    return;
  }

  // Filter bar
  const bar = document.createElement("div");
  bar.className = "filter-bar";
  bar.innerHTML = `
    <label class="filter-label">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      Filter:
      <select id="formatFilter" aria-label="Filter formats">
        <option value="all">All formats</option>
        <option value="recommended">Recommended</option>
        <option value="video">Video + Audio</option>
        <option value="video-only">Video only</option>
        <option value="audio">Audio only</option>
        <option value="1080">1080p+</option>
        <option value="720">720p+</option>
        <option value="480">480p+</option>
      </select>
    </label>
    <span class="filter-count" id="filterCount"></span>`;
  formatsList.appendChild(bar);

  // Group formats
  const groups = {
    "Video + Audio": [],
    "Video only":   [],
    "Audio only":   [],
  };

  formats.forEach((f) => {
    if (f.type === "audio") groups["Audio only"].push(f);
    else if (f.has_audio)   groups["Video + Audio"].push(f);
    else                    groups["Video only"].push(f);
  });

  const groupsWrap = document.createElement("div");
  groupsWrap.id = "formatGroups";
  formatsList.appendChild(groupsWrap);

  function draw(filter = "all") {
    groupsWrap.innerHTML = "";
    let shown = 0;

    for (const [name, items] of Object.entries(groups)) {
      const visibleItems = items.filter((f) => matchFilter(f, filter, name));
      if (visibleItems.length === 0) continue;

      const details = document.createElement("details");
      details.className = "format-group";
      details.open = true;

      const summary = document.createElement("summary");
      summary.innerHTML = `
        <span>${name}</span>
        <span class="group-count">${visibleItems.length}</span>`;
      details.appendChild(summary);

      visibleItems.forEach((format) => {
        const card = document.createElement("div");
        card.className = "format-card";

        const info = document.createElement("div");
        info.className = "format-info";

        const typePill = `<span class="pill ${format.type}">${format.type === 'audio' ? 'Audio' : 'Video'}</span>`;
        const recBadge = format.recommended
          ? `<span class="pill recommended" title="Best for most users">★ Best</span>`
          : "";

        info.innerHTML = `
          <div class="format-title">
            ${typePill}
            ${recBadge}
            <span>${escapeHtml(format.label)}</span>
          </div>
          <div class="format-meta">
            ${format.height ? `${format.height}p` : 'Audio'} • ${escapeHtml(format.filesize || 'Unknown size')}
          </div>`;

        const button = document.createElement("button");
        button.className = "format-btn";
        button.type = "button";
        button.textContent = format.type === "audio" ? "Download" : "Download";
        button.setAttribute("aria-label",
          `Download ${format.label}, size ${format.filesize || "unknown"}`);
        button.addEventListener("click", () => startDownload(format.type, format));

        card.append(info, button);
        details.appendChild(card);
        shown++;
      });

      groupsWrap.appendChild(details);
    }

    document.getElementById("filterCount").textContent =
      `${shown} format${shown === 1 ? "" : "s"}`;
  }

  function matchFilter(f, filter, groupName) {
    switch (filter) {
      case "all":         return true;
      case "recommended": return !!f.recommended;
      case "video":       return groupName === "Video + Audio";
      case "video-only":  return groupName === "Video only";
      case "audio":       return f.type === "audio";
      case "1080":        return (f.height || 0) >= 1080;
      case "720":         return (f.height || 0) >= 720;
      case "480":         return (f.height || 0) >= 480;
      default:            return true;
    }
  }

  document.getElementById("formatFilter").addEventListener("change", (e) => {
    draw(e.target.value);
  });

  draw("all");
}

function renderVideo(data) {
  currentVideo = data;
  titleEl.textContent = data.title || "Untitled";
  uploaderEl.textContent = data.uploader || "Unknown";
  durationEl.textContent = data.duration || "Unknown";
  siteEl.textContent = data.site || "Unknown";
  thumbnail.src = data.thumbnail || "";
  thumbnail.alt = data.title ? `${data.title} thumbnail` : "Video thumbnail";

  // Show thumbnail overlay for preview
  thumbOverlay.classList.remove('hidden');

  renderFormats(data.formats || []);
  resultCard.classList.remove("hidden");
  resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }
    return data;
  }

  if (!response.ok) {
    throw new Error("Request failed.");
  }

  return response;
}

// ====================== FORM SUBMISSION ======================
infoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = videoUrlInput.value.trim();

  resultCard.classList.add("hidden");

  if (!url) {
    showToast("Please enter a video URL", "error");
    return;
  }

  try {
    setBusy(true);
    showToast("Fetching video info...", "info", 2000);

    const data = await fetchJson("/api/info", {
      method: "POST",
      body: JSON.stringify({ url }),
    });

    renderVideo(data);
    showToast("Video info loaded successfully!", "success");
  } catch (error) {
    showToast(error.message || "Could not fetch video info", "error");
  } finally {
    setBusy(false);
  }
});

// ====================== DOWNLOAD HANDLING ======================
function showProgress(title, filename = "") {
  progressTitle.textContent = title;
  progressFileName.textContent = filename;
  progressModal.classList.remove("hidden");
  progressBar.style.width = "0%";
  percentText.textContent = "0%";
  sizeText.textContent = "0 / 0 MB";
  speedText.textContent = "-- MB/s";
  etaText.textContent = "--";
}

function hideProgress() {
  progressModal.classList.add("hidden");
  currentTaskId = null;
  stopProgressStream();
}

function stopProgressStream() {
  if (progressSource) {
    progressSource.close();
    progressSource = null;
  }
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

let currentMode = "video";

async function startDownload(mode, format = null) {
  currentMode = mode;
  if (!currentVideo) {
    showToast("Fetch video details first", "error");
    return;
  }

  const url = videoUrlInput.value.trim();
  const payload = {
    url: url,
    mode: mode,
    format_id: format ? format.format_id : ""
  };

  const title = mode === "subtitle" ? "Downloading Subtitles..." :
                mode === "audio" ? "Converting to MP3..." : "Downloading Video...";

  try {
    showProgress(title, currentVideo?.title || "");

    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    currentTaskId = data.task_id;
    subscribeProgress(currentTaskId);
  } catch (err) {
    hideProgress();
    showToast(err.message || "Download failed", "error");
  }
}

function subscribeProgress(taskId) {
  stopProgressStream();

  if (typeof EventSource !== "undefined") {
    progressSource = new EventSource(`/api/progress-stream/${taskId}`);

    progressSource.onmessage = (evt) => {
      try {
        const prog = JSON.parse(evt.data);
        applyProgress(prog);
      } catch (err) {
        console.error("Bad progress payload", err);
      }
    };

    progressSource.addEventListener("close", () => stopProgressStream());

    progressSource.onerror = () => {
      stopProgressStream();
      pollProgressFallback();
    };
  } else {
    pollProgressFallback();
  }
}

function pollProgressFallback() {
  progressInterval = setInterval(async () => {
    if (!currentTaskId) return;
    try {
      const res = await fetch(`/api/progress/${currentTaskId}`);
      const prog = await res.json();
      applyProgress(prog);
    } catch (err) {
      console.error("Progress poll failed", err);
    }
  }, 1000);
}

function applyProgress(prog) {
  const wrap = document.getElementById("progressBarWrap");

  if (prog.status === "downloading" || prog.status === "merging") {
    const pct = Math.min(100, Number(prog.percent) || 0);
    progressBar.style.width = pct + "%";
    wrap.setAttribute("aria-valuenow", String(pct));
    percentText.textContent = pct + "%";

    if (prog.downloaded !== undefined && prog.total) {
      const dlMB = (prog.downloaded / 1048576).toFixed(1);
      const totalMB = (prog.total / 1048576).toFixed(1);
      sizeText.textContent = `${dlMB} / ${totalMB} MB`;
    }

    if (prog.speed) {
      const speedMB = (prog.speed / 1048576).toFixed(2);
      speedText.textContent = `${speedMB} MB/s`;
    }

    etaText.textContent = prog.eta ? `${Math.round(prog.eta)}s` : "calculating...";

  } else if (prog.status === "finished") {
    stopProgressStream();
    progressBar.style.width = "100%";
    wrap.setAttribute("aria-valuenow", "100");
    percentText.textContent = "100%";
    showToast("Download complete! File is saving...", "success");

    addToHistory({
      title: currentVideo?.title || "Untitled",
      url: videoUrlInput.value.trim(),
      mode: currentMode,
      filename: prog.filename,
    });

    setTimeout(() => {
      window.location.href = `/api/download_file/${currentTaskId}`;
      hideProgress();
    }, 500);

  } else if (prog.status === "cancelled") {
    stopProgressStream();
    hideProgress();
    showToast("Download cancelled", "error");

  } else if (prog.status === "error") {
    stopProgressStream();
    hideProgress();
    showToast(prog.error || "Download failed", "error");
  }
}

// ====================== DOWNLOAD HISTORY ======================
const HISTORY_KEY = "multivid-history";
const HISTORY_MAX = 25;

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}

function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
}

function addToHistory(entry) {
  const list = getHistory();
  list.unshift({
    title: entry.title,
    url: entry.url,
    mode: entry.mode,
    filename: entry.filename || "",
    timestamp: Date.now(),
  });
  saveHistory(list);
  renderHistory();
}

function renderHistory() {
  const section = document.getElementById("historySection");
  const list = document.getElementById("historyList");
  const empty = document.getElementById("historyEmpty");
  if (!section || !list) return;

  const items = getHistory();
  list.innerHTML = "";

  if (items.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  items.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "history-item";
    const when = new Date(item.timestamp).toLocaleString();
    li.innerHTML = `
      <div class="history-item-info">
        <div class="hi-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="hi-meta">${escapeHtml(item.mode)} • ${when}</div>
      </div>
      <div class="history-item-actions">
        <button data-action="reuse" data-idx="${idx}" title="Use this URL again">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
        </button>
        <button data-action="remove" data-idx="${idx}" class="danger" title="Remove from history">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    list.appendChild(li);
  });

  list.onclick = (evt) => {
    const btn = evt.target.closest("button[data-action]");
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    const all = getHistory();

    if (btn.dataset.action === "reuse") {
      videoUrlInput.value = all[idx].url;
      clearUrlBtn.classList.toggle("hidden", !all[idx].url);
      videoUrlInput.focus();
      showToast("URL loaded", "info", 2000);
    } else if (btn.dataset.action === "remove") {
      all.splice(idx, 1);
      saveHistory(all);
      renderHistory();
    }
  };
}

document.getElementById("clearHistoryBtn")?.addEventListener("click", () => {
  if (confirm("Clear all download history?")) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    showToast("History cleared", "info", 2000);
  }
});

document.addEventListener("DOMContentLoaded", renderHistory);

// ====================== CANCEL BUTTON ======================
cancelBtn.addEventListener("click", async () => {
  if (!currentTaskId) { hideProgress(); return; }
  try {
    await fetch(`/api/cancel/${currentTaskId}`, { method: "POST" });
  } catch (e) { /* ignore */ }
  stopProgressStream();
  hideProgress();
  showToast("Download cancelled", "error");
});

// ====================== ACTION BUTTONS ======================
bestBtn.addEventListener("click", () => startDownload("video"));
audioBtn.addEventListener("click", () => startDownload("audio"));
subtitleBtn.addEventListener("click", () => startDownload("subtitle"));

// Thumbnail preview click (could open video URL if supported)
thumbnail.parentElement.addEventListener("click", () => {
  if (currentVideo?.webpage_url) {
    window.open(currentVideo.webpage_url, "_blank");
  }
});