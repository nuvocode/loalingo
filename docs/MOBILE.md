# Telefondan Sprigo (companion mode)

**Durum:** Plan onaylandı (2026-10-01) · **Epic:** SPR-4 · **Branch:** `feature/mobile-companion` → `test`

Masaüstü uygulama sunucu olur; telefon tarayıcısı ekran, mikrofon ve hoparlör olur. Veri, whisper ve Ollama masaüstünde kalır.

## 1. Neden basit kalabiliyor

1. **Arayüz zaten tarayıcıda çalışıyor.** Dev modda veritabanı sql.js ile (`src/db.ts` `browserDb`), AI `window.fetch` ile (`src/ai.ts`), STT Deepgram ile tarayıcıda çalışır. Ayrı bir PWA katmanı gerekmez; Tauri'ye bağlı yalnızca üç nokta var: veritabanı, `transcribe`, Ollama adresi.
2. **Ses akışı yok.** VAD tarayıcıda çalışır (`src/stt.ts` `listen`); masaüstüne giden şey cümle bitince tek seferlik ses örnekleridir. WebSocket gerekmez, tek POST yeter.
3. **Rust tarafı hazır.** `tauri_plugin_sql::DbInstances` uygulamanın açık havuzunu verir (aynı veritabanı, aynı bağlantı). Gömülü arayüz dosyaları `app.asset_resolver()` ile servis edilir.

## 2. Mimari

```
Telefon tarayıcısı ──HTTPS──▶ tailscale serve ──▶ 127.0.0.1:PORT (Sprigo masaüstü)
                                                  ├─ GET  /*          gömülü arayüz
                                                  ├─ POST /sql        execute / select, aynı havuz
                                                  ├─ POST /transcribe whisper (f32 örnekler)
                                                  └─ /ollama/*        → yapılandırılmış Ollama adresi
```

- **HTTPS ve erişim: Tailscale.** Mobil mikrofon secure context ister; LAN'da düz HTTP ile çalışmaz. `tailscale serve` geçerli sertifika verir ve erişimi kullanıcının tailnet'iyle sınırlar. Sunucu yalnızca `127.0.0.1`'e bağlanır. QR, token, rate limit, cihaz listesi ve self-signed sertifika yok.
- **Rust:** `src-tauri/src/companion.rs`, küçük bir HTTP sunucusu. Ayarlar'dan açılır, varsayılan kapalı.
- **Arayüz:** `isTauri` yanında `isCompanion`. Üç nokta değişir: `db.ts` uzak `SqlDb` adaptörü, `stt.ts` `transcribeSamples` → `/transcribe`, `ai.ts` Ollama `baseURL` → `location.origin + "/ollama"`. Masaüstüne özel ekranlar (güncelleme, veri klasörü, otomatik başlatma, bildirim) gizlenir.
- **Tek cihaz kuralı:** Telefon bağlıyken masaüstü "Telefonda devam ediyor" ekranını gösterir; "Burada devam et" veriyi yeniden yükler. Birleştirme ve çakışma çözümü yok.

## 3. Görevler

| # | İş | Kabul |
|---|---|---|
| 1 | Spike (kod yok): dev arayüzü `tailscale serve` ile telefonda aç; mic, TTS (sistem sesi ve Kokoro WASM), mobil düzen | Kısa rapor; sorun varsa plan revize |
| 2 | Rust sunucu: arayüz, `/sql`, `/transcribe`, `/ollama` aktarımı, Ayarlar'da aç/kapat | Telefonda aynı profil ve ilerleme görünür |
| 3 | Arayüz companion modu: uzak veritabanı, STT, Ollama; masaüstüne özel ekranlar gizli | Telefonda canlı ders uçtan uca çalışır |
| 4 | Masaüstü "telefonda" ekranı + Ayarlar'da kurulum talimatı (`tailscale serve` komutu, adres) | İki cihaz aynı anda veriyi bozmaz |

## 4. Kapsam dışı

- Public URL (Cloudflare tunnel), QR eşleştirme, token.
- Native mobil uygulama (Tauri iOS/Android).
- Masaüstü kapalıyken telefonda çalışma.
- Bulut AI sağlayıcıları: anahtarlar masaüstü keychain'inde kalır; v1'de telefon yalnızca masaüstündeki Ollama'yı kullanır.
