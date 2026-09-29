# loalingo — Kararlar

Her madde: seçenekler, öneri, karar. Tüm kararlar verildi (2026-09-29).
Plan: [PLAN.md](PLAN.md)

## A. Platform & teknoloji

**A1. Masaüstü kabuk**
- Tauri 2 (küçük binary ~10MB, Rust backend, native eklentiler) · Electron (her şey JS, ~150MB, Chromium)
- Öneri: Tauri 2
- Karar: Tauri 2

**A2. Hedef işletim sistemleri (v1)**
- Sadece macOS · macOS + Windows · macOS + Windows + Linux
- Öneri: macOS önce; Tauri ile diğerleri sonra ucuz
- Karar: macOS önce; Tauri ile diğerleri sonra ucuz

**A3. UI framework**
- React + TS · Svelte · Vanilla (prototipi olduğu gibi kullanmak)
- Öneri: React + TS
- Karar: React + TS

**A4. Stil yaklaşımı**
- Prototip CSS'ini global olarak aynen taşı · Tailwind'e çevir · CSS Modules
- Öneri: Aynen taşı (piksel sadakati, en az iş)
- Karar: Aynen taşı (piksel sadakati, en az iş)

**A5. Lokal veri**
- SQLite · JSON dosyaları · IndexedDB
- Öneri: SQLite
- Karar: SQLite

**A6. API anahtarlarının saklanması**
- OS keychain · şifreli dosya · düz config dosyası
- Öneri: OS keychain
- Karar: OS keychain

## B. Dil & içerik

**B1. Ana dil (kaynak dil)**
- Sabit Türkçe · kullanıcı seçer
- Öneri: v1 Türkçe sabit, alanı parametrik tut
- Karar: Kullanıcı seçer; varsayılan arayüz dilinden gelir, Ayarlar'da ayrıca değiştirilebilir.

**B2. Arayüz dili (UI i18n)**
- Karar: Çok dilli başlar. Varsayılan İngilizce; `tr` de v1'de gelir (tasarım metinleri zaten Türkçe, bedava).
- Uygulama: `react-i18next`; her dil tek dosya `src/locales/<iso>.json`. Yeni dil = dosyayı kopyala, çevir, ekle — kod değişikliği yok (dil listesi klasörden otomatik okunur).
- Kural: bileşenlerde sabit metin yok; hepsi anahtar üzerinden (`t('nav.learn')`). Eksik anahtar İngilizceye düşer.
- Not: Arayüz dili ≠ ana dil (B1). Ayarlar'da ikisi ayrı seçilir; ana dil varsayılan olarak arayüz dilinden gelir.

**B3. Kurs dosyalarının konumu**
- Uygulamaya gömülü · kullanıcı klasörü · ikisi birden
- Öneri: İkisi (gömülü + `Application Support/loalingo/courses`)
- Karar: İkisi (gömülü + `Application Support/loalingo/courses`)

**B4. v1'de hazır gelecek kurs(lar)**
- Sadece İngilizce A1 · İngilizce A1–A2 · birden fazla dil
- Öneri: İngilizce A1 tam
- Karar: İngilizce A1 tam

**B5. YAML'da etkinlik içeriği**
- Sadece `type` (her şeyi AI üretir) · içerik opsiyonel (varsa statik, yoksa AI) · her zaman statik
- Öneri: Opsiyonel — statik içerik aynı zamanda AI'sız fallback
- Karar: Her şeyi AI üretir; YAML yalnızca type + bağlam verir. (Sonuç: AI kurulmadan ders oynanamaz → bkz. C6.)

**B6. Ders başı soru sayısı**
- YAML'da activity başına `count` · global ayar · ikisi (YAML varsayılanı ezer)
- Öneri: `count` alanı, yoksa varsayılan
- Karar: `count` alanı, yoksa varsayılan

**B7. "Bölüm" kavramı**
- Bölüm = CEFR seviyesi (A1, A2…) · YAML'a ayrı `sections` katmanı
- Öneri: Bölüm = CEFR seviyesi
- Karar: Bölüm = CEFR seviyesi

**B8. Seviye (CEFR) geçişi ve path eşlemesi**
- **Öğren ekranı yalnızca aktif seviyenin ünitelerini gösterir.** Diğer seviyelerin dersleri listede yer almaz; uzun tek liste yok.
- Eşleme: Bölüm = CEFR seviyesi (`BÖLÜM 1` → `A1 · Ünite 1` başlığı), Ünite = renkli başlık kartı, Adım = path düğümü, **Ünite sandığı = her ünitenin sonuna otomatik eklenir** (YAML'a yazılmaz), `checkpoint` = seviyenin son düğümü (kupa).
- Path'in sonunda seviye kartı (tasarımda yok → aynı görsel dille yeni bileşen):
  - A1 bitmediyse: "A2'ye geçmek için X ders kaldı" + ilerleme çubuğu. A2'nin dersleri gösterilmez, sadece bu kart.
  - "A1'i atla — seviye testi yap" butonu → `checkpoint` etkinlikleri AI ile üretilir; `required_score` geçilirse A1 tamamlanır.
  - Seviye tamamlanınca Öğren ekranı A2'nin path'ine geçer.
- Seviye seçici: ünite başlığının üstünde küçük "A1 · Beginner ▾" çipi → tasarımdaki bottom sheet ile seviye listesi. Tamamlanan seviyeler açılıp tekrar edilebilir (Legendary buradan); gelecek seviyeler kilitli, sadece "seviye testi" seçeneği.
- Rehber butonu: ünitenin adımlarındaki `vocabulary` + `grammar` listesi; açıklamaları AI üretir (cache'li).
- Karar: Yukarıdaki gibi; seviye testi v1'de (Faz 3, checkpoint ile aynı akış).

## C. AI

**C1. v1 sağlayıcıları**
- Ollama, LM Studio, OpenAI, Anthropic, Gemini — hepsi mi, önce lokal ikisi mi?
- Öneri: Hepsi (Vercel AI SDK ile maliyet düşük)
- Karar: Hepsi (Vercel AI SDK ile maliyet düşük)

**C2. Üretim stratejisi**
- Dersin tamamı tek çağrı · her etkinlik ayrı çağrı · tek çağrı, başarısızsa ayrı
- Öneri: Tek çağrı + fallback
- Karar: Tek çağrı + fallback

**C3. Üretilen içeriğin cache'lenmesi**
- Cache'le (tekrar açınca aynı) · her seferinde yeni üret · cache + "yeniden üret" butonu
- Öneri: Cache + yeniden üret + sonraki dersi önceden üret
- Karar: Cache + yeniden üret + sonraki dersi önceden üret

**C4. Cevap kontrolü (serbest yazı: çeviri, dinle-yaz)**
- Normalize string karşılaştırma + alternatif cevaplar · AI değerlendirme · ikisi (önce string, uymazsa AI)
- Öneri: İkisi
- Karar: String + AI (önce normalize/alternatifler, uymazsa AI)

**C5. Geri bildirim açıklaması**
- Yanlışta sadece doğru cevap · AI kısa açıklama ("neden yanlış")
- Öneri: Doğru cevap + opsiyonel "Açıkla" butonu
- Karar: Doğru cevap + opsiyonel "Açıkla" butonu

**C6. AI ayarlanmamışken davranış**
- Onboarding'de zorunlu kurulum · statik içerikle çalış, AI'yı sonra iste
- Öneri: Statik içerikle çalış, banner ile kurulum öner
- Karar: İlk açılışta zorunlu AI kurulum akışı (B5 gereği AI olmadan ders yok). Kurulum tamamlanana kadar path görünür ama dersler kilitli + kurulum banner'ı.

## D. Ses

**D1. Metin → ses (dinleme)**
- Sistem TTS (Web Speech, ücretsiz) · sağlayıcı TTS (OpenAI/Gemini) · ikisi seçmeli
- Öneri: v1 sistem TTS
- Karar: v1 sistem TTS

**D2. Ses → metin (konuşma)**
- v1'de "Yakında" · lokal Whisper (whisper.cpp) · sağlayıcı STT
- Öneri: v1'de Yakında
- Karar: v1'de Yakında

## E. Kapsam & ekranlar

**E1. Tasarımdaki ekranların v1 durumu**
- Öğren, Pratik, Profil, Ayarlar: çalışır
- Hikâyeler, Rol Yapma: faz 2 (AI sohbet)
- Lig, Arkadaşlar, Mağaza, Bildirimler: ?
- Öneri: Son dörtlü "Yakında"; local-first'te anlamları ayrıca konuşulsun
- Karar: Lig, Arkadaşlar, Mağaza, Bildirimler "Yakında"

**E2. Oyunlaştırma (kalp, XP, seri, gem)**
- Hepsi · kalp hariç (yerel uygulamada ceza anlamsız olabilir) · sadece XP + seri
- Öneri: XP + seri + günlük hedef; kalp opsiyonel ayar
- Karar: XP + seri + günlük hedef; kalp opsiyonel ayar

**E3. Kilit mantığı**
- Sıralı (önceki bitmeden açılmaz) · serbest · sıralı + "atla" testi
- Öneri: Sıralı; checkpoint ile seviye atlama sonra
- Karar: Sıralı; seviye atlama testi v1'de (bkz. B8)

**E4. Kullanıcı profili → lokal çoklu profil**
- Karar: Cihazda birden fazla profil. "Çıkış yap" profili silmez; profil seçme ekranına döner, başka profil seçilir ya da yeni profil oluşturulur.
- Koruma: opsiyonel 4 haneli PIN (tuzlu hash, SQLite). Not: local-first'te bu bir mahremiyet kilididir, gerçek güvenlik değil.
- Profil seçme ekranı + "Profil oluştur" akışı tasarımda yok → tasarım diliyle yeni ekran (lig satırlarındaki avatar stili).
- İlk açılış: profil oluştur (ad, ana dil, ilk kurs) → AI kurulumu (C6) → Öğren.

**E5. Profil içinde çoklu dil (kurs)**
- Karar: Profil birden fazla kursa kayıt olabilir; aktif kurs değiştirilebilir. Her (profil × kurs) ilerlemesi ayrı tutulur.
- Geçiş yeri: sağ raydaki istatistik şeridine aktif kurs bayrak çipi (tıklayınca sheet: kayıtlı kurslar + "Yeni dil ekle") ve Ayarlar > Kurs > Değiştir (aynı sheet). Mobil düzende (ray yok) Ayarlar'dan.
- Bayrak çipi tasarımda yok → aynı stat-chip stiliyle.

**E6. Neyin kime ait olduğu**
- Cihaz geneli: AI sağlayıcıları, API anahtarları (keychain), model seçimi; kurs YAML dosyaları; son kullanılan profil.
- Profil: ad, avatar rengi, PIN, arayüz dili, tema, ana dil, aktif kurs, seri, elmas, kalp, günlük görevler, bildirim/ses ayarları.
- Profil × kurs (kayıt/enrollment): aktif CEFR seviyesi, adım ilerlemesi, XP, hatalar (mistakes), öğrenilen kelimeler, üretilmiş içerik cache'i (hatalara göre kişiselleştiği için paylaşılmaz).
- Karar: Yukarıdaki gibi. Toplam XP = kayıtların toplamı; seri profil genelidir (hangi dilde olursa olsun günlük pratik sayılır).

## F. Tasarım

**F1. Dark mode tetikleme**
- Sistemi takip et + manuel (Sistem/Açık/Koyu) · sadece manuel
- Öneri: Sistem + manuel
- Karar: Sistem + manuel

**F2. Responsive hedef**
- Sadece masaüstü genişlikleri · dar pencerede mobil düzen (bottom-nav) de korunur
- Öneri: Koru — tasarımda zaten var, pencere küçültülünce devreye girer
- Karar: Koru — tasarımda zaten var, pencere küçültülünce devreye girer

**F3. Font**
- Nunito Google Fonts'tan · uygulamaya gömülü (offline)
- Öneri: Gömülü (local-first)
- Karar: Gömülü (local-first)

## G. Süreç

**G1. Repo**
- Bu klasörde `git init` · ayrı repo
- Öneri: Bu klasörde git init
- Karar: Bu klasörde git init

**G2. Test seviyesi**
- Sadece kritik mantık (YAML loader, cevap kontrolü, şema doğrulama) · geniş test
- Öneri: Kritik mantık
- Karar: Kritik mantık