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
    formatsList.innerHTML = `<div class="format-card"><div><div class="format-title">No formats available</div><div class="format-meta">Try another link.</div></div></div>`;
    return;
  }

  formats.forEach((format) => {
    const card = document.createElement("div");
    card.className = "format-card";

    const left = document.createElement("div");
    const typePill = `<span class="pill ${format.type}">${format.type.toUpperCase()}</span>`;
    left.innerHTML = `
      <div class="format-title">
        ${typePill}
        <span>${escapeHtml(format.label)}</span>
      </div>
      <div class="format-meta">
        File size: ${escapeHtml(format.filesize || "Unknown")} • Format ID: ${escapeHtml(format.format_id)}
      </div>
    `;

    const button = document.createElement("button");
    button.className = "format-btn";
    button.textContent = format.type === "audio" ? "Download Audio" : "Download Video";
    button.addEventListener("click", () => {
      startDownload(format.type, format);
    });

    card.append(left, button);
    formatsList.appendChild(card);
  });
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

async function startDownload(mode, format = null) {
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
    pollProgress();
  } catch (err) {
    hideProgress();
    showStatus(err.message || "Download failed", "error");
  }
}

function pollProgress() {
  if (progressInterval) clearInterval(progressInterval);

  progressInterval = setInterval(async () => {
    if (!currentTaskId) return;

    try {
      const res = await fetch(`/api/progress/${currentTaskId}`, { method: 'POST' });
      const prog = await res.json();

      if (prog.status === "finished") {
        clearInterval(progressInterval);
        hideProgress();
        showStatus("✅ Download completed! Check your downloads folder.", "success");
        // Auto-trigger file download
        window.location.href = `/api/download_file/${currentTaskId}`;
      } else if (prog.status === "downloading") {
        const wrap = document.getElementById("progressBarWrap");
        progressBar.style.width = prog.percent + "%";
        wrap.setAttribute("aria-valuenow", String(prog.percent));
        percentText.textContent = prog.percent + "%";

        const downloadedMB = (prog.downloaded / (1024 * 1024)).toFixed(1);
        const totalMB = prog.total ? (prog.total / (1024 * 1024)).toFixed(1) : "??";
        sizeText.textContent = `${downloadedMB} MB / ${totalMB} MB`;

        etaText.textContent = prog.eta ? `ETA: ${Math.round(prog.eta)}s` : "ETA: calculating...";
      } else if (prog.status === "cancelled") {
        clearInterval(progressInterval);
        hideProgress();
        showStatus("Download cancelled by user.", "error");
      } else if (prog.status === "error") {
        clearInterval(progressInterval);
        hideProgress();
        showStatus(prog.error || "Download failed", "error");
      }
    } catch (e) {}
  }, 800);
}

// Cancel button
cancelBtn.addEventListener("click", async () => {
  if (!currentTaskId) return;
  try {
    await fetch(`/api/cancel/${currentTaskId}`, { method: 'POST' });
    hideProgress();
    showStatus("Download cancelled.", "error");
  } catch (e) {
    console.error("Cancel failed", e);
  }
});

// ====================== BUTTONS ======================
bestBtn.addEventListener("click", () => startDownload("video"));
audioBtn.addEventListener("click", () => startDownload("audio"));
subtitleBtn.addEventListener("click", () => startDownload("subtitle"));
