# M — Gerçekçi lig rakipleri

**Amaç:** Haftalık lig, gerçek insanlarla yarışıyormuş gibi hissettirsin: yerel ve yabancı isimler, lige göre zorluk, haftadan haftaya sürpriz, kişiye özgü tempo ve adım adım artan XP.

## Kararlar

- İsimler ağırlıklı karışık: rakiplerin yaklaşık yarısı kullanıcının arayüz dilinden.
- Rakipler kullanıcıya tepki vermez. Haftanın akışı lig kurulurken belirlenir.
- Tohum ligde (en alt) kimse düşmez, en üst ligde kimse yükselmez. Kural metni ve çizgiler buna göre değişir.
- Oturumlar kaydedilmez, tohumdan hesaplanır. Kayıtta yalnız isim, renk, hedef ve tutku durur.

## Rakip modeli

1. **İsimler:** `tr`, `en`, `de`, `es`, `fr` için 10'ar isim (toplam 50). 9 rakibin 4'ü ya da 5'i (tohuma göre) kullanıcının dilinden, kalanı diğer dillerden karışık. İsim tekrar etmez. Dil desteklenmiyorsa `en`. İsimler lig kurulurken sabitlenir.
2. **Lig ortalaması:** `mean(tier) = 7 × (15 + 12 × tier)` haftalık XP (Tohum 105, en üst 861).
3. **Haftalık sürpriz:** Lig temposu `pace ∈ [0.8, 1.2]`, lig başına bir kez çekilir.
4. **Rakip hedefi:** `total = round5(mean × pace × spread)`, `spread ∈ [0.2, 2.0]`. Çoğu orta seviyede kalsın diye dağılım ortaya yığılır (ör. iki uniform'un ortalaması), uçlarda birkaç hırslı ve neredeyse bırakmış rakip olur. En az 10 XP.
5. **Tutku (`passion ∈ [0, 1]`):** Oturumların haftaya yayılışını belirler. Oturum zamanı `t ∈ [0, 7)` gün, yoğunluk `∝ (t/7)^k` ile çekilir. `k = 0.2 + 2.3 × (1 − passion)`:
   - Yüksek tutku: `k ≈ 0.2`, hafta başından düzenli.
   - Düşük tutku: `k ≈ 2.5`, son günlere yüklenir.
   - `k > 0` olduğu için herkeste oturumlar sona doğru sıklaşır.
6. **Adımlar:** Her oturum 10–40 XP, 5'in katı. Adım `10..min(40, kalan)` içinden, geriye 5 kalmayacak şekilde çekilir; böylece toplam tam `total` olur. Oturum saati o günün 08:00–24:00 aralığına düşer.
7. **Belirlilik:** Lig tohumu `hafta:seviye:profilId` (isimler, `pace`, `total`, `passion`). Oturum tohumu rakibin kendi alanlarından. Aynı girdi her zaman aynı akışı verir.

## Kod

- `src/league.ts` (saf):
  - `type Rival = { n: string; c: string; total: number; passion: number }`
  - `type LeagueState = { week; tier; rivals: Rival[]; last?; who?: { id: number; lang: string } }`
  - `newLeague(week, tier, last?, who?)`
  - `sessions(r: Rival, week: string): { at: number; xp: number }[]`: `at` ms cinsinden, zamana göre sıralı. Sonuç önbelleğe alınır.
  - `rivalXp(r, week, now)` = `now`'a kadarki oturumların toplamı. İmza aynı kalır. Oturum tohumu rakibin kendi alanlarından (`week`, isim, `total`, `passion`) türetilir, böylece `rivalXp` ek parametre istemez.
  - `rollLeague(l, weekXp, day, who = l?.who)`. Aynı hafta ama eski biçimli rakipler (`total` yok) varsa ligi aynı hafta ve seviyeyle yeniden kurar, `last` ve `weekXp` korunur.
- `src/progress.ts`: `rollDay(s, day, who?)`, `who`'yu `rollLeague`'e iletir. `recordSession` değişmez.
- `src/store.tsx`: Açılıştaki `rollDay(fresh.stats, today(), { id: fresh.id, lang: fresh.ui_lang })`.
- `src/screens/Screens.tsx`: Lig ekranı (`League`) açıkken dakikada bir yeniden çizilir.

## Test (`src/league.test.ts`)

- **Oturumlar:**
  - toplamı `total`'a eşit; her adım 10–40 ve 5'in katı
  - hepsi hafta içinde ve 08:00–24:00 arasında
  - aynı girdi aynı listeyi verir
- **Rakip XP'si ve eğilim:**
  - `rivalXp` hafta başında 0, hafta sonunda `total`, zamanla azalmaz
  - ortalamada haftanın ikinci yarısında ilk yarısından çok XP var
  - hafta ortasında düşük tutkulu rakip, aynı `total`'lı yüksek tutkulu rakipten daha az XP toplamış
  - bir ligde hafta içinde en az bir sıralama değişimi oluyor
- **Lig:**
  - Tier 9 rakiplerinin ortalama `total`'ı Tier 0'dan yüksek
  - aynı seviyenin farklı haftalarında ortalama `total` değişiyor (sürpriz var); her `total` `mean × 0.16` ile `mean × 2.4` arasında (en az 10)
- **İsimler:** 9 benzersiz isim; `lang: "tr"` için 4–5 tanesi Türkçe listeden
- **Geçiş:** eski biçimli (`rate`) lig yeniden kuruluyor, `tier`/`last`/`weekXp` korunuyor
- **Mevcut testler:** terfi ve düşme testleri geçmeye devam eder
- `pnpm test`, `pnpm -s tsc --noEmit -p .`
- **Tarayıcı önizlemesi:** lig ekranı açılıyor; farklı saatler için (`Date.now` kaydırılarak) sıralama değişiyor

## Kapsam dışı

Kullanıcıya tepki veren rakipler, sıralama animasyonu, rakip profilleri, bildirim içerikleri (mevcut bildirimler `rankOf` üzerinden çalışmaya devam eder).
