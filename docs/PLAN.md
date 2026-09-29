# loalingo — Uygulama Planı (v1)

Local-first, AI destekli masaüstü dil öğrenme uygulaması. Tasarım kaynağı: `docs/design/index.html`.

## 1. Tasarımdan çıkanlar

- Tek dosyalık prototip: vanilla JS, hash router, `Nunito`, CSS token'ları `:root` üzerinde.
- Ekranlar: Öğren, Pratik, Lig, Mağaza, Profil, Hikâyeler, Rol Yapma, Arkadaşlar, Bildirimler, Ayarlar + ders overlay'i, bottom sheet, toast, sağ ray (seri/XP/günlük görev).
- Egzersiz bileşenleri hazır: `choice` (dinle varyantı dahil), `bank` (kelime bankası), `speak`.
- **Dark mode yarım var**: `html[data-theme="dark"]` token'ları tanımlı ama açma düğmesi yok ve inline sabit renkler (`#fff3d6`, `#e9f9d8`, `#ffe3e3`, `#fff`, `color:#fff` vb.) temaya uymuyor. İş = bu sabitleri token'a çevirmek + Ayarlar'a tema seçimi (Sistem / Açık / Koyu).

## 2. Teknoloji önerisi

| Katman | Seçim | Neden |
|---|---|---|
| Masaüstü kabuk | **Tauri 2** | Küçük binary, local-first, native keychain/FS/SQLite eklentileri |
| UI | React + Vite + TypeScript | Prototipteki template-string yapısı bileşene birebir dönüşür |
| Stil | Prototipin CSS'i olduğu gibi (tek global CSS) | Piksel sadakati için en kısa yol; Tailwind'e çevirmiyoruz |
| AI | Vercel AI SDK (`ai`) + `@ai-sdk/openai`, `/anthropic`, `/google`, `ollama-ai-provider` | Tek arayüz, `generateObject` + zod ile yapılandırılmış çıktı. LM Studio = OpenAI-uyumlu baseURL |
| Ağ | `@tauri-apps/plugin-http` | Ollama/LM Studio/API çağrılarında CORS sorunu yok |
| Veri | SQLite (`@tauri-apps/plugin-sql`) | İlerleme, hatalar, üretilmiş içerik cache'i |
| API anahtarları | OS keychain (Tauri keyring eklentisi) | Anahtarlar düz dosyada durmaz |
| Arayüz dili | `react-i18next`, `src/locales/<iso>.json` | Varsayılan `en`, v1'de `tr` de; yeni dil = yeni JSON dosyası |
| Kurs dosyaları | `yaml` + zod şema doğrulaması | Hatalı YAML açık hata mesajıyla reddedilir |
| Ses | Web Speech `speechSynthesis` (TTS) | Dinleme etkinlikleri ücretsiz çalışır |

Not: WKWebView'de `SpeechRecognition` yok → **Konuşma / Speak / Video Call v1'de "Yakında"**. Sonraki aşama: lokal Whisper (whisper.cpp) veya sağlayıcı STT.

## 3. Mimari

```
courses/*.yml ──► Course Loader (yaml + zod) ──► Course Tree (CEFR → Ünite → Adım)
                                                     │
                                          Öğren ekranı (path)
                                                     │ tıkla
                                                     ▼
            Lesson Planner: adımın activities listesi (+ vocabulary, grammar, seviye)
                                                     │
            Activity Registry: type → { zod şema, prompt şablonu, React bileşeni }
                                                     │
            AI Provider (seçili) ── generateObject ──► doğrula ─► cache (SQLite) ─► render
                                                     │
            Cevaplar ─► ilerleme / XP / Mistakes tablosu ─► Pratik modları
```

### 3.1 Kurs YAML sözleşmesi

Hiyerarşi: `levels.{A1..C2}.units[].steps[].activities[]` + `levels.X.checkpoint`.
UI eşlemesi: **Bölüm = CEFR seviyesi**, **Ünite = unit** (renkli başlık kartı), **path düğümü = step**, **ünite sandığı / checkpoint = seviye sonu**.

Kurallar:
- Activity yalnızca `type` (+ opsiyonel `count`, `scenario`, `goal` gibi yönlendirme ipuçları) taşır; **tüm içeriği AI üretir** (step'in `title`, `description`, `vocabulary`, `grammar`, seviye bağlamıyla). Karar: DECISIONS B5.
- Sonuç: AI sağlayıcısı kurulmadan ders açılmaz → ilk açılışta kurulum akışı (DECISIONS C6).
- Ek alan: `count` (o etkinlikten kaç soru üretileceği, varsayılan 1–3). "Her ders için eklenebilir pratik sayısı" bu.
- Kaynak/hedef dil: dosya hedef dili tanımlar; kullanıcının ana dili ayardan gelir (çeviri alanları AI tarafından ana dile göre üretilir).

⚠️ Örnek YAML'da `name` ve `iso` iki kez tanımlı — strict parser hata verir, tekilleştireceğiz.

### 3.2 Etkinlik tipleri (kanonik id'ler)

Bir kısmı **soru tipi**, bir kısmı soru tiplerinden oluşan **pratik modu**. Ayrım kodu küçültür:

| id | Etkinlik | v1 | Bileşen |
|---|---|---|---|
| `learn` | Öğret (yeni kelime/ifade kartı) | ✅ | yeni |
| `translate` | Çeviri (serbest yazma, AI/normalize kontrol) | ✅ | yeni |
| `word_select` | Kelime seçme | ✅ | `choice` |
| `match` | Kelime eşleştirme | ✅ | yeni |
| `word_bank` | Kelime bankası | ✅ | `bank` |
| `fill_blank` | Boşluk doldurma | ✅ | `choice`/input |
| `multiple_choice` | Çoktan seçmeli | ✅ | `choice` |
| `listen_type` | Dinle ve yaz | ✅ | TTS + input |
| `listen_select` | Dinle ve seç | ✅ | `choice` + listen |
| `image_select` | Resim → kelime (görsel = emoji) | ✅ | `choice` grid |
| `sentence_complete` | Cümle tamamlama | ✅ | `choice` |
| `error_correct` | Hata düzeltme | ✅ | `choice`/input |
| `dialogue` | Karakter diyaloğu | ✅ | `choice` + balonlar |
| `speak` | Konuşma | 🔜 | `speak` (tasarım var) |
| `story` | Hikâyeler | 🔜 faz 2 | — |
| `roleplay` | Roleplay (AI sohbet) | 🔜 faz 2 | — |
| `video_call` | Video Call | 🔜 | — |

**Pratik modları** (Pratik ekranı; yeni tip değil, yukarıdakilerin kombinasyonu):
`listen` (dinleme tipleri) · `speak` 🔜 · `words` (öğrenilmiş kelimeler) · `mistakes` (hata tablosundan) · `match_madness` (`match` + süre) · `timed_challenge` (karışık + süre) · `legendary` (tamamlanmış ünite, bir üst CEFR zorluğunda).

Döngü eşlemesi: Öğret=`learn` → Tanı=`word_select/image_select` → Hatırla=`match` → Üret=`word_bank/translate` → Dinle=`listen_*` → Konuş=`speak` → Hata yap → `mistakes` tekrarı.

### 3.3 AI katmanı

- Her tip için tek zod şeması; `generateObject` ile çağrı. Geçersiz çıktı → 1 retry → "üretilemedi, tekrar dene" hata durumu.
- Prompt = sistem (öğretmen rolü, CEFR seviyesi, ana dil, hedef dil) + step bağlamı + tip şeması + önceki hatalar (varsa).
- Bir ders tek çağrıda tüm activity listesi için üretilir (daha hızlı, tutarlı); küçük lokal modeller zorlanırsa tip başına çağrıya düşer.
- Cache: `(course, step, activityIndex, seed)` anahtarıyla SQLite. Dersi tekrar açınca anında; "Yeniden üret" ile yenilenir. Sonraki dersi arka planda önceden üret.
- Sağlayıcılar: Ollama (`localhost:11434`), LM Studio (`localhost:1234/v1`), OpenAI, Anthropic, Gemini. Ayarlar'da: sağlayıcı seç, baseURL/anahtar, model listesi, "Bağlantıyı test et".

## 4. Aşamalar

**Faz 0 — İskelet + tasarım portu**
- Tauri 2 + React + Vite + TS kurulumu.
- Prototip CSS'ini global CSS'e taşı; tüm ekranları bileşenlere çevir (mock veriyle, piksel eşleşmesi).
- i18n baştan: tüm metinler `en.json` / `tr.json`'a; Ayarlar'da arayüz dili seçimi.
- Dark mode: sabit renkleri token'a çevir, Ayarlar'a tema seçimi, `prefers-color-scheme` desteği.
- ✔ Kabul: prototip ile yan yana ekran görüntüleri açık/koyu eşleşiyor (1366×768, 1440×900, 1920×1080 + dar pencere).

**Faz 1 — Profiller + kurs motoru** ✅
- SQLite (`src/db.ts`, DECISIONS E4–E6): `device_settings`, `profiles` (seri/elmas/kalp/görevler tek `stats` JSON kolonunda), `enrollments` (profil × kurs: seviye, XP), `step_progress`. `mistakes` / `words` / `content_cache` tabloları onları yazan özelliklerle (Faz 2–3) gelir.
- Profil seçme / oluşturma / PIN ekranları (`src/screens/Profiles.tsx`); son profil PIN'siz ise otomatik açılır. Ayarlar > "Çıkış yap" → profil seçme; "Profili düzenle" (ad, renk, ana dil, PIN).
- Tema ve arayüz dili profile yazılır (giriş ekranı için son seçim localStorage'da kalır).
- Kurs değiştirme sheet'i: ray bayrak çipi + Ayarlar > Kurs; "Yeni dil ekle".
- YAML şeması (zod, `src/course.ts`), `courses/en.yml` (A1: 10 ünite, 40 adım + checkpoint). Kullanıcı kursları: `~/Library/Application Support/com.nuvocode.loalingo/courses/*.yml` (aynı iso gömülüyü ezer). Bozuk dosya Öğren ekranında dosya + yol + nedenle gösterilir.
- Öğren ekranı: sadece aktif seviye, seviye seçici çipi + sheet, ünite sonu sandığı (+20 elmas), checkpoint düğümü ve seviye kartı ("X ders kaldı"). Checkpoint ve seviye testi butonları Faz 3'e kadar "Yakında".
- Ders içeriği hâlâ örnek sorular (Faz 2'de AI); ders bitince adım tamamlanır ve XP kursa yazılır.
- Test: `pnpm test` (loader + path). Tarayıcı önizlemesinde SQLite yerine sql.js çalışır (sadece dev).

**Faz 2 — AI sağlayıcıları + ders üretimi**
- Sağlayıcı ayar ekranı + keychain + bağlantı testi.
- Activity registry ve v1 bileşenleri (tablodaki ✅'ler); ders overlay'i akışı (kalp, ilerleme, doğru/yanlış footer, sonuç ekranı).
- Loading / hata / boş durumları (model yok, bağlantı yok).
- ✔ Kabul: Ollama ve bir bulut sağlayıcıyla aynı ders üretiliyor ve oynanıyor.

**Faz 3 — İlerleme + tekrar döngüsü**
- XP, seri, günlük hedef, kalpler (lokal).
- Hata kaydı → `mistakes`; öğrenilen kelimeler → `words`; `listen`, `match_madness`, `timed_challenge`, `legendary` modları.
- Checkpoint (seviye sonu, `required_score`) + seviye ayırıcı kartı ("A2'ye X ders kaldı") + "Seviyeyi atla" testi (DECISIONS B8).

**Faz 4 — Sonraki aşama (şimdilik "Yakında")**
- Hikâyeler, Rol Yapma (AI sohbet), Konuşma/STT, Video Call.
- Lig, Arkadaşlar, Mağaza (sosyal/ekonomi — local-first'te anlamı ayrıca konuşulmalı), Bildirimler (OS bildirimi ile hatırlatma olabilir).

## 5. Kararlar

Tüm açık kararlar: [DECISIONS.md](DECISIONS.md)
