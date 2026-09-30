# K — Katmanlı çizgi karakter yüzleri (Rol Yapma)

**Amaç:** Rol Yapma karakterleri harfli daire yerine omuz ve üstü görünen, SVG parçalardan birleştirilmiş çizgi yüzlerle görünür. Beklerken göz kırpar, cevap üretilirken düşünür, konuşurken ağzı sesle birlikte oynar. Parçalar yeniden kullanılabilir; yeni karakter = yeni bir `face` tanımı.

## Kararlar

- Parçaları uygulamanın düz, renkli diliyle kodda çiziyoruz (tasarımcı ya da hazır set değil).
- Parçalar React bileşeni olarak yazılır (ayrı `.svg` dosyaları değil): animasyon katmanları ve tipler doğrudan erişilebilir.
- Ağız sesin şiddetiyle oynar (Kokoro); sistem sesinde sabit ritim.
- Üç durum: bekliyor, düşünüyor, konuşuyor. Duygu ifadesi yok.
- Boyut moda göre: liste 56 px, Sohbet 96 px, Ara 220 px.

## Parça sistemi (`src/face/parts.tsx`)

- Tuval `viewBox="0 0 200 200"`, omuz ve üstü büst. Her parça bu koordinatlarda çizilir, konumlandırma parçanın kendi içindedir.
- Katman sırası (arkadan öne): arka saç → kıyafet/gövde → boyun → kulaklar → kafa → gözler (beyaz, göz bebeği, kapak) → kaşlar → burun → ağız → sakal/bıyık → ön saç → aksesuar. Saç varyantı arka ve ön parçayı birlikte tanımlar (biri boş olabilir).
- Yuvalar ve varyantlar:

  | Yuva | Varyantlar |
  |---|---|
  | `head` | `round`, `oval`, `square` |
  | `ears` | `small`, `big` |
  | `eyes` | `round`, `almond`, `sleepy` |
  | `brows` | `flat`, `arched`, `thick` |
  | `nose` | `button`, `long`, `wide` |
  | `mouth` | `small`, `wide`, `smile` |
  | `hair` | `short`, `bun`, `long`, `curly`, `ponytail`, `bald` |
  | `facialHair` | `none`, `beard`, `mustache` |
  | `outfit` | `shirt`, `chef`, `coat`, `blazer`, `tshirt` |
  | `accessory` | `none`, `glasses`, `chefHat`, `cap`, `earrings` |

- Animasyonlu katmanlar:
  - Göz kapağı: ten renginde, `transform: scaleY(var(--blink))` ile iner (0 açık, 1 kapalı).
  - Göz bebeği: `translate(var(--look-x), var(--look-y))`.
  - Kaş: `translateY(var(--brow))`.
  - Ağız: her varyantın kapalı çizgisi ve açıklığa göre dikey ölçeklenen açık şekli (iç ağız koyu, dil/diş yok) vardır; `var(--mouth)` 0–1. Açıklık 0.05'in altındayken yalnız kapalı çizgi görünür.
- Renk paletleri parametre olur, varyant değil:
  - `SKIN`: 5 ton (açıktan koyuya), indeks 0–4.
  - `HAIR`: 6 renk (0 siyah, 1 koyu kahve, 2 kahve, 3 sarı, 4 kızıl, 5 gri).
  - Kıyafet rengi karakterin mevcut `color` alanı (CSS değişkeni).
  - Kaş ve sakal/bıyık saç rengini kullanır (kel karakterde de `hairColor` bu yüzden anlamlı).

## Karakter tanımı (`src/characters.ts`)

`Character` tipine `face: FaceSpec` eklenir:

```ts
type FaceSpec = {
  head: "round" | "oval" | "square"; ears: "small" | "big"; eyes: "round" | "almond" | "sleepy";
  brows: "flat" | "arched" | "thick"; nose: "button" | "long" | "wide"; mouth: "small" | "wide" | "smile";
  hair: "short" | "bun" | "long" | "curly" | "ponytail" | "bald"; facialHair: "none" | "beard" | "mustache";
  outfit: "shirt" | "chef" | "coat" | "blazer" | "tshirt"; accessory: "none" | "glasses" | "chefHat" | "cap" | "earrings";
  skin: number; hairColor: number;
};
```

`characters.ts` saf kalır (DOM/React yok); tip `characters.ts`'te tanımlanır, `parts.tsx` onu import eder.

İlk atamalar (meslek aksesuar ve kıyafetten okunur):

| Karakter | Tanım |
|---|---|
| Mia (resepsiyonist) | oval, small, almond, arched, button, smile, `bun`, none, `shirt`, `earrings`, skin 1, hair 2 |
| Kai (şef) | round, big, round, thick, wide, wide, `short`, `mustache`, `chef`, `chefHat`, skin 3, hair 0 |
| Nora (doktor) | oval, small, round, flat, long, small, `ponytail`, none, `coat`, none, skin 0, hair 4 |
| Tom (ev sahibi) | square, big, sleepy, thick, wide, small, `bald`, `beard`, `tshirt`, none, skin 2, hair 5 |
| Emma (işe alım) | square, small, almond, flat, long, small, `long`, none, `blazer`, `glasses`, skin 4, hair 0 |
| Leo (tur rehberi) | round, small, round, arched, button, smile, `curly`, none, `tshirt`, `cap`, skin 2, hair 3 |

Görsel kontrolde bir yüz kötü duruyorsa atama değiştirilebilir; kural yalnız 6 yüzün birbirinden ayırt edilebilmesi.

## Bileşen (`src/face/Face.tsx`)

`<Face spec color state size />` — `state: "idle" | "thinking" | "talking"`, `size` piksel. `role="img"` ve `aria-label` karakter adı; animasyon ekran okuyucuya bildirilmez.

- **Bekliyor:** Her yüz 2–6 sn arası rastgele aralıkla kırpar (kendi `setTimeout`'u; liste yüzleri aynı anda kırpmaz). Kırpma: `--blink` 0→1→0, 120 ms, CSS geçişi.
- **Düşünüyor:** `--look-x: 4px; --look-y: -3px; --brow: -3px` (CSS geçişi 200 ms). Kırpma sürer.
- **Konuşuyor:** `onMouth` aboneliği; gelen değer React state'ine değil doğrudan kök SVG'nin `style.setProperty("--mouth", v)`'sine yazılır (her karede yeniden render yok). Durum değişince abonelikten çıkılır ve `--mouth` 0 olur. Kırpma sürer.
- **Hareket azaltma** (`prefers-reduced-motion: reduce`): kırpma ve göz/kaş kayması yok; ağız açıklığı 0 ya da 0.5'e yuvarlanır (iki kare, yumuşak geçiş yok).

## Sesten ağız açıklığına

- `src/audio.ts` (saf, testli): `mouthLevel(prev: number, rms: number, dt: number): number` — RMS'i 0–1'e çevirir (`rms` ~0.02 altı 0, ~0.2 üstü 1, arası doğrusal), açılırken hızlı (τ ≈ 40 ms), kapanırken yavaş (τ ≈ 120 ms) yumuşatır.
- `src/tts.ts`:
  - Kokoro kaynakları `destination` yerine tek bir `AnalyserNode`'a (`fftSize` 1024), o da `destination`'a bağlanır.
  - `onMouth(cb: (open: number) => void): () => void` — ilk abonede `requestAnimationFrame` döngüsü başlar, son abone çıkınca durur. Kokoro çalarken değer analizörden (`getFloatTimeDomainData` → RMS → `mouthLevel`). Sistem sesi konuşurken (`speechSynthesis.speaking`) değer `0.5 + 0.5 * sin(2π · 3 Hz · t)` (≈ saniyede 3 hece), ikisi de değilse `mouthLevel` ile 0'a söner.

## Durumu belirleme ve yerleşim

- **Sohbet** ([Talk.tsx](../../../src/Talk.tsx) `Chat`): `busy` → `thinking`, `voicing !== null` → `talking`, değilse `idle`. Başlıktaki 48 px daire → 96 px `Face`.
- **Ara modu** (`voice`): başlık satırı yerine sohbet alanının üstünde ortalanmış 220 px `Face`; isim ve konu altında. Balonlar ve mikrofon butonu yerinde kalır.
- **Rol Yapma listesi** ([Screens.tsx:301](../../../src/screens/Screens.tsx)): 56 px daire → 56 px `Face`, `idle`.
- Yüz karakter renginde yuvarlak bir fonda durur (mevcut `.avatar` görünümü korunur; büst dairenin altından kırpılır).
- Lig, arkadaşlar, profil avatarları değişmez.

## Test

- `characters.test.ts`: her karakterin `face` alanı geçerli (`skin` 0–4, `hairColor` 0–5 tam sayı; yuva değerleri tipten, derleyici denetler); 6 `face` birbirinden farklı (JSON karşılaştırma).
- `audio.test.ts`: `mouthLevel` sessizlikte 0'a iner; yüksek RMS'te 1'e yaklaşır; aynı süre için açılma kapanmadan hızlı.
- `pnpm test`, `pnpm -s tsc --noEmit -p .`.
- Görsel (tarayıcı önizlemesi): 6 karakter × 3 durumun ekran görüntüsü; Kokoro ile konuşurken cümle arası sessizlikte `--mouth` 0.05 altına iniyor; listede kırpmalar eşzamanlı değil.

## Kapsam dışı

Duygu ifadeleri; kullanıcı avatar editörü; ses/fonem tabanlı ağız şekilleri (A/O/M); uygulamanın diğer avatarları; baş/gövde hareketi.
