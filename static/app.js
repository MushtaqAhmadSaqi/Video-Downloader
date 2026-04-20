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
      downloadSelected(format);
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

bestBtn.addEventListener("click", async () => {
  if (!currentVideo) {
    showStatus("Fetch video details first.", "error");
    return;
  }
  const bestVideo = (currentVideo.formats || []).find(
    (item) => item.type === "video" && item.has_audio
  ) || (currentVideo.formats || []).find((item) => item.type === "video");

  if (!bestVideo) {
    showStatus("No downloadable video format was found.", "error");
    return;
  }

  await downloadSelected(bestVideo);
});

audioBtn.addEventListener("click", async () => {
  if (!currentVideo) {
    showStatus("Fetch video details first.", "error");
    return;
  }

  await downloadSelected({ mode: "audio" });
});

async function downloadSelected(format) {
  const url = videoUrlInput.value.trim();
  if (!url) {
    showStatus("Missing video URL.", "error");
    return;
  }

  const payload = {
    url,
    format_id: format.format_id || "",
    mode: format.mode || format.type || "video",
  };

  try {
    showStatus("Preparing your download...", "success");

    const response = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      throw new Error(data.error || "Download failed.");
    }

    if (!response.ok) {
      throw new Error("Download failed.");
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const filenameMatch = disposition.match(/filename="?([^\"]+)"?/i);
    const filename = filenameMatch ? filenameMatch[1] : "download.bin";

    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);

    showStatus("Download started. Check your browser downloads.", "success");
  } catch (error) {
    showStatus(error.message || "Download failed.", "error");
  }
}
