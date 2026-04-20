from __future__ import annotations

import glob
import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request, send_file
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
DOWNLOAD_ROOT = BASE_DIR / "temp"
DOWNLOAD_ROOT.mkdir(exist_ok=True)


def ffmpeg_available() -> bool:
    """Return True if ffmpeg is available on PATH."""
    try:
        completed = subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return completed.returncode == 0
    except FileNotFoundError:
        return False


HAS_FFMPEG = ffmpeg_available()


def human_size(num_bytes: int | None) -> str:
    if not num_bytes or num_bytes <= 0:
        return "Unknown"
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num_bytes)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            if unit == "B":
                return f"{int(size)} {unit}"
            return f"{size:.1f} {unit}"
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
}


def extract_video_info(url: str) -> dict[str, Any]:
    with YoutubeDL(INFO_YDL_OPTS) as ydl:
        return ydl.extract_info(url, download=False)


def clean_formats(info: dict[str, Any]) -> list[dict[str, Any]]:
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
        protocol = fmt.get("protocol") or ""

        if protocol in {"m3u8_native", "m3u8"} and not HAS_FFMPEG:
            # These are more likely to be troublesome without ffmpeg.
            pass

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

        cleaned.append(
            {
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
            }
        )

    def sort_key(item: dict[str, Any]) -> tuple[int, int, int, int]:
        if item["type"] == "audio":
            return (1, -(item.get("abr") or 0), 0, 0)
        return (0, -(item.get("height") or 0), -(item.get("fps") or 0), 0 if item.get("has_audio") else 1)

    cleaned.sort(key=sort_key)
    return cleaned


@app.route("/")
def home() -> str:
    return render_template("index.html", ffmpeg_ready=HAS_FFMPEG)


@app.get("/health")
def health() -> Any:
    return jsonify({"ok": True, "ffmpeg": HAS_FFMPEG})


@app.post("/api/info")
def api_info() -> Any:
    try:
        payload = request.get_json(silent=True) or {}
        url = sanitize_url(payload.get("url", ""))
        info = extract_video_info(url)

        if info.get("_type") == "playlist":
            return jsonify({"error": "Playlists are not supported in this free starter build. Please paste a single video URL."}), 400

        return jsonify(
            {
                "title": info.get("title") or "Untitled",
                "thumbnail": info.get("thumbnail"),
                "duration": human_duration(info.get("duration")),
                "uploader": info.get("uploader") or info.get("channel") or "Unknown",
                "site": site_name(info),
                "webpage_url": info.get("webpage_url") or url,
                "formats": clean_formats(info),
                "ffmpeg_ready": HAS_FFMPEG,
            }
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except DownloadError as exc:
        return jsonify({"error": f"Could not fetch this URL. {str(exc).splitlines()[0]}"}), 400
    except Exception:
        return jsonify({"error": "Something went wrong while fetching video details."}), 500


@app.post("/api/download")
def api_download() -> Any:
    temp_dir = Path(tempfile.mkdtemp(prefix="multivid-", dir=DOWNLOAD_ROOT))
    try:
        payload = request.get_json(silent=True) or {}
        url = sanitize_url(payload.get("url", ""))
        mode = (payload.get("mode") or "video").strip().lower()
        format_id = str(payload.get("format_id") or "").strip()

        if mode not in {"video", "audio"}:
            return jsonify({"error": "Invalid download mode."}), 400

        if mode == "audio" and not HAS_FFMPEG:
            return jsonify({"error": "Audio extraction requires ffmpeg. Install ffmpeg first."}), 400

        outtmpl = str(temp_dir / "%(title).80B-%(id)s.%(ext)s")
        ydl_opts: dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "restrictfilenames": True,
            "outtmpl": outtmpl,
            "windowsfilenames": True,
            "cachedir": False,
        }

        if mode == "audio":
            ydl_opts["format"] = "bestaudio/best"
            ydl_opts["postprocessors"] = [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }]
        else:
            if format_id:
                # Merge selected stream with best audio when needed.
                ydl_opts["format"] = f"{format_id}+bestaudio/best/{format_id}/best"
            else:
                ydl_opts["format"] = "bestvideo+bestaudio/best"
            if HAS_FFMPEG:
                ydl_opts["merge_output_format"] = "mp4"

        with YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=True)

        downloaded_files = [
            p for p in temp_dir.glob("*")
            if p.is_file() and not p.name.endswith((".part", ".ytdl"))
        ]
        if not downloaded_files:
            raise FileNotFoundError("No file was produced.")

        file_path = max(downloaded_files, key=lambda p: p.stat().st_size)
        response = send_file(file_path, as_attachment=True, download_name=file_path.name)

        @response.call_on_close
        def cleanup() -> None:
            shutil.rmtree(temp_dir, ignore_errors=True)

        return response
    except ValueError as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return jsonify({"error": str(exc)}), 400
    except DownloadError as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return jsonify({"error": f"Download failed. {str(exc).splitlines()[0]}"}), 400
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return jsonify({"error": "The file could not be downloaded."}), 500


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
