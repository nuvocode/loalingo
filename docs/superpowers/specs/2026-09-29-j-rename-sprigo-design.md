# J. Yeni isim: Sprigo — tasarım

**Tarih:** 2026-09-29 · **Durum:** Onaylandı (kullanıcı yolu bana bıraktı) · **Üst belge:** `2026-09-29-v1-roadmap-design.md` § J

## Karar

- Ad: **Sprigo** ("sprig": filiz, dal ucu). Ürün adı ve cümle içinde `Sprigo`, logo/wordmark küçük harf `sprigo`.
- Seçim gerekçesi: bahçe + kelime birleşimi adların (Wordgrove, Lingrove, Lexigrow, Verbloom) GitHub'da zaten dil öğrenme projeleri var; `sprigo.app` / `sprigo.io` DNS'te boş, GitHub'da çakışan dil uygulaması yok (`.com` dolu). Resmî marka taraması yapılmadı.
- Uygulama şu an yalnız geliştiricinin makinesinde kurulu → **taşıma kodu yok**. Tüm kalıcı kimlikler bir seferde değişir; mevcut veri bir kez elle kopyalanır.

## Değişenler

| Yer | Eski | Yeni |
|---|---|---|
| `tauri.conf.json` `productName`, pencere başlığı | loalingo | Sprigo |
| `identifier` (bundle id, veri klasörü, WebKit depolaması) | `com.nuvocode.loalingo` | `com.nuvocode.sprigo` |
| Anahtar Zinciri servisi (`lib.rs`) | `com.nuvocode.loalingo` | `com.nuvocode.sprigo` |
| Veri dosyaları (`data.rs`, `datadir.ts`) | `loalingo.db`, `loalingo.lock` | `sprigo.db`, `sprigo.lock` |
| Dışa aktarma varsayılan adı | `loalingo-<tarih>.db` | `sprigo-<tarih>.db` |
| localStorage anahtarları (`i18n.ts`, `theme.ts`, `db.ts`, `ai.ts`, `stt.ts`) | `loalingo.*` | `sprigo.*` |
| Cargo paketi / lib | `loalingo` / `loalingo_lib` | `sprigo` / `sprigo_lib` |
| `package.json` `name`, `index.html` `<title>` | loalingo | sprigo / Sprigo |
| Updater endpoint, `release.sh`, `release.yml` | `nuvocode/loalingo`, `loalingo.app.tar.gz` | `nuvocode/sprigo`, `Sprigo.app.tar.gz` |
| `Info.plist` mikrofon metni, `icon.svg` yorumu, logolar (`App.tsx`, `Profiles.tsx`) | loalingo | Sprigo / sprigo |
| 5 dil dosyası (`src/locales/*.json`) | loalingo | Sprigo |
| README (+ ekran görüntüleri yeniden), `docs/DECISIONS.md`, `docs/PLAN.md`, `docs/BRIDGE.md`, `docs/design/index.html` | loalingo | Sprigo |

Değişmeyenler: geçmiş spec ve planlar (`docs/superpowers/**` tarihli belgeler), imzalama anahtarı yolu (`~/.tauri/loalingo.key`; `release.sh` ortam değişkeniyle geçersiz kılınabilir, dosya yerinde kalır), yerel çalışma klasörünün adı.

## Tek seferlik işler (kod değil)

1. Gerçek veri: `~/Library/Application Support/com.nuvocode.loalingo/loalingo.db` → `sqlite3 .backup` ile `~/Library/Application Support/com.nuvocode.sprigo/sprigo.db`. Eski klasör silinmez (yedek olarak kalır).
2. API anahtarları (AI sağlayıcı, Deepgram) Anahtar Zinciri'nde eski servis adında kalır; kullanıcı Ayarlar'dan bir kez yeniden girer (Claude gizli değer görmez / kopyalamaz).
3. Kokoro modeli yeni WebKit depolamasına bir kez yeniden iner.
4. GitHub reposu `nuvocode/loalingo` → `nuvocode/sprigo` (`gh repo rename`, kullanıcı onayıyla); `origin` adresi güncellenir. GitHub eski adresleri yönlendirir.

## Test

- `locales.test.ts`: hiçbir dil dosyasında `loalingo` geçmez.
- `git grep -i loalingo` yalnız değişmeyenler listesindeki yerlerde eşleşir.
- `pnpm test`, `tsc`, `cargo test`; `pnpm tauri dev` ile yeni klasörde kopyalanmış veriyle açılış (profil ve ilerleme yerinde, `sprigo.lock` yazılır, günlük yedek oluşur).
