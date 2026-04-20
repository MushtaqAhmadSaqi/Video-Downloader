# MultiVid - Universal Video Downloader

A clean, local-first starter project for fetching video info and downloading media with **Flask + yt-dlp**.

## What this build does

- Paste a video URL
- Fetch title, thumbnail, uploader, duration, and available formats
- Download a selected format to your device
- Download MP3 audio if **ffmpeg** is installed
- Run everything on **your own computer** for free

## Free resources

- Flask docs: https://flask.palletsprojects.com/
- yt-dlp install guide: https://github.com/yt-dlp/yt-dlp/wiki/Installation
- FFmpeg downloads: https://ffmpeg.org/download.html
- GitHub Pages docs: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- Python downloads: https://www.python.org/downloads/
- Git downloads: https://git-scm.com/downloads
- VS Code: https://code.visualstudio.com/

## Tech stack

- Frontend: HTML, CSS, JavaScript
- Backend: Flask
- Downloader: yt-dlp
- Media processing: ffmpeg
- Hosting for code: GitHub
- Free docs site: GitHub Pages

## Requirements

- Python 3.10+
- pip
- FFmpeg *(for best-quality downloads, audio extraction, and format merging)*

## FFmpeg setup — no PATH editing needed

This project supports a **bundled FFmpeg** approach. You just drop the binaries into the `ffmpeg/` folder and the app detects them automatically. No environment variables, no PATH editing.

### Steps

1. Download a Windows FFmpeg build from <https://github.com/BtbN/FFmpeg-Builds/releases>  
   Pick the file named something like `ffmpeg-master-latest-win64-gpl.zip`
2. Extract the ZIP
3. Inside the extracted folder, open the `bin/` sub-folder
4. Copy **`ffmpeg.exe`** and **`ffprobe.exe`** into this project's `ffmpeg/` folder:

   ```text
   Video-Downloader/
   └── ffmpeg/
       ├── ffmpeg.exe   ← paste here
       └── ffprobe.exe  ← paste here
   ```

5. That's it — run `python app.py` and it will find them.

> **Without FFmpeg:** basic downloads in formats that already contain audio will still work.  
> **With FFmpeg:** best quality, merged video+audio, and MP3 extraction all work.

### Linux / macOS

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run locally

```bash
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

## Project structure

```text
multivid/
├── app.py
├── requirements.txt
├── README.md
├── .gitignore
├── ffmpeg/          ← drop ffmpeg.exe and ffprobe.exe here
│   └── .gitkeep
├── temp/
├── templates/
│   └── index.html
├── static/
│   ├── style.css
│   └── app.js
└── docs/
    ├── index.html
    └── style.css
```

## GitHub Pages

The `docs/` folder contains a static landing page you can publish with GitHub Pages.

### Steps

1. Create a GitHub repository
2. Push this project to the repo
3. Go to **Settings > Pages**
4. Set the publishing source to **Deploy from a branch**
5. Choose your main branch and `/docs` folder
6. Save

Your public docs page will go live after GitHub builds it.

## Important note

This starter project is meant for responsible personal use. Only download content you own or have permission to access.

## Next upgrades you can add later

- subtitle download
- batch downloads
- local download history with localStorage
- drag-and-drop URL input
- progress bars
- playlist handling
- Docker setup
