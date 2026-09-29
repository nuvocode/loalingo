Bundled into the app (tauri.conf.json `bundle.resources`).

`ggml-base-q5_1.bin` — Whisper speech model (~57 MB, multilingual) used for speaking exercises and voice calls.
Not in git; fetch it with `pnpm fetch-model` (also run automatically before `tauri build`).
Without it the app works, speaking exercises are just hidden.
