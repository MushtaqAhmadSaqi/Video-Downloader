# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# FFmpeg is bundled by apt here so you don't need the ffmpeg/ folder
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt && pip install gunicorn

COPY . .

# Prepare mutable dirs
RUN mkdir -p temp logs && chown -R 1000:1000 /app
USER 1000:1000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5000/health || exit 1

CMD ["gunicorn", "--workers=2", "--threads=4", "--timeout=120", \
     "--bind=0.0.0.0:5000", "app:app"]
