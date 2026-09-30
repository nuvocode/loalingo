# N — Gün içi hatırlatmalar ve Gelişmiş ayarlar

**Amaç:** Hatırlatma saati ayarı kalksın. Uygulama gün içinde kendi seçtiği zamanlarda, arayüz diline göre esprili cümlelerle dil çalışmaya davet etsin. Yapay zeka ve ses ile Veri bölümleri "Gelişmiş" altında kapalı dursun.

## Kararlar

- Günde 3 zaman aralığı: yaklaşık 10:00, 15:00 ve 19:30.
- O gün ilk ders ya da pratik bitince günün kalan hatırlatmaları susar (`lastActive === bugün`).
- Gelişmiş bölümü varsayılan olarak kapalıdır. Yapay zeka kurulmamışsa açık gelir. Açık/kapalı durumu kaydedilmez.

## Hatırlatmalar

### Zamanlama (`src/nudge.ts`, saf)

- `SLOTS = [600, 900, 1170]`: aralıkların taban saatleri, gece yarısından itibaren dakika (10:00, 15:00, 19:30).
- `slotTimes(day)`: o günün 3 zamanı, ms cinsinden. Her aralık `rng(day)`'den ±30 dakika kayar, aynı gün hep aynı sonucu verir. Aralıklar üst üste binmez (en yakın ikisi arasında en az 4 saat kalır).
- `nudgeDue(s, now)`: gönderilecek aralığın numarası (0–2) ya da `null`. Numara dönmesi için:
  - `s.reminderOn` açık olmalı,
  - `s.lastActive` bugün olmamalı,
  - `now` en az bir aralığın zamanını geçmiş olmalı,
  - o aralık bugün gönderilmemiş olmalı: `s.reminded`, `"YYYY-MM-DD:slot"` biçiminde o gün gönderilen son aralığı tutar.
- Kaçan aralıklar birikmez. Birden çok aralık geçmişse yalnız en sonuncusu gönderilir, daha önceki aralıklar da gönderilmiş sayılır.

### Mesajlar

- Locale'de `nudges.general` (6), `nudges.streak` (4) ve `nudges.evening` (2), her biri `{ "t": başlık, "b": metin }` dizisi. `t(key, { returnObjects: true })` ile okunur.
- Yer tutucular:
  - `{{lang}}`: çalışılan dilin arayüz dilindeki adı (`useLangName`).
  - `{{count}}`: seri gün sayısı. Cümleler tekil/çoğul ayrımı gerektirmeyecek biçimde yazılır (ör. "Seri: {{count}} gün").
- `nudgeMessage(slot, streak, day)` hangi dizinin kaçıncı mesajının gösterileceğini döndürür (`{ group, i }`):
  - `slot === 2` ve `streak > 0` ise `evening`.
  - Değilse, `streak > 0` iken gün ve aralığa göre yarı yarıya `streak` ya da `general`.
  - Seri yoksa `general`.
  - Sıra `i = (rng(day) tabanı + slot) % dizi uzunluğu`. Böylece aynı günün aralıkları aynı mesajı tekrarlamaz, günden güne de mesajlar değişir.
- Ton: kısa, samimi, esprili, Duolingo tarzı; suçlamayan. Her dilde yerel dile uygun yazılır, çeviri kokmaz. Emoji en fazla bir tane.

### Kayıt ve geçiş

- `Stats` içinden `reminderTime` ve `remindedDay` kalkar, yerine `reminded: string` gelir (başlangıç `""`).
- Eski profillerdeki fazla alanlar zararsızdır ve yok sayılır. `reminderOn` aynen kalır.
- `reminderDue` ve testi kaldırılır, yerini `nudge.test.ts` alır.

### Uygulama (`src/App.tsx`)

- Dakikalık tik `nudgeDue`'yu çağırır. Sonuç `null` değilse:
  - `reminded` güncellenir,
  - `notify(başlık, metin)` çağrılır.
- `keepInBackground` davranışı değişmez.
- Kullanılmayan locale anahtarları kaldırılır: `reminderTime`, `reminderTimeDesc`, `reminderTitle`, `reminderBody`, `reminderStreak_*`.

### Ayarlar

- Aç/kapa düğmesinin yazısı "Hatırlatmalar" olur. Açıklama örneği: "Sprigo gün içinde birkaç kez seni derse çağırır; o gün çalıştıysan susar."
- Saat alanı kaldırılır. `reminderBlocked` uyarısı kalır.

## Gelişmiş bölümü (`src/screens/Settings.tsx`)

- "Görünüm"den sonra tam genişlikte bir buton gelir: "Gelişmiş" ve açılıp kapandığını gösteren bir ok (`aria-expanded`).
- Açıkken "Yapay zeka ve ses" başlığı ile `<DataSection />` görünür.
- "Güncellemeler" ve "Hesap" bölümleri her zaman görünür.
- İlk durum `useState(!ai)` ile belirlenir.
- Locale'e `settings.advanced` eklenir (5 dil).

## Test

- `src/nudge.test.ts`:
  - Aralık zamanları taban saatten en fazla ±30 dakika sapar, aralıklar sıralıdır, aynı gün aynı sonucu verir.
  - İlk aralıktan önce `null`; aralık geçince numara döner; `reminded` aynı aralığı gösteriyorsa `null`.
  - O gün çalışılmışsa ya da hatırlatma kapalıysa `null`.
  - İki aralık kaçmışsa yalnız sonuncusu döner.
  - `nudgeMessage`:
    - seri yoksa hep `general`,
    - akşam aralığında seri varsa `evening`,
    - `i` her zaman dizi sınırları içinde,
    - aynı günün 3 aralığı aynı `(group, i)` çiftini vermez.
- `locales.test.ts`: yeni anahtarlar 5 dilde de var (mevcut eşlik testi) ve `nudges` dizilerinin uzunlukları diller arasında aynı.
- `pnpm test`, `pnpm -s tsc --noEmit -p .`
- Tarayıcı önizlemesi:
  - Ayarlar'da saat alanı yok.
  - Gelişmiş kapalı geliyor, açılınca "Yapay zeka ve ses" ile "Veri" görünüyor.
  - Bildirim gönderimi tarayıcıda çalışmaz; bunu birim testleri kapsar.

## Kapsam dışı

Kullanıcının hatırlatma sayısını ya da saatini seçmesi, sessiz saatler, mesajları yapay zekayla üretmek.
