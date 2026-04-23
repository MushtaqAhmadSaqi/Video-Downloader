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

    const icon = btn.querySelector(".theme-icon");
    const render = () => {
      const cur = document.documentElement.getAttribute("data-theme");
      icon.textContent = cur === "light" ? "☀️" : "🌙";
      btn.setAttribute("aria-label", `Switch to ${cur === "light" ? "dark" : "light"} theme`);
    };
    render();

    btn.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(KEY, next);
      render();
    });
  });
})();

const infoForm = document.getElementById("infoForm");
const videoUrlInput = document.getElementById("videoUrl");
const infoBtn = document.getElementById("infoBtn");
const statusBox = document.getElementById("statusBox");
const resultCard = document.getElementById("resultCard");
const formatsList = document.getElementById("formatsList");
const pasteDemoBtn = document.getElementById("pasteDemoBtn");
const ffmpegStatus = document.getElementById("ffmpegStatus");
const bestBtn = document.getElementById("bestBtn");
const audioBtn = document.getElementById("audioBtn");

const thumbnail = document.getElementById("thumbnail");
const titleEl = document.getElementById("title");
const uploaderEl = document.getElementById("uploader");
const durationEl = document.getElementById("duration");
const siteEl = document.getElementById("site");

const hasFfmpeg = document.body.dataset.ffmpeg === "true";
let currentVideo = null;

// ====================== NEW INLINE PROGRESS SECTION ======================
const progressSection = document.getElementById("progressSection");
const progressTitle = document.getElementById("progressTitle");
const progressBar = document.getElementById("progressBar");
const percentText = document.getElementById("percentText");
const sizeText = document.getElementById("sizeText");
const etaText = document.getElementById("etaText");
const cancelBtn = document.getElementById("cancelBtn");
const subtitleBtn = document.getElementById("subtitleBtn");

let currentTaskId = null;
let progressInterval = null;

ffmpegStatus.textContent = hasFfmpeg
  ? "ffmpeg detected — MP3 extraction is enabled."
  : "ffmpeg not detected — video downloads will still work, but MP3 extraction may fail.";

audioBtn.disabled = !hasFfmpeg;

pasteDemoBtn.addEventListener("click", () => {
  videoUrlInput.value = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  videoUrlInput.focus();
});

function showStatus(message, type = "success") {
  statusBox.className = `status ${type}`;
  statusBox.textContent = message;
}

function hideStatus() {
  statusBox.className = "status hidden";
  statusBox.textContent = "";
}

function setBusy(isBusy, label = "Get Info") {
  infoBtn.disabled = isBusy;
  infoBtn.textContent = isBusy ? "Working..." : label;
}

function renderFormats(formats) {
  formatsList.innerHTML = "";

  if (!formats || formats.length === 0) {
    formatsList.innerHTML = `
      <div class="format-card">
        <div>
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
      Filter:
      <select id="formatFilter" aria-label="Filter formats">
        <option value="all">All</option>
        <option value="recommended">Recommended</option>
        <option value="video">Video with audio</option>
        <option value="video-only">Video only</option>
        <option value="audio">Audio only</option>
        <option value="1080">1080p+</option>
        <option value="720">720p+</option>
        <option value="480">480p+</option>
      </select>
    </label>
    <span class="filter-count" id="filterCount"></span>`;
  formatsList.appendChild(bar);

  // Grouped container
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

        const left = document.createElement("div");
        const typePill = `<span class="pill ${format.type}">${format.type.toUpperCase()}</span>`;
        const recBadge = format.recommended
          ? `<span class="pill recommended" title="Recommended for most users">★ RECOMMENDED</span>`
          : "";

        left.innerHTML = `
          <div class="format-title">
            ${typePill}
            ${recBadge}
            <span>${escapeHtml(format.label)}</span>
          </div>
          <div class="format-meta">
            Size: ${escapeHtml(format.filesize || "Unknown")} • ID: ${escapeHtml(format.format_id)}
          </div>`;

        const button = document.createElement("button");
        button.className = "format-btn";
        button.type = "button";
        button.textContent = format.type === "audio" ? "Download Audio" : "Download Video";
        button.setAttribute("aria-label",
          `Download ${format.label}, size ${format.filesize || "unknown"}`);
        button.addEventListener("click", () => startDownload(format.type, format));

        card.append(left, button);
        details.appendChild(card);
        shown++;
      });

      groupsWrap.appendChild(details);
    }

    document.getElementById("filterCount").textContent =
      `${shown} format${shown === 1 ? "" : "s"} shown`;
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

  renderFormats(data.formats || []);
  resultCard.classList.remove("hidden");
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

infoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = videoUrlInput.value.trim();

  hideStatus();
  resultCard.classList.add("hidden");

  if (!url) {
    showStatus("Paste a video URL first.", "error");
    return;
  }

  try {
    setBusy(true);
    showStatus("Fetching video information...", "success");

    const data = await fetchJson("/api/info", {
      method: "POST",
      body: JSON.stringify({ url }),
    });

    renderVideo(data);
    showStatus("Video details loaded. Pick a format and download it.", "success");
  } catch (error) {
    showStatus(error.message || "Could not fetch video info.", "error");
  } finally {
    setBusy(false);
  }
});

// ====================== SUBTITLE + PROGRESS DOWNLOAD ======================
function showProgress(title) {
  progressTitle.textContent = title;
  progressSection.classList.remove("hidden");
  progressBar.style.width = "0%";
  percentText.textContent = "0%";
  sizeText.textContent = "0 MB / 0 MB";
  etaText.textContent = "ETA: --";
}

function hideProgress() {
  progressSection.classList.add("hidden");
  currentTaskId = null;
  if (progressInterval) clearInterval(progressInterval);
}

let currentMode = "video";

async function startDownload(mode, format = null) {
  currentMode = mode;
  if (!currentVideo) {
    showStatus("Fetch video details first.", "error");
    return;
  }

  const url = videoUrlInput.value.trim();
  const payload = {
    url: url,
    mode: mode,
    format_id: format ? format.format_id : ""
  };

  try {
    showProgress(mode === "subtitle" ? "Downloading Subtitles..." : 
                 mode === "audio" ? "Downloading MP3..." : "Downloading Video...");

    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    currentTaskId = data.task_id;
    subscribeProgress(currentTaskId);   // instead of pollProgress();
  } catch (err) {
    hideProgress();
    showStatus(err.message || "Download failed", "error");
  }
}

let progressSource = null;

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

function subscribeProgress(taskId) {
  stopProgressStream();

  // Try SSE first
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
      // Fall back to polling if SSE breaks
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
      sizeText.textContent = `${dlMB} MB / ${totalMB} MB`;
    }
    etaText.textContent = prog.eta ? `ETA: ${Math.round(prog.eta)}s` : "ETA: calculating...";

  } else if (prog.status === "finished") {
    stopProgressStream();
    progressBar.style.width = "100%";
    wrap.setAttribute("aria-valuenow", "100");
    percentText.textContent = "100%";
    showStatus("✅ Download completed! File is saving...", "success");

    addToHistory({
      title: currentVideo?.title || "Untitled",
      url: videoUrlInput.value.trim(),
      mode: currentMode,
      filename: prog.filename,
    });

    setTimeout(() => {
      window.location.href = `/api/download_file/${currentTaskId}`;
      hideProgress();
    }, 400);

  } else if (prog.status === "cancelled") {
    stopProgressStream();
    hideProgress();
    showStatus("Download cancelled.", "error");

  } else if (prog.status === "error") {
    stopProgressStream();
    hideProgress();
    showStatus(prog.error || "Download failed.", "error");
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
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  items.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "history-item";
    const when = new Date(item.timestamp).toLocaleString();
    li.innerHTML = `
      <div style="min-width:0;">
        <div class="hi-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="hi-meta">${escapeHtml(item.mode)} • ${when}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button data-action="reuse" data-idx="${idx}">Reuse URL</button>
        <button data-action="remove" data-idx="${idx}">×</button>
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
      videoUrlInput.focus();
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
  }
});

document.addEventListener("DOMContentLoaded", renderHistory);

// Cancel button
cancelBtn.addEventListener("click", async () => {
  if (!currentTaskId) { hideProgress(); return; }
  try {
    await fetch(`/api/cancel/${currentTaskId}`, { method: "POST" });
  } catch (e) { /* ignore */ }
  stopProgressStream();
  hideProgress();
  showStatus("Download cancelled.", "error");
});

// ====================== BUTTONS ======================
bestBtn.addEventListener("click", () => startDownload("video"));
audioBtn.addEventListener("click", () => startDownload("audio"));
subtitleBtn.addEventListener("click", () => startDownload("subtitle"));
