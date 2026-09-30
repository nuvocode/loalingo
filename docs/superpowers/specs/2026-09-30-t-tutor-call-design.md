# T — Tutor görüntülü ders modu

**Amaç:** Kaneo görevi "Tutor video call mode". Kullanıcı bir karakterle Preply benzeri canlı bir derse girer. Ekranın solunda tutor, sağında kullanıcının kamerası ya da profili, altta ince bir kontrol çubuğu vardır. Tutor her olayda karar veren küçük bir ajandır: konuşur, bekler, halini sorar, dersi bitirir. Dersin konusu kullanıcının bulunduğu seviye ve üniteden gelir; kullanıcı konuştukça şekillenir.

## Kararlar

- **Ayrı mod.** Mevcut Rol Yapma sohbeti ve aramasına (`chat:` / `call:`) dokunulmaz. Yeni `lessonId` öneki: `tutor:<char>`. `Face`, `speak`/`onMouth`, `generate` ve karakterler ortak kullanılır.
- **Kamera yalnızca yerel önizleme.** Görüntü hiçbir yere gönderilmez, AI görmez. Kamera kapalıyken sağ bölmede profil görünür.
- **Eller serbest mikrofon.** Mikrofon açıkken sürekli dinlenir. Basit enerji tabanlı sessizlik algılama kullanılır: konuşma başlar, ~1,2 sn sessizlik turu bitirir, ses metne çevrilir. Tutor konuşurken mikrofon duraklar (yankı olmasın). Söz kesme (barge-in) yok.
- **Beyin: olay → tek yapılandırılmış çağrı → eylem.** Araç çağırma (tool-calling) yok; yerel modeller (Ollama) bunda zayıf, projede de döngü altyapısı yok. Her olayda tek `generate()` çağrısı yapılır. Dönen `action` kapalı bir listeden seçilir. Yeni yetenek = listeye yeni değer + ekranda bir işleyici.

## Dosyalar

| Dosya | Görev |
|---|---|
| `src/tutor.ts` (yeni) | Beyin: `TutorEvent` tipi, `TUTOR_ACTIONS`, zod şeması, prompt kurucu, `tutorTurn(ctx, state, event)`. Arayüz yok. |
| `src/listen.ts` (yeni) | Eller serbest dinleme. `stt.ts` yakalama/örnekleme hattını kullanır, üstüne sessizlik algılama ekler. API: `listen(lang, { onUtterance, onLevel, onError })` → `{ stop(), pause(), resume() }`. Saf fonksiyon `segment(levels, threshold, silenceMs)` konuşma sınırlarını bulur. |
| `src/TutorCall.tsx` (yeni) | Ekran: iki bölme, alt çubuk, mesaj çekmecesi, bitiş özeti. |
| `src/App.tsx` | `tutor:` önekini `TutorCall`'a yönlendirir. |
| `src/screens/Screens.tsx` | Alıştırma ekranına "Tutor ile ders" kartı. Kart, 6 karakterin listelendiği bir sayfa açar; seçilen karakterle `startLesson("tutor:<char>")` çağrılır (`useStartLesson` AI ayarını denetler). |
| `src-tauri/Info.plist` | `NSCameraUsageDescription` eklenir. |
| `src/locales/*.json` | Yeni anahtarlar, 5 dilde (en, tr, de, fr, es). |

## Ekran (`TutorCall`)

- **Sol bölme — tutor:** büyük `Face` (durum: çağrı sürüyorsa `thinking`, konuşuyorsa `talking`, yoksa `idle`), adı, altında söylediğinin altyazısı. Altyazıya dokununca çeviri görünür. `correction` gelirse bölmenin altında küçük bir kart olarak çıkar; sesli okunmaz.
- **Sağ bölme — kullanıcı:** kamera açıksa `<video>` (getUserMedia `{ video: true }`, aynalı), kapalıysa profil avatarı ve adı. Mikrofon seviyesine göre kenarında bir halka (`onLevel`).
- **Alt çubuk (ince):** Mesaj, Mikrofon aç/kapat, Kamera aç/kapat, Sonlandır.
- **Mesaj çekmecesi:** yazışma geçmişi ve metin kutusu. Yazılana tutor her zaman **sesli** cevap verir.
- Sağ bölme bir yuvadır: ileride beyaz tahta ya da alıştırma paneli buraya gelir.

## Döngü ve veri akışı

**Durum** (`TutorCall` içinde):
- `history`: `{ from: "tutor" | "me", text, via: "voice" | "text" }[]`
- `notes`: tutorun kısa hafızası, en fazla ~300 karakter, her turda tutor tarafından yeniden yazılır (ör. "Hafta sonu konuşuldu. Şimdi: past simple. 2. soru soruldu.").
- `corrections`: bitiş özeti için.

**Olaylar:**

| Olay | Ne zaman |
|---|---|
| `start` | Ekran açılınca (StrictMode çift çalışmasına karşı ref ile bir kez). |
| `user_said(text)` | `listen.ts` bir konuşmayı metne çevirdi. |
| `user_typed(text)` | Mesaj çekmecesinden gönderildi. |
| `silence(sec)` | Mikrofon açık, tutorun son sözü soru ve 20 sn ses yok. `wait` eyleminden sonra eşik 60 sn. Arka arkaya en fazla 2 `check_in`; sonra kullanıcı dönene kadar tutor susar. |
| `mic(on)` / `cam(on)` | Kullanıcı düğmeye bastı. |

**Şema:**

```ts
{ action: "speak" | "wait" | "check_in" | "end", say: string, translation: string, correction: string, notes: string }
```

- `speak`: söyler, dersi sürdürür.
- `wait`: kısa bir söz ("Take your time"), sessizlik eşiği 60 sn olur.
- `check_in`: durumu sorar ("Is your mic working now?").
- `end`: vedalaşır; söz bitince bitiş özeti açılır.
- Gevşek şema (`looseTurn` gibi): `action` eksik ya da geçersizse `speak`, eksik metinler `""`.

**Sıralama:** Aynı anda tek çağrı. Meşgulken gelen kullanıcı konuşmaları ve mesajları kuyruğa girer; birden fazlaysa tek olayda birleşir. Meşgulken gelen `silence` atılır.

**Prompt'a girenler:** karakterin kişiliği, CEFR seviyesi, ana dil, hedef dil, mevcut ünitenin kelimeleri ve gramer kalıpları (`unitWords` / `unitGrammar`), ders akışı yönergesi, `notes`, son ~12 mesaj ve olay.

**Ders akışı yönergesi:** ısınma sohbeti → üniteden bir konu → pratik → konuya bağlı gerçek hayat sorusu ("Have you ever…?") → sonra kullanıcıdan aynı soruyu tutora sormasını iste. Tutor kullanıcının açtığı konuya uyar; konu yoksa ünite konusuna döner. `say`: hedef dilde, seviyeye uygun 1–2 kısa cümle.

## Bitiş

- "Sonlandır" (`useQuit` onayı) ya da tutorun `end` eylemi.
- Özet ekranı `Done` bileşenini kullanır, altına `corrections` listesi eklenir.
- XP: kullanıcı turu × 5 + düzeltmesiz tur × 5 + çağrı 5 dakikayı geçtiyse +20, `xpMult(s)` ile çarpılır; `recordSession(kind: "practice")`.
- Tur sınırı yok.

## Hatalar

- **AI çağrısı başarısız:** mevcut `Failed` (yeniden dene / çık) küçük bir katman olarak açılır; yeniden dene aynı olayı tekrar gönderir.
- **Mikrofon izni yok ya da `sttReady()` false:** mikrofon düğmesi devre dışı, açıklamalı; mesaj çekmecesi kendiliğinden açılır, ders yazıyla sürer.
- **Kamera izni yok:** sağ bölme profilde kalır, kamera düğmesi devre dışı.
- **Boş ya da tek kelimelik gürültü metni:** olay gönderilmez.
- **Uzun konuşma:** bir konuşma en fazla 15 sn (`MAX_RECORD_S`), sonra tur kendiliğinden biter.
- **Ekrandan çıkış:** mikrofon, kamera, TTS ve zamanlayıcılar temizlenir.

## Testler

- `src/tutor.test.ts`: prompt olayı, seviyeyi, ünite kelimelerini ve `notes`'u içerir; gevşek şema eksik/geçersiz `action`'ı `speak`'e çevirir.
- `src/listen.test.ts`: `segment()` enerji dizisinden doğru konuşma sınırlarını çıkarır (kısa gürültü yok sayılır, 1,2 sn sessizlik turu bitirir, 15 sn üst sınır).
- Yerel ayar anahtarları mevcut `locales.test.ts` ile denetlenir.
- Elle: `pnpm tauri dev` → konuş, sus → tur biter; "one sec" yaz → tutor bekler; 60 sn sus → tutor halini sorar; kamerayı aç/kapat.

## Kapsam dışı (v1)

- Beyaz tahta, birlikte alıştırma, ekran paylaşımı (yeni `action` + sağ bölme yuvası ile eklenecek).
- Söz kesme (barge-in).
- AI'ın kamerayı görmesi.
- Rol Yapma'nın bu ekrana taşınması.
