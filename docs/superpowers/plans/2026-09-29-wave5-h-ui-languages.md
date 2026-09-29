# Dalga 5 / H — Arayüz dilleri DE/ES/FR Implementation Plan

**Goal:** Arayüz Almanca, İspanyolca ve Fransızca da kullanılabilir. Diller Ayarlar'da ve profil oluştururken seçilir; ilk açılışta sistem dili destekleniyorsa o gelir.

**Architecture:**
- `src/locales/de.json`, `es.json`, `fr.json` (yeni): `en.json`'ın tam çevirisi, `_meta.name` = `Deutsch` / `Español` / `Français`. `src/i18n.ts` dosyaları `import.meta.glob` ile zaten bulur — dil eklemek için kod gerekmez.
- `src/i18n.ts`: ilk açılış dili `stored() ?? systemLang()`; `systemLang()` = `navigator.language`'ın ilk iki harfi `resources`'ta varsa o, yoksa `"en"`.
- `src/screens/Profiles.tsx` `ProfileForm`: yalnız yeni profil oluştururken (`!initial`) "Arayüz dili" `select`'i (`languages` listesi, `i18n.changeLanguage` ile anında uygular); `createProfile`'a giden `ui_lang: i18n.language` aynı kalır. Metin anahtarı `settings.language` yeniden kullanılır.
- `src/locales.test.ts` genişler: `en` dışındaki her dil dosyası için
  - anahtar kümesi (`_one/_other/...` son ekleri atılmış taban anahtarlar) `en` ile aynı;
  - her anahtarın `{{değişken}}` kümesi `en`'dekiyle aynı;
  - çoğul: `en`'de `_one/_other`'ı olan her taban anahtar için, dilin `new Intl.PluralRules(lang).resolvedOptions().pluralCategories` kategorilerinin hepsi mevcut (tr → yalnız `other` yeterli; fr/es'te `many` de gerekir);
  - `_meta.name` dolu.
  Bahçe teması yasak kelime testi DE/ES/FR için de: Herz/Serie/Truhe · corazón/racha/cofre · cœur/série/coffre (kelime sınırıyla; "Serie" gibi başka anlamda geçen bir kullanım varsa regex daraltılır, gerekçesi yorumda).

## Çeviri kuralları

- Terimler (bahçe teması): damla/drops → DE `Tropfen`, ES `gotas`, FR `gouttes`; kök/roots (seri) → DE `Wurzeln`, ES `raíces`, FR `racines`; sera/greenhouse → DE `Gewächshaus`, ES `invernadero`, FR `serre`; hasat sepeti/harvest basket → DE `Erntekorb`, ES `cesta de cosecha`, FR `panier de récolte`. Mastery, Word Rush, lig adları `en.json`'daki biçimleriyle tutarlı çevrilir ya da özel ad olarak kalır — dosya içinde tutarlı olsun.
- Hitap: DE `du`, ES `tú`, FR `tu` (uygulama samimi, TR'deki "sen" gibi).
- Kısa kalmalı: düğme ve sekme metinleri EN'den en fazla ~%30 uzun; büyük harfe çevrilen gezinme etiketlerinde uzun bileşik kelimelerden kaçınılır.
- Karakter adları (Mia, Kai, …), `loalingo`, sağlayıcı adları çevrilmez.

## Global Constraints

- `node --test` type-stripping kuralları. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Tasks

1. Plan (bu dosya) — commit.
2. Test genişletmesi (önce kırmızı: yeni dosyalar yok) + `i18n.ts` sistem dili + profil formu dil seçimi — commit.
3. `de.json` — commit. 4. `es.json` — commit. 5. `fr.json` — commit.

Her görevden sonra: `pnpm test`, `pnpm -s tsc --noEmit -p .`.

## Doğrulama

- Tarayıcı önizlemesi: Ayarlar > Arayüz dili listesinde 5 dil; her birinde Öğren, Ayarlar ve bir ders ekranında taşan / kesilen metin yok (dar pencere dahil); çoğul metin (ör. "N ders kaldı") doğru biçimde.
