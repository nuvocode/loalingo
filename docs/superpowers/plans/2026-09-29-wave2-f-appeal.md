# Wave 2 / F — Answer appeal

Spec: `docs/superpowers/specs/2026-09-29-v1-roadmap-design.md` section F.

1. `src/lessons.ts`: `appeal(c, question, expected, given, reason)` next to `judge`, schema `{ accepted, reason }`, same one-retry pattern. Prompt: fair, not a pushover.
2. `src/appeal.ts`: pure `acceptAppeal(score, hearts, maxHearts, heartLost)` (score/XP as a correct answer, restore the lost heart) plus `src/appeal.test.ts`.
3. `src/db.ts`: `deleteMistakeByItem(enrollmentId, item)` removes the mistakes row added for the question.
4. `src/Lesson.tsx`: feedback state remembers `judged` (AI-judged wrong), `lost` (a heart was taken), `appealed`. Band shows the appeal button only for judged-wrong, unappealed answers; modal with textarea + send. Accept flips the band to correct; reject shows the reason; AI failure shows an error and keeps the appeal available.
5. Strings in `en.json` and `tr.json` (neutral wording, no new heart text).
