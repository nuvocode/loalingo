# AI yeniden deneme + Kokoro'yu Worker'a taşıma — Implementation Plan

**Goal:** (1) Model eksik/bozuk JSON döndüğünde kullanıcı hata ekranı görmeden 2 kez daha denenir. (2) Ses üretimi arayüzü dondurmaz, üretildiği görünür, ilk ses daha erken başlar.

## Kök nedenler

1. **"Ders oluşturulamadı / goal_reached undefined":** `chatTurn` (`src/lessons.ts:176`) `goal_reached: z.boolean()` ister; model alanı atlamış. `generate()` (`src/ai.ts`) şemaya uymayan yanıtı hiç yeniden denemez: `maxRetries: 1` yalnız ağ/5xx hatalarını kapsar, doğrulama hatası doğrudan `Failed` ekranına düşer.
2. **Donma:** Kokoro `device: "wasm"` ile **ana thread'de** çalışıyor (`src/tts.ts`). onnxruntime-web wasm çıkarımı ana thread'i birkaç saniye bloklar; React çizemez, butonlar tepki vermez, hiçbir gösterge dönemez. Üstüne:
   - Tüm cevap tek parça üretiliyor; ilk ses ancak son cümle bitince başlıyor.
   - Model ilk `speak()` çağrısında yükleniyor, ilk replik ekstra bekliyor.
   - Balona tekrar tıklamak aynı sesi baştan üretiyor.

## Tasarım

### A. `generate()` doğrulama yeniden denemesi (`src/ai.ts`)

- `generate()` gövdesi 3 denemelik bir döngüye alınır (ilk deneme + 2 tekrar).
- Yalnız **yanıt kusurlu** hatalarında tekrar denenir: `NoObjectGeneratedError` (lenient `extractJson` parse'ı da başarısız olduysa), `ZodError`, `extractJson`'ın "no JSON object" hatası. HTTP 4xx (anahtar yanlış, model yok), `AbortError`/timeout ve "AI provider is not set up" **tekrar denenmez**, hemen fırlatılır. Hepsi başarısızsa son hata fırlatılır (bugünkü ekran).
- Ekstra bir şey yok: bekleme/backoff yok (hata sunucu değil model kaynaklı), sayaç UI'ı yok. `// ponytail: sabit 3 deneme; sağlayıcı başına ayar gerekirse config'e taşı`.
- `generatePlain` değişmez (şeması yok).

### B. `goal_reached` hoşgörüsü (`src/lessons.ts`)

> **Uygulamada atlandı:** `.catch(false)` alanı `required`'da tutuyor ama JSON şemasına `"default"` ekliyor; OpenAI strict modunu bozma riski var. A yeterli.

- JSON şemasında alan zorunlu kalır (OpenAI strict mode için), ama parse hoşgörülü olur: `turnSchema` tanımı aynı kalır; `chatTurn` içinde `generate`'e giden şema `turnSchema.extend({ goal_reached: z.boolean().catch(false), correction: z.string().catch("") })` değil — **`z.toJSONSchema` çıktısının değişmediği** doğrulanmadan `.catch` kullanılmaz. Uygulayıcı önce `z.toJSONSchema(z.object({ a: z.boolean().catch(false) }))` çıktısına bakar: `a` hâlâ `required` içindeyse `.catch` doğrudan `turnSchema`'ya eklenir; değilse bu adım atlanır, A tek başına yeterlidir.

### C. Kokoro Web Worker'da (`src/kokoro.worker.ts` yeni, `src/tts.ts`)

- `src/kokoro.worker.ts`: modeli yükler (`KokoroTTS.from_pretrained`, bugünkü parametrelerle: `q8`, `wasm`) ve mesajlara cevap verir:
  - `{ type: "load" }` → ilerleme için `{ type: "progress", p }`, bitince `{ type: "ready" }`, hata `{ type: "error", message }`.
  - `{ type: "speak", id, text, voice }` → `tts.stream(text, { voice })` ile **cümle cümle** üretir; her cümle için `{ type: "chunk", id, audio: Float32Array, rate }` (audio buffer'ı `postMessage(msg, [audio.buffer])` ile transfer edilir), sonunda `{ type: "end", id }`, hata `{ type: "error", id, message }`.
  - `{ type: "cancel", id }` → o id'nin kalan cümleleri üretilmez (worker döngüde id'yi kontrol eder).
- `src/tts.ts`:
  - `loadKokoro(onProgress)` aynı imzayla kalır, worker'ı (`new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" })`) tembel başlatıp `load` gönderir. `VoiceSettings.tsx` değişmez.
  - `speak()` Kokoro yolunda worker'a `speak` gönderir, gelen chunk'ları `AudioContext` üzerinde **arka arkaya kuyruklar** (`src.start(nextTime)`; `nextTime = max(actx.currentTime, nextTime) + buf.duration`). İlk cümle hazır olunca çalmaya başlar.
  - `stopSpeaking()`: `seq++`, worker'a `cancel`, kuyruktaki tüm `AudioBufferSourceNode`'ları durdurur (tek `playing` yerine küçük bir dizi).
  - Hata/timeout (worker 30 sn içinde ilk chunk'ı göndermezse) → bugünkü gibi sistem sesine düşer.
  - **Önbellek:** son 20 `(voice, text)` için üretilen chunk listesi bir `Map`'te tutulur; balona tekrar tıklamak yeniden üretmez. `// ponytail: LRU değil, 20'yi aşınca en eskiyi sil`.
- `speak()` artık `Promise<void>` döner ve ses **bittiğinde** (ya da kesildiğinde) resolve olur; sistem sesi için `utterance.onend/onerror`. Bu, D'deki göstergeyi besler.
- `vite.config.ts`: gerekirse `worker: { format: "es" }`. Tauri'de WKWebView module worker'ı destekler; doğrulamada kontrol edilir.

### D. Sunum (`src/Talk.tsx`)

- `Chat`: `voicing: number | null` state'i — seslendirilen AI balonunun index'i. `say(text, i)` → `setVoicing(i)`; `speak(...).finally(() => setVoicing((v) => v === i ? null : v))`.
- Seslendirilen balonda küçük bir hoparlör ikonu + mevcut `gen-pulse` animasyonu (yeni CSS yok, var olan sınıf). `aria-live` için balona `aria-busy`.
- Sohbet açılınca Kokoro seçiliyse ve dil `en` ise `loadKokoro()` hemen çağrılır (ön ısıtma) — metin üretilirken model paralel yüklenir.
- `Story` aynı `speak` promise'ini kullanır; göstergeye gerek yok (satır zaten tek tek geliyor). Yalnız ön ısıtma eklenir.

### Kapsam dışı (bilerek)

- Metni token token stream edip ilk cümle gelir gelmez seslendirmek (AI SDK `streamText` + partial object). Kazanç büyük ama `generate()` ve tüm sağlayıcılar etkilenir. C'den sonra gecikme hâlâ sorunsa ayrı plan.
- Bulut modellerde `reasoning` ayarı: ölçülmeden değiştirilmez (`src/ai.ts`'teki mevcut not).
- WebGPU: kokoro-js webgpu'da fp32 (~320 MB) istiyor; wasm-in-worker yeterli.

## Global Constraints

- `node --test` type-stripping kuralları (parametre property yok, `.ts` uzantılı import).
- Kayıtlı ayar adları (`tts`, `ai`) değişmez.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Tasks

1. Plan (bu dosya) — commit.
2. A + B: `generate()` yeniden deneme. Test: `src/ai.test.ts` (yoksa yeni) — sahte `LanguageModel` (AI SDK `MockLanguageModelV2`/`V3`, `ai/test`) ilk iki çağrıda `{}` döndürür, üçüncüde geçerli JSON → sonuç döner; üç çağrı da kötü → fırlatır; 401 → tek çağrıda fırlatır. `generate`'in `cfg` parametresi mock'u enjekte etmeye izin vermiyorsa `model()` yerine opsiyonel `LanguageModel` alacak şekilde en küçük değişiklik yapılır. — commit.
3. C: worker + `tts.ts` kuyruk/iptal/önbellek. Saf kısım (`nextTime` hesabı, 20'lik önbellek) küçük bir fonksiyon olarak `src/audio.ts`'e girer ve `src/audio.test.ts`'e birer assert eklenir. — commit.
4. D: `Talk.tsx` göstergesi + ön ısıtma. — commit.

Her görevden sonra: `pnpm test`, `pnpm -s tsc --noEmit -p .`.

## Uygulamada bulunan

- kokoro-js 1.2.1 `stream(string)` kendi oluşturduğu splitter'ı kapatmıyor; son cümle tamponda kalıp generator hiç bitmiyordu. Worker kapalı bir `TextSplitterStream` veriyor.

## Doğrulama

- Tarayıcı önizlemesi (`pnpm dev`, localhost:1420), TTS = Kokoro, İngilizce kurs:
  - Roleplay açılır; ilk replik gelirken ve seslendirilirken input'a yazılabiliyor, X butonu anında tepki veriyor (donma yok). DevTools Performance'ta ana thread'de >200 ms long task yok.
  - Seslendirilen balonda gösterge görünür, ses bitince kaybolur.
  - 2+ cümlelik replikte ilk cümle, tüm replik üretilmeden çalmaya başlar.
  - Balona ikinci tıklamada ses anında başlar (önbellek).
  - Ses çalarken yeni mesaj gönderince / X'e basınca önceki ses hemen kesilir.
- Yeniden deneme: `chatTurn`'e geçici olarak kötü yanıt döndüren bir sağlayıcı (ya da test) ile hata ekranı yalnız 3. başarısızlıktan sonra çıkar.
- Tauri build'inde (`pnpm tauri dev`) worker yüklenir, model yeniden inmez, ses çalar.
