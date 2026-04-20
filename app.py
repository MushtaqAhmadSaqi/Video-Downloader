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

# ====================== BUNDLED FFMPEG (your existing code) ======================
BUNDLED_FFMPEG_DIR = BASE_DIR / "ffmpeg"
_bundled_exe = BUNDLED_FFMPEG_DIR / "ffmpeg.exe"

def ffmpeg_available() -> tuple[bool, str | None]:
    if _bundled_exe.is_file():
        try:
            completed = subprocess.run([str(_bundled_exe), "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            if completed.returncode == 0:
                return True, str(BUNDLED_FFMPEG_DIR)
        except OSError:
            pass
    try:
        completed = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        if completed.returncode == 0:
            return True, None
    except FileNotFoundError:
        pass
    return False, None

HAS_FFMPEG, FFMPEG_LOCATION = ffmpeg_available()

# ====================== PROGRESS STORE (for progress bar) ======================
progress_store: dict[str, dict] = {}

def progress_hook(d: dict, task_id: str):
    if d['status'] == 'downloading':
        downloaded = d.get('downloaded_bytes', 0)
        total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
        percent = (downloaded / total * 100) if total else 0
        progress_store[task_id] = {
            "status": "downloading",
            "percent": round(percent, 1),
            "downloaded": downloaded,
            "total": total,
            "eta": d.get('eta', 0)
        }
    elif d['status'] == 'finished':
        progress_store[task_id] = {"status": "finished", "percent": 100}

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
    return jsonify(progress_store.get(task_id, {"status": "waiting", "percent": 0}))

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

        def run_download():
            try:
                ydl_opts["progress_hooks"] = [lambda d: progress_hook(d, task_id)]
                with YoutubeDL(ydl_opts) as ydl:
                    ydl.extract_info(url, download=True)
                # find the downloaded file
                files = [p for p in temp_dir.glob("*") if p.is_file() and not p.name.endswith((".part", ".ytdl"))]
                if files:
                    file_path = max(files, key=lambda p: p.stat().st_size)
                    progress_store[task_id]["file_path"] = str(file_path)
                    progress_store[task_id]["filename"] = file_path.name
                progress_store[task_id]["status"] = "finished"
            except Exception as e:
                progress_store[task_id]["status"] = "error"
                progress_store[task_id]["error"] = str(e)

        # Run download in background thread
        threading.Thread(target=run_download, daemon=True).start()

        return jsonify({"task_id": task_id, "status": "started"})

    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return jsonify({"error": str(e)}), 500

@app.get("/api/download_file/<task_id>")
def api_download_file(task_id: str):
    task = progress_store.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    if task.get("status") != "finished":
        return jsonify({"error": "Download still in progress or failed"}), 400
    file_path_str = task.get("file_path")
    if not file_path_str:
        return jsonify({"error": "File path not found"}), 404
    
    file_path = Path(file_path_str)
    if not file_path.exists():
        return jsonify({"error": "File no longer exists"}), 404
        
    return send_file(file_path, as_attachment=True, download_name=task.get("filename"))

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
