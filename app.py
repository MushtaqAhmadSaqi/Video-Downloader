from __future__ import annotations

import glob
import math
import os
import shutil
import subprocess
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request, send_file
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
DOWNLOAD_ROOT = BASE_DIR / "temp"
DOWNLOAD_ROOT.mkdir(exist_ok=True)

import platform
import sys
import logging

# ====================== CROSS-PLATFORM BUNDLED FFMPEG ======================
BUNDLED_FFMPEG_DIR = BASE_DIR / "ffmpeg"


def _ffmpeg_binary_name() -> str:
    """Return platform-specific ffmpeg binary name."""
    return "ffmpeg.exe" if sys.platform.startswith("win") else "ffmpeg"


def _ffprobe_binary_name() -> str:
    return "ffprobe.exe" if sys.platform.startswith("win") else "ffprobe"


def _candidate_paths() -> list[Path]:
    """All possible locations where bundled ffmpeg may live."""
    name = _ffmpeg_binary_name()
    candidates = [
        BUNDLED_FFMPEG_DIR / name,
        BUNDLED_FFMPEG_DIR / "bin" / name,     # extracted-zip style
    ]
    # On macOS/Linux some users keep it in ./ffmpeg/ without extension
    if not sys.platform.startswith("win"):
        candidates.append(BUNDLED_FFMPEG_DIR / "ffmpeg")
    return candidates


def ffmpeg_available() -> tuple[bool, str | None]:
    """
    Detect ffmpeg on any OS.
    Returns (available, directory_containing_binary_or_None_if_in_PATH).
    """
    # 1. Bundled binary
    for path in _candidate_paths():
        if path.is_file():
            try:
                result = subprocess.run(
                    [str(path), "-version"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                    timeout=5,
                )
                if result.returncode == 0:
                    # Ensure it's executable on Unix
                    if not sys.platform.startswith("win"):
                        path.chmod(path.stat().st_mode | 0o111)
                    return True, str(path.parent)
            except (OSError, subprocess.TimeoutExpired):
                continue

    # 2. System PATH
    sys_ffmpeg = shutil.which("ffmpeg")
    if sys_ffmpeg:
        try:
            result = subprocess.run(
                [sys_ffmpeg, "-version"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
                timeout=5,
            )
            if result.returncode == 0:
                return True, None   # None = let yt-dlp find it via PATH
        except (OSError, subprocess.TimeoutExpired):
            pass

    return False, None


HAS_FFMPEG, FFMPEG_LOCATION = ffmpeg_available()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ====================== PROGRESS STORE & CANCEL SYSTEM ======================
import time
from threading import Event, Lock

progress_store: dict[str, dict] = {}
cancel_events: dict[str, Event] = {}
store_lock = Lock()


class DownloadCancelled(Exception):
    """Raised when user cancels a download."""
    pass


def progress_hook(d: dict, task_id: str):
    # Check cancel flag on every progress tick
    evt = cancel_events.get(task_id)
    if evt and evt.is_set():
        raise DownloadCancelled("Download cancelled by user.")

    with store_lock:
        if d['status'] == 'downloading':
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            percent = (downloaded / total * 100) if total else 0
            progress_store[task_id] = {
                **progress_store.get(task_id, {}),
                "status": "downloading",
                "percent": round(percent, 1),
                "downloaded": downloaded,
                "total": total,
                "eta": d.get('eta', 0),
                "speed": d.get('speed', 0),
                "updated_at": time.time(),
            }
        elif d['status'] == 'finished':
            progress_store[task_id] = {
                **progress_store.get(task_id, {}),
                "status": "merging",  # yt-dlp may still post-process
                "percent": 99,
                "updated_at": time.time(),
            }


# ====================== BACKGROUND CLEANUP ======================
TASK_TTL_SECONDS = 60 * 60       # Remove tasks older than 1 hour
FILE_TTL_SECONDS = 60 * 30       # Remove served files after 30 minutes
CLEANUP_INTERVAL = 60 * 5        # Run cleanup every 5 minutes


def cleanup_worker():
    """Periodically clean orphaned files and stale task entries."""
    while True:
        try:
            now = time.time()

            # 1. Clean progress_store entries
            with store_lock:
                stale_ids = []
                for tid, data in progress_store.items():
                    updated_at = data.get("updated_at", now)
                    status = data.get("status")
                    age = now - updated_at
                    if status in ("finished", "error", "cancelled") and age > FILE_TTL_SECONDS:
                        stale_ids.append(tid)
                    elif age > TASK_TTL_SECONDS:
                        stale_ids.append(tid)

                for tid in stale_ids:
                    data = progress_store.pop(tid, {})
                    cancel_events.pop(tid, None)
                    tmp = data.get("temp_dir")
                    if tmp:
                        shutil.rmtree(tmp, ignore_errors=True)
                    logger.info(f"Cleaned task {tid}")

            # 2. Sweep orphan temp directories older than TTL
            if DOWNLOAD_ROOT.exists():
                for child in DOWNLOAD_ROOT.iterdir():
                    try:
                        if child.is_dir() and (now - child.stat().st_mtime) > TASK_TTL_SECONDS:
                            shutil.rmtree(child, ignore_errors=True)
                            logger.info(f"Removed orphan dir {child}")
                    except OSError:
                        pass

        except Exception:
            logger.exception("cleanup_worker error")

        time.sleep(CLEANUP_INTERVAL)


# Start cleanup thread once at app startup
threading.Thread(target=cleanup_worker, daemon=True).start()

# ====================== YOUR EXISTING HELPER FUNCTIONS ======================
def human_size(num_bytes: int | None) -> str:
    if not num_bytes or num_bytes <= 0:
        return "Unknown"
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num_bytes)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{int(size)} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{num_bytes} B"

def human_duration(seconds: int | float | None) -> str:
    if seconds is None:
        return "Unknown"
    seconds = int(seconds)
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"

def site_name(info: dict[str, Any]) -> str:
    return info.get("extractor_key") or info.get("extractor") or info.get("webpage_url_domain") or "Unknown"

def sanitize_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        raise ValueError("Please paste a video URL.")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise ValueError("URL must start with http:// or https://")
    return url

INFO_YDL_OPTS: dict[str, Any] = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "noplaylist": True,
    "extract_flat": False,
    "ignoreerrors": False,
    **({"ffmpeg_location": FFMPEG_LOCATION} if FFMPEG_LOCATION else {}),
}

def extract_video_info(url: str) -> dict[str, Any]:
    with YoutubeDL(INFO_YDL_OPTS) as ydl:
        return ydl.extract_info(url, download=False)

def clean_formats(info: dict[str, Any]) -> list[dict[str, Any]]:
    # (your existing clean_formats function - unchanged)
    seen: set[tuple[str, str]] = set()
    cleaned: list[dict[str, Any]] = []
    for fmt in info.get("formats", []):
        format_id = str(fmt.get("format_id") or "").strip()
        ext = str(fmt.get("ext") or "").strip()
        if not format_id or not ext:
            continue
        vcodec = fmt.get("vcodec") or "none"
        acodec = fmt.get("acodec") or "none"
        height = fmt.get("height") or 0
        width = fmt.get("width") or 0
        fps = fmt.get("fps") or 0
        filesize = fmt.get("filesize") or fmt.get("filesize_approx") or 0
        note = fmt.get("format_note") or ""
        is_audio_only = vcodec == "none" and acodec != "none"
        is_video = vcodec != "none"
        if not is_audio_only and not is_video:
            continue
        if is_audio_only:
            label = f"Audio only • {ext.upper()}"
            if fmt.get("abr"):
                label += f" • {int(fmt['abr'])} kbps"
            type_key = "audio"
        else:
            res = f"{height}p" if height else (f"{width}w" if width else "Video")
            label = f"{res} • {ext.upper()}"
            if fps:
                label += f" • {fps}fps"
            if note:
                label += f" • {note}"
            if acodec != "none":
                label += " • with audio"
            else:
                label += " • video only"
            type_key = "video"
        dedupe_key = (format_id, type_key)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        cleaned.append({
            "format_id": format_id,
            "type": type_key,
            "ext": ext,
            "label": label,
            "filesize": human_size(filesize),
            "height": height,
            "width": width,
            "fps": fps,
            "abr": fmt.get("abr"),
            "has_audio": acodec != "none",
            "has_video": vcodec != "none",
            "recommended": bool(height and height >= 720 and acodec != "none"),
        })
    def sort_key(item):
        if item["type"] == "audio":
            return (1, -(item.get("abr") or 0), 0, 0)
        return (0, -(item.get("height") or 0), -(item.get("fps") or 0), 0 if item.get("has_audio") else 1)
    cleaned.sort(key=sort_key)
    return cleaned

# ====================== ROUTES ======================
@app.route("/")
def home() -> str:
    return render_template("index.html", ffmpeg_ready=HAS_FFMPEG)

@app.get("/health")
def health() -> Any:
    return jsonify({"ok": True, "ffmpeg": HAS_FFMPEG})

@app.post("/api/info")
def api_info() -> Any:
    # (your existing /api/info route - unchanged)
    try:
        payload = request.get_json(silent=True) or {}
        url = sanitize_url(payload.get("url", ""))
        info = extract_video_info(url)
        if info.get("_type") == "playlist":
            return jsonify({"error": "Playlists are not supported yet. Use a single video URL."}), 400
        return jsonify({
            "title": info.get("title") or "Untitled",
            "thumbnail": info.get("thumbnail"),
            "duration": human_duration(info.get("duration")),
            "uploader": info.get("uploader") or info.get("channel") or "Unknown",
            "site": site_name(info),
            "webpage_url": info.get("webpage_url") or url,
            "formats": clean_formats(info),
            "ffmpeg_ready": HAS_FFMPEG,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.post("/api/progress/<task_id>")
def api_progress(task_id: str):
    with store_lock:
        return jsonify(progress_store.get(task_id, {"status": "waiting", "percent": 0}))


@app.post("/api/cancel/<task_id>")
def api_cancel(task_id: str):
    evt = cancel_events.get(task_id)
    if not evt:
        return jsonify({"error": "Task not found"}), 404
    evt.set()
    with store_lock:
        progress_store[task_id] = {
            **progress_store.get(task_id, {}),
            "status": "cancelled",
        }
    return jsonify({"ok": True, "task_id": task_id})

@app.post("/api/download")
def api_download() -> Any:
    task_id = str(uuid.uuid4())
    temp_dir = Path(tempfile.mkdtemp(prefix="multivid-", dir=DOWNLOAD_ROOT))
    progress_store[task_id] = {"status": "starting", "percent": 0}

    try:
        payload = request.get_json(silent=True) or {}
        url = sanitize_url(payload.get("url", ""))
        mode = (payload.get("mode") or "video").strip().lower()
        format_id = str(payload.get("format_id") or "").strip()

        outtmpl = str(temp_dir / "%(title).80B-%(id)s.%(ext)s")

        ydl_opts: dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "restrictfilenames": True,
            "outtmpl": outtmpl,
            "windowsfilenames": True,
            "cachedir": False,
            **({"ffmpeg_location": FFMPEG_LOCATION} if FFMPEG_LOCATION else {}),
        }

        # ====================== SUBTITLE MODE (English + Auto) ======================
        if mode == "subtitle":
            ydl_opts.update({
                "skip_download": True,
                "writesubtitles": True,
                "writeautomaticsub": True,
                "subtitleslangs": ["en", "en-US", "en-GB"],
                "subtitlesformat": "srt",
                "outtmpl": str(temp_dir / "%(title).80B-%(id)s"),
            })

        # ====================== AUDIO / VIDEO MODE ======================
        elif mode == "audio":
            if not HAS_FFMPEG:
                return jsonify({"error": "Audio extraction requires ffmpeg."}), 400
            ydl_opts["format"] = "bestaudio/best"
            ydl_opts["postprocessors"] = [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}]
        else:
            if format_id:
                ydl_opts["format"] = f"{format_id}+bestaudio/best/{format_id}/best"
            else:
                ydl_opts["format"] = "bestvideo+bestaudio/best"
            if HAS_FFMPEG:
                ydl_opts["merge_output_format"] = "mp4"

        cancel_events[task_id] = Event()

        def run_download():
            try:
                ydl_opts["progress_hooks"] = [lambda d: progress_hook(d, task_id)]
                with YoutubeDL(ydl_opts) as ydl:
                    ydl.extract_info(url, download=True)

                files = [p for p in temp_dir.glob("*") 
                         if p.is_file() and not p.name.endswith((".part", ".ytdl"))]
                if files:
                    file_path = max(files, key=lambda p: p.stat().st_size)
                    with store_lock:
                        progress_store[task_id]["file_path"] = str(file_path)
                        progress_store[task_id]["filename"] = file_path.name
                        progress_store[task_id]["temp_dir"] = str(temp_dir)
                with store_lock:
                    progress_store[task_id]["status"] = "finished"
                    progress_store[task_id]["percent"] = 100

            except DownloadCancelled:
                logger.info(f"[{task_id}] cancelled by user")
                shutil.rmtree(temp_dir, ignore_errors=True)
                with store_lock:
                    progress_store[task_id]["status"] = "cancelled"
            except DownloadError as e:
                logger.warning(f"[{task_id}] yt-dlp error: {e}")
                shutil.rmtree(temp_dir, ignore_errors=True)
                with store_lock:
                    progress_store[task_id]["status"] = "error"
                    progress_store[task_id]["error"] = "Download failed. The URL may be invalid or the site unsupported."
            except Exception as e:
                logger.exception(f"[{task_id}] unexpected error")
                shutil.rmtree(temp_dir, ignore_errors=True)
                with store_lock:
                    progress_store[task_id]["status"] = "error"
                    progress_store[task_id]["error"] = "An unexpected error occurred."

        # Run download in background thread
        threading.Thread(target=run_download, daemon=True).start()

        return jsonify({"task_id": task_id, "status": "started"})

    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return jsonify({"error": str(e)}), 500

@app.get("/api/download_file/<task_id>")
def api_download_file(task_id: str):
    with store_lock:
        task = progress_store.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    if task.get("status") != "finished":
        return jsonify({"error": "Download still in progress or failed"}), 400
    file_path_str = task.get("file_path")
    if not file_path_str or not Path(file_path_str).exists():
        return jsonify({"error": "File no longer exists"}), 404

    response = send_file(
        Path(file_path_str),
        as_attachment=True,
        download_name=task.get("filename"),
    )

    # Mark the task as "served" so cleanup can delete it sooner
    with store_lock:
        progress_store[task_id]["served_at"] = time.time()

    return response

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
