# Dalga 3 / D — Ses sağlayıcıları (TTS + STT) Implementation Plan

**Goal:** Seslendirme sistem sesi ya da Kokoro (yerel, doğal) ile; konuşma tanıma Whisper (yerel) ya da Deepgram (bulut) ile yapılır. İkisi de Ayarlar > Yapay zekâ ve ses satırlarından seçilir. E'nin karakter sesleri için `speak(text, lang, voice)` hazır olur.

**Architecture:**
- `src/voices.ts` (yeni, saf, testli): `pickSystemVoice(voices, lang, gender)` → `{ voice?, pitch }`. Dil başına bilinen macOS ses adları (`en` kadın: Samantha, Karen, Moira, Tessa, Serena, Victoria; erkek: Daniel, Alex, Fred, Oliver, Tom, Rishi; `tr`, `de`, `es`, `fr` için de birkaç ad). Eşleşme yoksa dilin ilk sesi + kadın `1.15`, erkek `0.85` pitch. `gender` yoksa pitch 1.
- `src/wav.ts` (yeni, saf, testli): `wav16(samples: Float32Array, rate = 16000): Uint8Array` (PCM16 mono, 44 baytlık başlık).
- `src/tts.ts` (yeni): `speak(text, lang, voice?: { gender: "f" | "m"; kokoro?: string })`, `stopSpeaking()`. Sağlayıcı `device_settings.tts` (`"system"` varsayılan | `"kokoro"`). Kokoro yalnız `lang` `en` ile başlıyorsa; aksi hâlde sistem sesi. Kokoro yüklenemez ya da üretemezse sistem sesine düşer (`console.error`). Aynı anda tek ses: yeni `speak` öncekini keser (sistem: `speechSynthesis.cancel()`, Kokoro: çalan `AudioBufferSourceNode.stop()` + bekleyen üretimin sonucu atılır — sıra numarası).
  - Kokoro: `kokoro-js` dinamik import. `KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device, progress_callback })`; `device` = `"webgpu"` (`navigator.gpu` varsa) yoksa `"wasm"`; webgpu yüklemesi hata verirse bir kez wasm ile yeniden dener. Model örneği modül düzeyinde bir Promise'te tutulur. `generate(text, { voice })` → `audio.audio` (Float32Array) + `audio.sampling_rate` → Web Audio ile çalınır. Varsayılan ses kadın `af_heart`, erkek `am_michael`.
  - `loadKokoro(onProgress: (0..1) => void)`: ayar modal'ı indirme çubuğu için çağırır.
- `src/Lesson.tsx`: `say()` silinir; tüm çağrılar (`Lesson.tsx`, `Talk.tsx`, `screens/Learn.tsx`) `speak()`'e geçer; `Talk.tsx`'teki `speechSynthesis.cancel()` → `stopSpeaking()`.
- `src/stt.ts`: sağlayıcı `device_settings.stt` (`"whisper"` varsayılan | `"deepgram"`). `sttReady()` sağlayıcıya göre: deepgram → anahtar varsa true (Whisper modeli olmasa da); whisper → bugünkü `stt_ready`. Ayar değişince önbellek sıfırlanır (`resetSttReady()`). `stop()`: deepgram ise `wav16(resample(all, rate))` → `deepgramTranscribe(wav, lang)`.
  - `deepgramTranscribe(wav, lang, key?)`: Tauri HTTP `fetch` ile `POST https://api.deepgram.com/v1/listen?model=nova-3&language=<lang>` (`lang`'ın ilk iki harfi), başlıklar `Authorization: Token <key>`, `Content-Type: audio/wav`. Yanıt `results.channels[0].alternatives[0].transcript`. HTTP hatası → anlamlı `Error`. Anahtar `secret_get/secret_set` ile `stt-key.deepgram` (tarayıcı önizlemesinde localStorage, `ai.ts`'teki gibi).
- `src/screens/VoiceSettings.tsx` (yeni): `TtsRow`, `SttRow` + modal'ları. `Settings.tsx`'te yalnız iki eski satır (ve `ponytail` yorumu) bu iki bileşenle değiştirilir.
  - TTS modal: iki seçenek (Sistem sesi · Kokoro). Kokoro açıklaması: "Daha doğal bir ses. Bilgisayarının hızına göre cümle başına birkaç saniye sürebilir." Kokoro seçilince model iner (ilerleme çubuğu, %); bitince kaydedilir. Hata → sistem sesinde kalır, hata metni gösterilir. "Dinle" önizleme butonu (İngilizce örnek cümle, seçili sağlayıcıyla). Not: "Kokoro yalnız İngilizce seslendirir; diğer dillerde sistem sesi kullanılır."
  - STT modal: iki seçenek (Whisper, yerel · Deepgram, bulut). Deepgram: anahtar alanı (password) + "Bağlantıyı test et" (0,5 sn sessiz WAV gönderir; 200 → "Bağlantı tamam", değilse hata) + Kaydet. Anahtarsız Deepgram kaydedilemez.
  - Satır alt metni seçili sağlayıcıyı gösterir.
- Metinler `en.json` + `tr.json` (`voice.*` bloğu; mevcut `settings.tts/ttsSystem/stt/sttWhisper` kalır, `settings.ttsKokoro`, `settings.sttDeepgram` eklenir). `locales.test.ts` eşitliği korunur.
- CSP zaten `null`, HTTP izinleri `https://*` — değişiklik gerekmez. `pnpm add kokoro-js`.

## Global Constraints

- Kayıtlı iç adlar değişmez. Cihaz geneli ayarlar `device_settings`, gizli anahtarlar Anahtar Zinciri (`secret_get` / `secret_set`).
- `node --test` type-stripping: parametre property yok, `.ts` uzantılı import, `window`'a dokunan modüllerden yalnız `import type`. Saf dosyalar (`voices.ts`, `wav.ts`) tarayıcı API'si import etmez.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Tasks

1. Plan (bu dosya) — commit.
2. `voices.ts` + `wav.ts` + testleri (`voices.test.ts`: bilinen ad eşleşir, eşleşme yoksa pitch; `wav.test.ts`: başlık alanları, uzunluk, kırpma ±1) — commit.
3. `tts.ts` + `kokoro-js` + `say()` → `speak()` geçişi — commit.
4. `stt.ts` Deepgram + `sttReady` sağlayıcıya göre — commit.
5. `VoiceSettings.tsx` + `Settings.tsx` + metinler — commit.

Her görevden sonra: `pnpm test`, `pnpm -s tsc --noEmit -p .`. Rust değişmez.

## Doğrulama

- Tarayıcı önizlemesi (`pnpm dev`, localhost:1420): TTS modal'ında Kokoro seçilir → model iner (ilerleme görünür) → "Dinle" Kokoro sesiyle çalar; derste dinleme sorusu Kokoro ile; Türkçe metin sistem sesiyle. STT modal'ı açılır, anahtarsız Deepgram kaydedilemez.
- Tauri: Kokoro modeli WKWebView'da iner ve çalar (webgpu ya da wasm); uygulama yeniden açıldığında tekrar inmez.
- Deepgram gerçek anahtar olmadan yalnız birim testi + hata yolu (geçersiz anahtar → 401 mesajı) ile doğrulanır.
