# P — Tutor ile birlikte pratik

**Amaç:** Tutor görüntülü dersine (spec T, `2026-09-30-t-tutor-call-design.md`) Preply benzeri bir "birlikte alıştırma" modu eklemek. Ekranda bir pratik alanı açılır; öğrenci seçer ya da yazar, tutor okur, yönlendirir, ipucu verir ve hataları açıklar. Oturum ısınma → okuma → tartışma sırasıyla ilerler. Son aşamada ekranda yalnızca sorular görünür, cevaplar tutorla konuşularak verilir.

## Kararlar

- **Akışı istemci yönetir, tutor yorumlar.** Oturumun durumu saf bir modülde (`practice.ts`) tutulur: aşama, soru sırası, cevaplar ve puan. Tıklama ya da yazmayla verilen cevapları model değil istemci puanlar (`matchesAnswer`). Tutor sonucu olay olarak alır ve buna göre konuşur. Sıradaki soruya geçme kararını model vermez; bu yüzden soru atlama ya da yanlış puanlama olmaz.
- **Konular üniteden gelir.** Konu listesi, bitirilen üniteler olur; mevcut seviyenin ötesine geçilmez. Liste için model çağrılmaz.
- **İçerik tek çağrıda üretilir.** Konu seçilince tek bir `generate()` çağrısı ısınma sorularını, okuma metnini, anlama sorularını ve tartışma sorularını birlikte üretir. Sonuç `content_cache` tablosuna yazılır. Önbellek anahtarı `practice:<unitId>` olur.
- **Sesli cevap da geçerlidir.** Öğrenci cevabı söylerse ("I think it's B") tutorun cevabındaki yeni `answer` alanı, söylenen seçeneği ya da metni taşır. İstemci bu değeri tıklamayla aynı puanlayıcıdan geçirir.
- **Açılışın iki yolu var.** Mod ya alt çubuktaki "Birlikte pratik" butonuyla açılır ya da tutor `start_practice` eylemiyle kendisi açar. Buton, öncesinde böyle bir konuşma olmadan basıldıysa tutor "yanlışlıkla mı açtın?" diye sorar. Öğrenci "evet" derse tutor `stop_practice` eylemiyle modu kapatır. Tutor pratikten zaten konuşulduğunu `notes` alanından ve konuşma geçmişinden bilir; bu durumda soruyu sormaz.

## Dosyalar

| Dosya | Görev |
|---|---|
| `src/practice.ts` (yeni) | Saf modül, testi `practice.test.ts`. İçerdikleri: `PracticeSet` zod şeması, `PracticeState`, `answer(state, given)` (puanlama ve aşama geçişi), `current(state)`, `practiceTopics(course, done, level)` (bitirilen üniteler), `practicePrompt(...)`. |
| `src/tutor.ts` | `TUTOR_ACTIONS` listesine `start_practice` ve `stop_practice` eklenir. Şemaya `answer` alanı eklenir (varsayılan `""`). Yeni olaylar (aşağıda) tanımlanır. `tutorPrompt`, pratik açıkken ekrandaki soruyu ve aşamayı bağlama ekler. |
| `src/lessons.ts` | `loadPractice(unit)`: önbellekte varsa oradan okur, yoksa `generate()` ile üretir. |
| `src/PracticePanel.tsx` (yeni) | Pratik alanı: konu kartları, ısınma soruları, okuma metni ve tartışma soruları. Seçmeli ve kelime bankası soruları `Lesson.tsx` ile aynı CSS sınıflarıyla (`opt-grid`, `opt`, `bank`, `tok`) çizilir. `Lesson.tsx` içindeki çiziciler ayrı bileşen olmadığı için yeniden kullanılmaz; can ve ilerleme mantığı da alınmaz. |
| `src/TutorCall.tsx` | `practice` durumu, alt çubuktaki buton, yeni eylemlerin işleyicileri ve `practice-open` yerleşim sınıfı. |
| `src/styles.css` | Pratik açıkken kullanılan grid (aşağıda). |
| `src/locales/*.json` | Yeni anahtarlar, 5 dilde (en, tr, de, fr, es). |

## İçerik (`PracticeSet`)

```ts
{
  warmup: Item[];                          // 3-4 soru: multiple_choice, word_bank, fill_blank (mevcut REGISTRY şemaları)
  reading: { title: string; text: string }; // seviyeye uygun, 80-120 kelime, ünitenin kelime ve gramerini kullanır
  comprehension: Item[];                   // metne dayalı 2 çoktan seçmeli soru
  discussion: string[];                    // 3 soru. Biri kişisel deneyim sorusu ("Have you ever…?"); hepsi gerçek hayata bağlanır
}
```

## Aşamalar

`PracticeState.stage`: `topics → warmup → reading → comprehension → discussion → done`

1. **topics:** Ünite kartları listelenir. Tutor "hangi konuyu çalışalım?" diye sorar. Öğrenci karta tıklar ya da konuyu söyler; sesli seçimde tutor `answer` alanında ünite başlığını döner. İçerik yüklenirken tutor sohbeti sürdürür.
2. **warmup / comprehension:** Ekranda tek soru görünür. Tutor soruyu kısaca tanıtır; okunması gereken bir cümle varsa sesli okur.
   - **Doğru cevapta** tutor cevabın neden doğru olduğunu tek cümleyle söyler ve oturum sonraki soruya geçer.
   - **Yanlış cevapta** tutor hatanın nedenini doğrudan açıklar. Doğru cevap ekranda gösterilir ve tutor neden doğru olduğunu anlatır. Hata `mistakes` tablosuna yazılır.
   - **Takılmada** ipucu verilir. Takılma şu durumlardan biridir: soru sonrası 20 sn sessizlik (mevcut `SILENCE_S`), öğrencinin "anlamadım" demesi, ya da ipucu butonu. Tutor cevabı söylemeden ipucu verir; bunu sağlayan prompt kuralı "cevabı asla söyleme"dir.
3. **reading:** Metin ekranda görünür, tutor sesli okur. Ardından "devam" butonuyla ya da öğrencinin sözlü onayıyla comprehension aşamasına geçilir.
4. **discussion:** Ekranda yalnızca sorular listelenir, cevap alanı yoktur. Etkin soru vurgulanır.
   - Tutor soruyu sorar, öğrencinin cevabına tepki verir, kısa bir takip sorusu sorabilir ve kendi kısa anekdotunu paylaşır ("bir keresinde benim de başıma geldi…").
   - Son soruda roller değişir: tutor "şimdi sen bana sor" der ve öğrencinin sorusuna kendi deneyimiyle cevap verir.
   - Sıradaki soruya geçiş iki yolla olur: tutorun `speak` cevabıyla birlikte `answer: "next"` dönmesi ya da öğrencinin "sonraki" butonuna basması.
5. **done:** Panel kapanır ve görüşme normal akışına döner. Tutor kısa bir değerlendirme yapar.

## Olaylar ve eylemler

Yeni `TutorEvent` türleri:
- `practice_opened`: panel butonla açıldı. Bunun önceden konuşulup konuşulmadığına model, geçmişe ve `notes` alanına bakarak karar verir.
- `practice_item { stage, item }`: yeni soru ekrana geldi.
- `practice_answer { correct, given, expected }`
- `practice_stuck`
- `practice_done { score, total }`

Yeni eylemler:
- `start_practice`: paneli konu listesiyle açar.
- `stop_practice`: paneli kapatır.

`answer` alanı: sesli seçimleri ve cevapları taşır (konu, seçenek metni, `"next"`). Alan boş gelirse görmezden gelinir.

## Yerleşim

- **Geniş ekran (≥768 px):** `.call-grid.practice-open` iki sütun olur (`2fr 1fr`). Sol sütunun tamamında pratik paneli durur. Sağ sütunda tutor ve kullanıcı kartları alt alta yer alır (`grid-template-rows: 1fr 1fr`).
- **Mobil (<768 px):** Üst satırda pratik paneli (`1fr`), alt satırda tutor ve kullanıcı yan yana durur (yaklaşık `40vh`, `1fr 1fr`).
- Pratik açıkken `Face` küçük kartta da ölçeklenir. Mevcut SVG `viewBox` bunu zaten karşılar.

## Puan ve bitiş

- Her doğru cevap XP'ye eklenir; bu XP mevcut görüşme XP hesabına (`TutorCall.tsx` içindeki özet) katılır.
- Yanlış cevaplar mevcut `mistakes` akışına yazılır. Böylece "hatalarını tekrar et" pratiği bu soruları da görür.
- Görüşme pratik sırasında sonlandırılırsa o ana kadar biriken puan sayılır. Yarıda kalan oturum kaydedilmez.

## Hata durumları

- **İçerik üretilemezse** (`generate` 3 denemede başarısız olursa): Panelde "hazırlanamadı, tekrar dene" mesajı gösterilir. Tutora `practice_done { total: 0 }` gönderilmez; tutor yalnızca sohbete döner.
- **Sesli `answer` hiçbir seçenekle eşleşmezse** yanlış sayılmaz, görmezden gelinir. Tutor normal şekilde konuşmaya devam eder.
- **Hiç bitirilmiş ünite yoksa** mevcut ünite tek kart olarak listelenir.

## Test

- `practice.test.ts`: puanlama (tıklama ve sesli metin), aşama geçişleri, `answer: "next"` davranışı, `practiceTopics` seviye sınırı.
- `tutor.test.ts`: yeni eylemler, gevşek `answer` ayrıştırma, pratik bağlamının prompta girmesi.
- Tarayıcı önizlemesi: buton ile açılış, "yanlışlıkla" kapanışı, dört aşama boyunca ilerleme, geniş ve mobil yerleşim.

## Kapsam dışı

Beyaz tahta, ekran paylaşımı, ünite dışı serbest konular, yarıda kalan oturumu sonra sürdürme, ısınmada eşleştirme ve dinleme türleri.
