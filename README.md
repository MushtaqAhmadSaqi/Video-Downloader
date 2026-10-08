# MultiVid — Video Downloader

A local video downloader built with Flask + yt-dlp. Download videos from YouTube, Twitter, Instagram, and 1000+ sites directly to your device.

---

## Features

- Download videos in any quality
- Extract MP3 audio (with FFmpeg)
- Browse all available formats before downloading
- Real-time download progress
- Dark/light theme
- Runs locally — no cloud, no tracking

---

## Quick Start

### 1. Clone the project
```bash
git clone https://github.com/MushtaqAhmadSaqi/Video-Downloader.git
cd Video-Downloader
```

### 2. Set up Python environment
```bash
python -m venv venv
venv\Scripts\activate
python -m pip install -r requirements.txt
```

### 3. Add FFmpeg (optional — needed for MP3 & HD video)
1. Download from https://github.com/BtbN/FFmpeg-Builds/releases
2. Get `ffmpeg-master-latest-win64-gpl.zip` and extract it
3. Copy `ffmpeg.exe` and `ffprobe.exe` from the `bin/` folder into the project's `ffmpeg/` folder

### 4. Run
```bash
venv\Scripts\python.exe app.py
```

Open http://127.0.0.1:5000 in your browser.

---

## Usage

1. Paste any video URL
2. Click **Get Info** to fetch video details
3. Pick a format from the list
4. Click **Download** — file saves to your device

---

## Supported Sites

YouTube, Twitter/X, Instagram, Facebook, TikTok, Reddit, Vimeo, Dailymotion, Twitch, SoundCloud, and 1000+ more.

---

## Docker

```bash
docker compose up -d --build
```

Then visit http://localhost:5000

---

## Tech Stack

- **Backend:** Python 3.10+ · Flask
- **Downloader:** yt-dlp
- **Media:** FFmpeg (bundled)
- **Frontend:** HTML · CSS · JavaScript

---

## Project Structure

```
Video-Downloader/
├── app.py              # Flask backend
├── requirements.txt     # Python dependencies
├── ffmpeg/              # Put ffmpeg.exe & ffprobe.exe here
├── templates/
│   └── index.html       # Main UI
├── static/
│   ├── style.css        # Styles
│   └── app.js           # Frontend logic
├── docs/                # GitHub Pages landing page
└── temp/                # Temporary files (auto-cleaned)
```

---

## License

MIT — free to use and modify.