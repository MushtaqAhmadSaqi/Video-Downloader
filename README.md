# 🎬 MultiVid — Universal Video Downloader

> A clean, local-first video downloader built with **Flask + yt-dlp**.  
> Paste any video URL, pick your quality, and download it directly to your device.

---

## ✨ Features

- 🔗 Paste any video URL (YouTube, Twitter/X, Instagram, Facebook, TikTok, and 1000+ sites)
- 📋 Fetch video title, thumbnail, uploader, and duration before downloading
- 🎞️ Browse all available formats and quality levels
- ⬇️ Download your chosen format directly to your browser
- 🎵 Extract MP3 audio (requires FFmpeg)
- 🔀 Auto-merge best video + best audio into a single MP4 (requires FFmpeg)
- 🪟 **Bundled FFmpeg support** — no PATH editing, no system setup
- 🌐 Runs entirely on your own computer — no data sent to any cloud

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.10+ · Flask |
| Downloader | yt-dlp |
| Media processing | FFmpeg (bundled) |
| Frontend | HTML · CSS · Vanilla JavaScript |
| Code hosting | GitHub |
| Public landing page | GitHub Pages (`docs/`) |

---

## 📁 Project Structure

```text
Video-Downloader/
├── app.py                  ← Flask backend
├── requirements.txt        ← Python dependencies
├── README.md
├── .gitignore
│
├── ffmpeg/                 ← Drop ffmpeg.exe & ffprobe.exe here
│   └── .gitkeep
│
├── templates/
│   └── index.html          ← Main UI page
│
├── static/
│   ├── style.css           ← Styling
│   └── app.js              ← Frontend logic
│
├── temp/                   ← Temporary download files (auto-cleaned)
│
└── docs/                   ← Static GitHub Pages landing page
    ├── index.html
    └── style.css
```

---

## ⚙️ Installation

### Prerequisites

- **Python 3.10+** — download from [python.org](https://www.python.org/downloads/) *(use the installer, not the Microsoft Store version)*
- **Git** — download from [git-scm.com](https://git-scm.com/downloads)

> ⚠️ **Windows Store Python** can cause venv issues. If you installed Python from the Microsoft Store, uninstall it and reinstall from [python.org](https://www.python.org/downloads/) instead.

### Step 1 — Clone the project

```bash
git clone https://github.com/MushtaqAhmadSaqi/Video-Downloader.git
cd Video-Downloader
```

### Step 2 — Create a virtual environment

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 3 — Install Python dependencies

```bash
pip install -r requirements.txt
```

---

## 🎞️ FFmpeg Setup — No PATH editing needed

This project uses a **bundled FFmpeg** approach. You simply drop the binaries into the `ffmpeg/` folder and the app detects them automatically — no environment variables, no PATH editing, no terminal restarts.

### Why FFmpeg?

| Situation | Without FFmpeg | With FFmpeg |
|---|---|---|
| Basic video download | ✅ Works | ✅ Works |
| High-quality merged video+audio | ❌ May fail | ✅ Works |
| MP3 audio extraction | ❌ Not available | ✅ Works |
| 1080p / 4K downloads | ⚠️ Limited | ✅ Full support |

### How to set it up

1. Go to: **https://github.com/BtbN/FFmpeg-Builds/releases**
2. Download the file named `ffmpeg-master-latest-win64-gpl.zip`
3. Extract the ZIP
4. Inside the extracted folder, open the **`bin/`** sub-folder
5. Copy **`ffmpeg.exe`** and **`ffprobe.exe`** into this project's `ffmpeg/` folder:

```text
Video-Downloader/
└── ffmpeg/
    ├── ffmpeg.exe    ← paste here
    └── ffprobe.exe   ← paste here
```

6. Done — the app will find them automatically on next start.

> **Note:** The `ffmpeg/` folder exists in the repo but the `.exe` files are excluded from git (see `.gitignore`). Each person who clones the project adds their own FFmpeg binaries.

---

## ▶️ Running the App

```bash
python app.py
```

Then open your browser and go to:

```
http://127.0.0.1:5000
```

---

## 📖 How to Use

1. Open `http://127.0.0.1:5000` in your browser
2. Paste a video URL into the input field
3. Click **Fetch** — the app will show title, thumbnail, and all available formats
4. Select your preferred quality from the list
5. Click **Download** — the file will be saved to your device
6. For audio-only, select a format and click **Download as MP3** (requires FFmpeg)

---

## 🌍 Supported Sites

yt-dlp supports **1000+ websites**, including:

- YouTube
- Twitter / X
- Instagram
- Facebook
- TikTok
- Reddit
- Vimeo
- Dailymotion
- Twitch clips
- SoundCloud
- And many more — see the full list at [yt-dlp supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)

---

---

## 🐳 Docker Deployment

### One-command run
```bash
docker compose up -d --build
```
Then visit `http://localhost:5000`.

### Rebuild after code changes
```bash
docker compose up -d --build --force-recreate
```

### View logs
```bash
docker compose logs -f multivid
```

### Stop
```bash
docker compose down
```

### Production tips
- Put a reverse proxy (Caddy / nginx / Traefik) with HTTPS in front.
- For multiple workers across machines, switch Flask-Limiter storage from `memory://` to `redis://redis:6379`.
- Mount `./logs` and `./temp` as named volumes for persistence.

---

## 🗺️ Planned Improvements

The following features have been implemented or are planned:

### Core Features
- [x] **Real-time progress bar** — live download progress using SSE
- [ ] **Playlist support** — detect and download full playlists
- [ ] **Batch download** — paste multiple URLs
- [x] **Subtitle download** — fetch and embed subtitles (experimental)

### User Experience
- [x] **Download history** — remember past downloads using localStorage
- [ ] **Drag-and-drop URL input**
- [x] **Format filter** — filter by video, audio, resolution, or type
- [ ] **Copy-to-clipboard button**
- [x] **Dark/light mode toggle**

### Quality & Output
- [ ] **Custom output filename**
- [ ] **Quality presets**
- [ ] **Thumbnail download**
- [ ] **Metadata embedding**

### Infrastructure
- [x] **Docker setup** — one-command deploy with Docker Compose
- [x] **Rate limiting** — protect against abuse
- [x] **Logging & error reporting** — robust error handling and server-side logs

---

## 🌐 GitHub Pages

The `docs/` folder contains a public landing page you can host with GitHub Pages.

### Setup

1. Create a GitHub repository and push this project
2. Go to **Settings → Pages**
3. Set source to **Deploy from a branch**
4. Choose your main branch and the `/docs` folder
5. Click **Save**

Your public page will be live at `https://your-username.github.io/your-repo/`

---

## 📎 Useful Links

| Resource | Link |
|---|---|
| Flask documentation | https://flask.palletsprojects.com/ |
| yt-dlp GitHub | https://github.com/yt-dlp/yt-dlp |
| yt-dlp supported sites | https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md |
| FFmpeg builds for Windows | https://github.com/BtbN/FFmpeg-Builds/releases |
| Python downloads | https://www.python.org/downloads/ |
| Git downloads | https://git-scm.com/downloads |
| GitHub Pages docs | https://docs.github.com/en/pages |

---

## ⚠️ Important Notice

This project is intended for **responsible personal use only**.  
Only download content that you own or have explicit permission to access.  
Respect copyright laws and the terms of service of each platform.

---

## 📄 License

MIT — free to use, modify, and share.
