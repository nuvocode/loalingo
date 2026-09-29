# v1.0 yol haritası — tasarım

**Tarih:** 2026-09-29 · **Durum:** Onaylandı · **Kapsam dışı:** notarization (geliştirici hesabı yok), loalingo ↔ Verba köprüsü

Bu belge 1.0 öncesi on alt projeyi (A–J) tanımlar. Her alt proje kendi uygulama planını alır ve kendi branch'inde geliştirilir.

## Sıra ve bağımlılıklar

| Dalga | Alt proje | Bağımlılık |
|---|---|---|
| 1 | **A** Migration + LICENSE | — |
| 2 | **B** Veri konumu, kilit, yedek · **C** Ayarlar düzeni + profiller · **F** Cevaba itiraz · **G** Bahçe teması · **I** İngilizce C1/C2 | A |
| 3 | **D** Ses sağlayıcıları (TTS + STT) | C |
| 4 | **E** Rol Yapma | D |
| 5 | **H** Arayüz dilleri DE/ES/FR | C–G bitmiş olmalı (çeviriler son metinlerle) |
| 6 | **J** Yeni isim | hepsi |

Dalga 2'deki işler paralel subagent'larla, her biri ayrı git worktree ve branch'te yürür. Her branch: `tsc` + testler yeşil → `reviewer` agent'ı diff'i inceler → ekran değişikliği varsa tarayıcı önizlemesinde doğrulanır → `master`'a merge. `src/locales/en.json` ve `tr.json` birden çok dalda değişir; çakışmalar merge sırasında çözülür.

Genel kurallar:
- Kayıtlı veride geçen iç adlar değişmez (`hearts`, `streak`, `chests`, `gems`, `legendary`, `practice-madness` vb.). Yalnızca kullanıcıya görünen metin ve ikonlar değişir.
- Yeni her kullanıcı metni `en.json` ve `tr.json`'a eklenir. DE/ES/FR H'de çevrilir.
- Cihaz geneli ayarlar `device_settings` tablosunda, gizli anahtarlar macOS Anahtar Zinciri'nde (`secret_get` / `secret_set`) tutulur.

---

## A. Migration sistemi + LICENSE

**Sorun:** `src/db.ts` şemayı yalnızca `CREATE TABLE IF NOT EXISTS` ile kurar; sürüm takibi yok. İlk şema değişikliğinde mevcut kullanıcıların tabloları güncellenmez.

**Tasarım:**
- `SCHEMA` metni sıralı bir listeye dönüşür: `MIGRATIONS: { v: number; sql: string }[]`. `v: 1` bugünkü şemanın aynısıdır.
- Açılışta `PRAGMA user_version` okunur. `user_version < v` olan her migration sırayla, kendi transaction'ında uygulanır ve ardından `PRAGMA user_version = v` yazılır.
- Mevcut kurulumlarda `user_version = 0` ve tablolar vardır. v1 `IF NOT EXISTS` kullandığından sorunsuz geçer.
- `user_version` > bilinen en yüksek sürüm ise açılış durur, "Bu veri daha yeni bir loalingo sürümüyle oluşturulmuş. Uygulamayı güncelle." mesajı gösterilir. Eski sürüm yeni veriye yazmaz.
- Bir migration uygulanmadan önce (yalnızca Tauri'de, dosya varsa) veritabanı `backups/pre-v<n>.db` olarak kopyalanır. Kopyalama Rust komutuyla yapılır.
- Migration çalıştırıcı saf bir fonksiyondur (`runMigrations(db, migrations)`); sql.js ile Node'da test edilir: boş veritabanı → son sürüm; v1 veritabanı → son sürüm; gelecek sürüm → hata.

**LICENSE:** Kök dizine MIT lisansı (telif: Özer Özdaş, 2026). README'ye "License: MIT" bölümü.

## B. Veri konumu, kilit, yedekleme

**Karar:** Veri klasörü seçilebilir (harici SSD, Google Drive, iCloud). Aynı anda yalnızca tek cihaz yazabilir.

**Konum:**
- Uygulama yapılandırma klasöründe işaretçi dosyası: `location.json` → `{ "dataDir": "/mutlak/yol" }`. Yoksa varsayılan klasör (bugünkü konum) kullanılır.
- Veritabanı `sqlite:<dataDir>/loalingo.db` ile açılır. Kullanıcı kursları (`courses/`) ve API anahtarları yerinde kalır.
- Uygulama açılışında `dataDir` erişilemiyorsa (ör. SSD takılı değil) açılış ekranı: "Veri klasörüne ulaşılamıyor: <yol>" + "Tekrar dene" + "Varsayılan klasörü kullan".

**Ayarlar > Veri satırı** (değer: klasör yolu, buton: Değiştir → modal):
- **Klasörü değiştir:** Klasör seçilir → hedefte `loalingo.db` varsa "Oradaki veriyi kullan" / "Bu cihazdaki veriyi oraya kopyala" sorulur → `location.json` yazılır → uygulama yeniden başlar. Eski dosya silinmez.
- **Dışa aktar:** Kayıt diyaloğuyla `.db` kopyası.
- **İçe aktar:** Önce mevcut veri `backups/`'a kopyalanır, sonra seçilen dosya yerleşir, migration çalışır, uygulama yeniden başlar.
- **Finder'da göster.**

**Kilit:**
- `<dataDir>/loalingo.lock` → `{ "device": "<bilgisayar adı>", "at": <epoch ms> }`. Uygulama açıkken dakikada bir güncellenir, kapanırken silinir.
- Açılışta başka cihazın kilidi 3 dakikadan yeniyse: "Verilerin <cihaz> üzerinde açık" ekranı, "Tekrar dene" ve "Devral" (kilidi üzerine yazar). 3 dakikadan eskiyse sessizce devralınır.
- Bilinen sınır: bulut klasörleri kilidi gecikmeli eşitleyebilir. Modal'da not: "Cihaz değiştirmeden önce uygulamayı kapat."

**Otomatik yedek:** Günde bir, ilk açılışta `<dataDir>/backups/daily-<YYYY-MM-DD>.db`. Son 7 tutulur.

**Rust tarafı:** dosya kopyalama, kilit okuma/yazma, cihaz adı, klasör erişim kontrolü komutları. Klasör/dosya seçimi için `tauri-plugin-dialog`.

## C. Ayarlar düzeni + profiller

**Grup sırası:** Kurs → Genel (hedef, hatırlatıcı, damlalar, sesler) → Görünüm → **Yapay zekâ ve ses** (yeni) → Veri (B) → Güncellemeler → Hesap.

**Yapay zekâ ve ses** grubu üç satırdır; her satır mevcut değeri ve "Değiştir" butonunu gösterir, düzenleme modal'da yapılır:
- AI sağlayıcısı: bugünkü `AiSheet` buraya taşınır.
- Seslendirme (TTS): D'de doldurulur. C'de satır "Sistem sesi" gösterir, modal D'ye kadar yoktur.
- Konuşma tanıma (STT): D'de doldurulur. C'de satır "Whisper (yerel)" gösterir.

**Hesap:**
- "Çıkış yap" → **"Profil değiştir"** (aynı davranış: profil seçme ekranına döner).

**Profil silme** (profil seçme ekranı):
- Her profil kartında ⋯ menüsü → **Sil**.
- PIN'li profilde önce PIN sorulur.
- Onay modal'ı: "<ad> profilinin tüm ilerlemesi kalıcı olarak silinir. Bu işlem geri alınamaz." Silme butonu, kullanıcı profil adını aynen yazana kadar pasiftir.
- Silme tek transaction'da: `words`, `mistakes`, `content_cache`, `step_progress`, `enrollments` (profilin kayıtları), sonra `profiles`.
- Son kalan profil de silinebilir; ekran "Profil oluştur" durumuna döner.
- Test: silme sonrası o profile ait satır kalmadığı, diğer profillerin satırlarının durduğu (sql.js).

## D. Ses sağlayıcıları

**TTS:**
- `src/tts.ts`: `speak(text, lang, voice?: { gender: "f" | "m"; kokoro?: string })`. Bugünkü `say()` buna yönlenir.
- Sağlayıcı: `system` (varsayılan, `speechSynthesis`) veya `kokoro`. `device_settings.tts`.
- **Kokoro:** `kokoro-js` (Kokoro-82M ONNX, q8, ~90 MB). WebGPU varsa onunla, yoksa WASM ile. Model, Kokoro ilk seçildiğinde ilerleme çubuğuyla indirilir ve tarayıcı önbelleğinde tutulur. İndirme başarısızsa sistem sesine dönülür ve hata gösterilir.
- Kokoro yalnızca İngilizce seslere sahiptir. `lang` İngilizce değilse sistem sesi kullanılır.
- Modal metni: "Daha doğal bir ses. Bilgisayarının hızına göre cümle başına birkaç saniye sürebilir." + ses önizleme butonu.
- Sistem sesinde cinsiyet: `voices.ts` içinde dil başına bilinen macOS ses adları (`en`: kadın Samantha, Karen, Moira…; erkek Daniel, Alex, Fred…). Eşleşme yoksa kadın için `pitch 1.15`, erkek için `0.85`.
- Tauri CSP, model indirme adresine (Hugging Face) izin verecek şekilde güncellenir.

**STT:**
- Sağlayıcı: `whisper` (varsayılan, yerel) veya `deepgram`. `device_settings.stt`.
- Deepgram: mevcut kayıt akışının 16 kHz PCM çıktısı WAV'a sarılıp Tauri HTTP ile `POST https://api.deepgram.com/v1/listen?model=nova-3&language=<lang>` adresine gönderilir. Anahtar Anahtar Zinciri'nde (`deepgram` anahtarı). Modal'da anahtar alanı + "Bağlantıyı test et".
- Deepgram seçiliyken Whisper modeli yoksa bile konuşma maddeleri görünür (`sttReady` sağlayıcıya göre karar verir).

## E. Rol Yapma

**Liste ekranı:** Kişi listesi. Her satır: avatar (renk + baş harf), isim, "Sohbet" ve "Ara" butonları. İsim altında rol yazmaz.

**Karakterler** (`src/characters.ts`): 6 karakter, 3 kadın 3 erkek. Alanlar:
- `id`, `name`, `gender`, `color`, `kokoroVoice` (`af_*`/`bf_*` kadın, `am_*`/`bm_*` erkek)
- `persona`: prompt'a giren 2–3 cümle (meslek, konuşma tarzı, huy; ör. "sabırsız ama yardımsever", "esprili, uzun cümleler kurar")
- `topics`: 4–6 konu; her biri i18n anahtarı olan başlık + prompt'a giden İngilizce hedef

Karakterler: otel resepsiyonisti **Mia** (K), şef **Kai** (E), doktor **Nora** (K), ev sahibi **Tom** (E), iş görüşmecisi **Emma** (K), tur rehberi **Leo** (E). `lily` kimliği `mia` olur (Lily bir Duolingo karakteri; rengi de mor olmaktan çıkar), `kai` korunur.
İsim kuralı: kısa, Türkçe konuşan biri için de kolay okunur; Duolingo karakter adlarıyla (Bea, Eddy, Falstaff, Junior, Lily, Lin, Lucy, Oscar, Vikram, Zari) çakışmaz.

**Akış:** Sohbet/Ara → konu seçme modal'ı (konu listesi + "Kendi konunu yaz" metin alanı) → sohbet. `chatTurn` sistem prompt'una `persona` ve seçilen konu/hedef eklenir. Serbest konuda hedef "have a natural conversation about: <metin>" olur.

**Ses:** Aramada ve sohbetteki "dinle" butonunda `speak(text, lang, { gender, kokoro: kokoroVoice })`.

## F. Cevaba itiraz

- Yalnızca AI'nin `judge()` ile yanlış saydığı serbest yazılı cevaplarda, geri bildirim bandında 🚩 "İtiraz et" butonu görünür.
- Modal: "Cevabın neden doğru?" metin alanı + Gönder.
- `appeal(c, question, expected, given, reason)` → AI şeması `{ accepted: boolean, reason: string }` (reason ana dilde, tek cümle).
- Kabul: cevap doğru sayılır, puan eklenir, kaybedilen damla geri verilir, bu soru için eklenen `mistakes` kaydı silinir, bant "Doğru" durumuna geçer.
- Red: AI gerekçesi bantta gösterilir, durum değişmez.
- Soru başına tek itiraz. AI çağrısı başarısız olursa hata gösterilir, hak düşmez.

## G. Bahçe teması

| Eski | TR | EN | İkon |
|---|---|---|---|
| Kalp | Damla | Drop(s) | su damlası |
| Seri | Kök | Roots | filizlenen kök |
| Seri dondurma | Sera | Greenhouse | sera |
| Sandık | Hasat sepeti | Harvest basket | sepet |

- Tüm metinler (ör. "12 gündür kök salıyorsun", "Damlan kalmadı"), ikonlar (`heart`, `flame`, `chest`, `shield` yerine yeni SVG'ler), bildirimler, başarımlar ve Mağaza değişir.
- Renkler: damla `--blue`, kök `--green`, sera `--green`, sepet `--gold`.

## H. Arayüz dilleri

- `src/locales/de.json`, `es.json`, `fr.json`; Ayarlar dil seçiminde ve profil oluşturmada görünür.
- Test: her dil dosyasının anahtar kümesi `en.json` ile aynı; `{{değişken}}` yer tutucuları aynı; çoğul (`_one`/`_other`) anahtarları eksiksiz.

## I. İngilizce C1 ve C2

- `courses/en.yml`'e `C1` (Advanced) ve `C2` (Proficiency): her biri 10 ünite, ~43 adım + checkpoint, A1–B2 ile aynı yapı ve etkinlik karışımı. Kelime ve gramer CEFR C1/C2 düzeyinde.
- A1–B2 denetimi: tekrar eden adım kimliği, boş `vocabulary`/`grammar`, eksik checkpoint.
- Test: yükleyici tüm seviyeleri doğrular; seviye başına ünite ve adım sayısı, benzersiz kimlikler.

## J. Yeni isim

- Son dalga. Aday isimler; alan adı ve marka uygunluğu hızlı kontrolüyle kullanıcıyla birlikte seçilir.
- Tek seferde: ürün adı, bundle id, Anahtar Zinciri servis adı, varsayılan veri klasörünün eskisinden taşınması, updater adresi, repo adı, README ve ekran görüntüleri.
- Bu alt proje kendi tasarım belgesini alır.
