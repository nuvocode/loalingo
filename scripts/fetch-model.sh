#!/bin/sh
# Downloads the bundled Whisper model once (src-tauri/resources/README.md). Idempotent.
set -e
f="src-tauri/resources/ggml-base-q5_1.bin"
[ -s "$f" ] && exit 0
echo "Fetching Whisper model (~57 MB)…"
curl -fL --retry 3 -o "$f.part" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin"
mv "$f.part" "$f"
