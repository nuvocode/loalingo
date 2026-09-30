# L — Egzersizlerde klavye kontrolü

**Amaç:** Bir ders, pratik ya da hikâye başladıktan sonra tüm akış fare olmadan, yalnız klavyeyle yürütülebilir.

## Kapsam

- Kapsanan: `Lesson` (ders, pratik, sınav, efsane) ve `Story` (hikâye soruları).
- Kapsam dışı: Rol yapma sohbeti (zaten yazıyla ilerliyor, `Enter` gönderiyor), menüler ve ayarlar.

## Tuş haritası

**Her yerde**

| Tuş | Eylem |
|---|---|
| `Enter` | Ekrandaki ana buton: Kontrol et, Devam, Bitir, Dersi bitir (sonuç), Tekrar dene (hata). Buton pasifse hiçbir şey olmaz. |
| `Esc` | Bugünkü gibi: açık pencereyi kapatır, yoksa çıkışı sorar. |
| `Space` | Dinleme butonu olan soruda sesi tekrar çalar. Konuşma sorusunda mikrofon, bankada kelime ekleme için kullanılır (aşağıda). |

**Egzersize göre**

| Tür | Tuşlar |
|---|---|
| Seçmeli (ders ve hikâye) | `1`–`9` seçeneği seçer, `Enter` kontrol eder. 9'dan fazla seçenekte numaralar çalışmaz. |
| Eşleştirme | Sol sütun `1`–`5`, sağ sütun `6`–`9`, `0` (10. kutu). Kutularda numara rozeti görünür. |
| Kelime bankası | Harf yazdıkça, yazılanla başlayan ilk kullanılmamış kelime vurgulanır. `Space` ya da `Enter` onu ekler. `Backspace` önce yazılanı siler, boşsa son eklenen kelimeyi geri alır. Yazılan boşken `Enter` kontrol eder. |
| Yazma | Bugünkü gibi: `Enter` kontrol eder, `Shift+Enter` yeni satır. Cevaptan sonra kutu kilitlenir, `Enter` Devam olur. |
| Konuşma | `Space` mikrofonu başlatır ya da durdurur. |
| Öğren kartı | `Enter` Devam. |

**Cevaptan sonra:** `Enter` Devam, `1` Açıkla, `2` İtiraz. Butonlarda `1` ve `2` rozetleri görünür. Açıkla penceresinde `Enter` "Anladım"a basar.

**Atla:** Kısayolu yok (yanlışlıkla soru geçilmesin).

## Yapı

- `src/keys.ts` (yeni, saf, DOM yok):
  - `keyAction(key: string, s: KeyState): KeyAction | null`. `KeyState` egzersiz türünü, cevap verilip verilmediğini, seçenek sayısını, eşleştirme sütun boyutlarını, bankada yazılanı ve ek bilgileri taşır. `KeyAction` şu eylemlerden biri: `primary`, `pick(index)`, `match(side, index)`, `bankType(text)`, `bankAdd(index)`, `bankUndo`, `explain`, `appeal`, `listen`, `mic`.
  - `bankMatch(bank: string[], used: number[], typed: string): number` — yazılanla başlayan ilk kullanılmamış kelimenin indeksi, yoksa `-1`. Büyük/küçük harfe ve aksanlara duyarsız.
- `Lesson.tsx`, `Story`: Bugünkü `Esc` dinleyicisi `keyAction` sonucunu mevcut fonksiyonlara (`check`, `next`, `setSel`, `pickMatch`, `speak` …) bağlayan tek bir `keydown` dinleyicisine dönüşür. Egzersiz mantığı değişmez.
- Mikrofon: `MicButton` dışarıdan tetiklenebilir olur (ör. `ref` ya da `toggle` sinyali).
- Rozetler `<kbd>` ile gösterilir. Bankada yazılan metin bankanın üstünde küçük bir satırda görünür, vurgulanan kelime `sel` sınıfını alır.

## Kenar durumlar

- Açık pencere varken ders kısayolları çalışmaz. İstisna: Açıkla penceresinde `Enter` = Anladım.
- Odak `textarea` ya da `input`'tayken yalnız `Esc` ve alanın kendi `Enter` davranışı çalışır.
- Kısayol işlenince `preventDefault` çağrılır, odaktaki butonun `Enter` ile kendiliğinden tetiklenmesi engellenir (çift eylem olmaz).
- `e.repeat` yok sayılır. `Ctrl`/`Cmd`/`Alt` basılıyken hiçbir kısayol çalışmaz.
- `checking` sürerken `Enter` bir şey yapmaz.
- Numaralar `e.key` ile okunur (üst sıra ve sayı tuş takımı, Türkçe Q ve F).

## Test

- `src/keys.test.ts`:
  - her tür için tuş → eylem
  - 9'dan fazla seçenekte numaraların çalışmaması
  - eşleştirmede `0` = 10. kutu
  - `bankMatch`: aksan/büyük harf farkı, kullanılmış kelimenin atlanması, eşleşme yoksa `-1`
  - değiştirici tuş ve `repeat` olaylarının yok sayılması
  - cevaptan sonra `1`/`2`
- `pnpm test`, `pnpm -s tsc --noEmit -p .`.
- Tarayıcı önizlemesi: Bir ders ve bir hikâye yalnız klavyeyle bitirilir (seçmeli, banka, yazma, eşleştirme, yanlış cevap sonrası Açıkla).
