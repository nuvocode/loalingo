# Dalga 2 — G: Bahçe teması Plan

Spec: `docs/superpowers/specs/2026-09-29-v1-roadmap-design.md` § G.

Kural: iç adlar (`hearts`, `streak`, `chests`, `streakFreeze`, `gems`, i18n anahtarları) değişmez; yalnızca kullanıcıya görünen metin, ikon ve renk.

| Eski | TR | EN | İkon | Renk |
|---|---|---|---|---|
| Kalp | Damla | Drop(s) | `drop` | `--blue` |
| Seri | Kök | Roots | `roots` | `--green` |
| Seri dondurma | Sera | Greenhouse | `greenhouse` | `--green` |
| Sandık | Hasat sepeti | Harvest basket | `basket` | `--gold` |

## Görevler

1. **İkonlar**: `src/icons.tsx`'e `drop`, `roots`, `greenhouse`, `basket` (24x24, düz, renk token'lı). `Rail`, `Lesson`, `Screens`, `Learn` içindeki `heart`, `flame`, `shield`, `chest` kullanımları yenileriyle değişir; başka yerde kullanılmayan eski ikonlar silinir. Damla/kök/sera/sepet renkleri CSS ve satır içi renklerde güncellenir.
2. **Metinler**: `en.json` ve `tr.json` içindeki mevcut anahtarların DEĞERLERİ bahçe metaforuyla yeniden yazılır (anahtar adı, sıra, `{{değişken}}`, `_one`/`_other` korunur).
3. **Test**: `src/locales.test.ts` — iki dosyanın anahtar kümesi aynı; değerlerde eski sözcükler (heart/streak/chest/freeze; kalp/seri/sandık/dondur) yok.
