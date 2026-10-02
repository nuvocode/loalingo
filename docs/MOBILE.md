# Sprigo on your phone (companion mode)

The desktop app is the server; the phone's browser is the screen, microphone and speaker. Data, whisper and Ollama stay on the desktop.

## 1. Why it can stay simple

1. **The UI already runs in a browser.** In dev mode the database runs on sql.js ([`src/db.ts`](../src/db.ts) `browserDb`), the AI on `window.fetch` ([`src/ai.ts`](../src/ai.ts)) and STT on Deepgram, all in the browser. No separate PWA layer is needed; only three things depend on Tauri: the database, `transcribe` and the Ollama address.
2. **No audio stream.** Voice activity detection runs in the browser ([`src/stt.ts`](../src/stt.ts) `listen`); what goes to the desktop is one batch of samples when an utterance ends. No WebSocket, a single POST.
3. **The Rust side is small.** SQL is bridged to the desktop webview (`companion-sql` event → `companion_reply`): same connection, same single writer, migrations in place. The bundled UI files are served with `app.asset_resolver()`, or from Vite under `tauri dev`.

## 2. Architecture

```
Phone browser ──HTTPS──▶ tailscale serve ──▶ 127.0.0.1:1430 (Sprigo desktop)
                                             ├─ GET  /*          bundled UI
                                             ├─ POST /sql        execute / select, through the webview
                                             ├─ POST /transcribe whisper (f32 samples)
                                             └─ /ollama/*        → the configured Ollama address
```

- **HTTPS and access: Tailscale.** A phone microphone needs a secure context, so plain HTTP on the LAN does not work. `tailscale serve` provides a valid certificate and limits access to the learner's own tailnet. The server binds to `127.0.0.1` only. No QR pairing, tokens, rate limits, device list or self-signed certificates.
- **Rust:** [`src-tauri/src/companion.rs`](../src-tauri/src/companion.rs), a small HTTP server. Turned on in Settings, off by default.
- **UI:** `isCompanion` next to `isTauri`. Three things change: [`db.ts`](../src/db.ts) uses a remote `SqlDb` adapter, [`stt.ts`](../src/stt.ts) sends `transcribeSamples` to `/transcribe`, and [`ai.ts`](../src/ai.ts) points the Ollama `baseURL` at `location.origin + "/ollama"`. Desktop-only screens (updates, data folder, autostart, notifications) are hidden.
- **One device at a time:** while the phone is connected, the desktop shows "Continuing on your phone"; "Continue here" reloads the data. No merging or conflict resolution.

## 3. Phone limits (iPhone Safari)

- Works: HTTPS through `tailscale serve`, microphone permission and VAD levels, the system voice, the `/ollama` proxy.
- With the phone in silent mode, browser audio (system voice, Piper, Kokoro) is muted; the setup steps say so.
- Kokoro runs out of memory on iOS (`RangeError: Out of memory`, the WASM memory limit), so it is not offered on the phone.
- Piper works on the phone. The phone has its own voice setting (`tts.phone`): the system voice or Piper.

## 4. Out of scope

- A public URL (Cloudflare tunnel), QR pairing, tokens.
- A native mobile app (Tauri iOS/Android).
- Using the phone while the desktop is off.
- Cloud AI providers on the phone: the keys stay in the desktop keychain, so the phone only uses the desktop's Ollama.
