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
- Öğren ekranı: sadece aktif seviye, seviye seçici çipi + sheet, ünite sonu sandığı (+20 elmas), checkpoint düğümü ve seviye kartı ("X ders kaldı"). Checkpoint ve seviye testi Faz 3'te açıldı.
- Ders bitince adım tamamlanır ve XP kursa yazılır.
- Test: `pnpm test` (loader + path). Tarayıcı önizlemesinde SQLite yerine sql.js çalışır (sadece dev).

**Faz 2 — AI sağlayıcıları + ders üretimi** ✅
- `src/ai.ts`: Ollama, LM Studio (OpenAI uyumlu), OpenAI, Anthropic, Gemini — AI SDK v7. Ayar cihaz geneli (`device_settings.ai`), API anahtarı OS anahtarlığında (Rust `keyring`, `secret_get/secret_set`). İstekler Tauri HTTP eklentisiyle gider (CORS yok).
- Ayarlar > Yapay zekâ sağlayıcısı: sağlayıcı seçimi, sunucu adresi, anahtar, model (bağlantı testi modelleri listeler).
- C6: AI yoksa yeni profil Ayarlar'a düşer, Öğren'de kurulum bandı, ders düğümleri kurulum sheet'i açar.
- `src/activities.ts` registry: her YAML tipi → zod şeması + AI yönergesi + 5 görüntüleyiciden biri (learn / choice / bank / input / match). speak, story, roleplay, video_call v1'de atlanır.
- `src/lessons.ts`: önbellek (`content_cache`, kayıt × adım) → tek çağrıda tüm ders → olmazsa etkinlik başına çağrı (C2, C3). Ders bitince sonraki adım arka planda üretilir; ders üst barındaki ↻ yeniden üretir.
- Cevap kontrolü (C4): normalize edilmiş eşleşme → olmazsa AI anlam kontrolü + kısa geri bildirim. Yanlışta "Açıkla" (C5).
- Şema prompt'a da eklenir ve ```json çitli cevaplar kurtarılır (Ollama bulut modelleri `response_format`'ı yok sayıyor). Yerel sağlayıcılarda `reasoning: "low"` (glm-5.3-flash: 185 sn → 7 sn).
- ✔ Ollama (glm-5.3-flash:cloud) ile 2 ders üretildi ve oynandı. ✔ Anthropic (claude-haiku-4-5): ders şeması + cevap kontrolü, Node betiğiyle (uygulama içi anahtarlık yolu kullanıcıda).

**Faz 3 — İlerleme + tekrar döngüsü** ✅
- `src/progress.ts` (saf, testli): XP, seri + en iyi seri, seri dondurma, günlük hedef (50 XP), 3 günlük görev (XP / 3 ders / 1 alıştırma), hepsi bitince günde 1 sandık. Gün değişimi girişte (`rollDay`).
- Kalpler Ayarlar'dan açılıp kapanır (E2); kapalıyken rozet ve ceza yok. Kalpler günde bir dolar (sayaç yok).
- Yanlış cevap → `mistakes`, doğru tekrar edilince silinir. Öğrenilen kelimeler (learn + match) → `words` (güç 0–5).
- Alıştırma: Hatalarım (son 10 hata) ve Dinleme (en zayıf kelimeler, en az 4 kelime). "Kelimelerim" gerçek listeyi gösterir.
- Checkpoint düğümü ve "Seviyeyi atla" aynı sınav akışı (B8): tüm seviyenin kelime/gramerinden AI sınavı, `required_score` geçilirse seviyenin tüm düğümleri tamamlanır ve kayıt ilerler (geri gitmez). Son seviyede "Kursu bitirdin" kartı.
- Atlandı: `match_madness`, `timed_challenge`, `legendary` — tasarımda ekranı yok (Match Madness Lig ekranında, o da "Yakında"). Faz 4'e.

**Faz 4 — Hikâyeler + Rol Yapma** ✅
- Hikâyeler: aktif seviyenin her ünitesine bir hikâye. AI, ünitenin kelime/gramerinden kısa bir diyalog + 2–3 anlama sorusu yazar (`content_cache`, anahtar `story:<ünite>`, ↻ ile yeniden üretilir). Satırlar tek tek açılır, sesli okunur; dokununca çeviri. Ünite başlayınca açılır (ilk ünite hep açık). Okunan hikâye `story:<ünite>` olarak tamamlanır → Profil'deki "Kitap kurdu" başarımı.
- Rol Yapma: tasarımdaki iki karakter (Lily — otel, Kai — restoran). Serbest yazışma; AI karakterde kalır, seviyeye uygun cevap verir, öğrencinin son mesajını düzeltir (ana dilde kısa açıklama), hedefe ulaşınca bitirir. En fazla 10 mesaj. Sohbet kaydedilmez.
- İkisi de kalp harcamaz; XP + seri + "alıştırma" görevi sayılır.
- Efsanevi (`legendary`): tamamlanmış adıma dokununca "Efsanevi / Tekrar et" sheet'i. Efsanevi ders = aynı adım, öğretici kart yok, bir üst CEFR zorluğunda (`legend:<adım>`, ayrı önbellek). %80 ile geçilirse düğüm altın yıldız olur (`step_progress.legendary`). Ücretsiz — elmas bedeli Mağaza ile birlikte.
- Rehber (B8): ünite başlığındaki buton; ünitenin kelime + gramer listesi. AI çeviri, örnek cümle ve açıklama yazar (`guide:<ünite>` önbelleği); AI yoksa ya da beklenirken YAML listeleri görünür. Kelimeye/örneğe dokununca sesli okunur.
- "Yakında" kalanlar: Konuşma/STT ve Görüntülü arama (D2), Lig, Arkadaşlar, Mağaza, Bildirimler (E1), `match_madness`, `timed_challenge`.

## 5. Kararlar

Tüm açık kararlar: [DECISIONS.md](DECISIONS.md)

## 6. Paketleme (macOS)

- `pnpm tauri build` → `src-tauri/target/release/bundle/macos/loalingo.app` (~10 MB) ve `bundle/dmg/loalingo_<sürüm>_aarch64.dmg` (~5 MB).
- İmza: ad-hoc (`bundle.macOS.signingIdentity: "-"`). Bu Mac'te ve "Yine de aç" ile başka Mac'lerde çalışır. Dağıtım için Developer ID Application sertifikası + notarization gerekir (şu an yalnızca Apple Development sertifikası var).
- `[profile.release.build-override] strip = false`: macOS 27 bağlayıcısıyla strip edilen proc-macro dylib'leri (sqlx-macros) yüklenemiyor. Uygulama binary'si yine strip edilir.
- `tauri-plugin-http` Rust tarafında `~2.7` (npm paketi 2.7.0; sürümler uyuşmazsa `tauri build` durur).
- ✔ Release uygulamasında test edildi: gerçek SQLite (mevcut veriler), Ollama bağlantısı ve ders üretimi (Tauri HTTP), bulut isteği (OpenAI 401 → CORS yok), API anahtarı macOS anahtarlığına yazılıp okunuyor ve veritabanında yok, kullanıcı kurs klasörü (`~/Library/Application Support/com.nuvocode.loalingo/courses`).

