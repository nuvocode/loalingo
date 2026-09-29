# Wave 2 / I: English C1 and C2

Spec: `docs/superpowers/specs/2026-09-29-v1-roadmap-design.md` section I. Touches only `courses/en.yml`, `src/course.test.ts` and this plan (`src/course.ts` is unchanged unless validation needs extending).

## Findings from A1-B2

- Every level has 10 units and a checkpoint (`{word_select 3, fill_blank 3, listen_select 3, translate 3, dialogue}`, required_score 80).
- Steps per level: A1 40, A2 43, B1 43, B2 43. Units have 4-5 steps; the last step of a unit is a speaking step (`speak` + `dialogue` with `scenario` snake_case and a `goal`).
- Step ids are kebab-case and descriptive (no level prefix); uniqueness is already enforced by `parseCourse`.
- B1 and B2 have 11 speaking/review steps with neither `vocabulary` nor `grammar`. The AI prompt gets nothing to key on for these, so they get a `vocabulary` list.

## Steps

1. Extend `src/course.test.ts` with course-structure tests: levels present and ordered, 10 units per level, unique step ids, every step has non-empty `vocabulary` or `grammar` (no blank strings), every level has a checkpoint, per-level step count in 40-46 (B2 has 43). The expected level list grows with each commit (A1-B2, then C1, then C2) so every commit is green.
2. Fix the A1-B2 audit findings (add `vocabulary` to the 11 steps above).
3. Write C1 (Advanced): 10 themed units, 43 steps, checkpoint. Commit.
4. Write C2 (Proficiency): same shape. Commit.
5. `pnpm test` and `pnpm -s tsc --noEmit -p .` after each commit.

## C1 units

Inversion and emphasis; advanced conditionals and hypotheticals; advanced passives and structures; hedging and discourse; workplace and professional life; media and information; science, technology and ethics; society and environment; idioms and collocations; argument and academic writing.

## C2 units

Register and nuance; subtle modality and stance; idiom and figurative language; rhetoric; humour, irony and wordplay; academic and formal writing; literature and style; ideas and philosophy; culture, language and identity; mastery and mediation.
