# Contributing

Thanks for helping. Setup and commands are in the [README](README.md#development).

## Courses (no code needed)

Each course is one YAML file in [`courses/`](courses/). It lists levels (CEFR) > units > steps, with each step's vocabulary, grammar patterns and activity types. The AI writes the actual exercises from that, so a course is mostly a well-ordered syllabus.

- Copy the shape of an existing file. [`courses/es.yml`](courses/es.yml) is a compact A1 example, [`courses/en.yml`](courses/en.yml) goes up to C2.
- Titles and descriptions are in English; vocabulary and example patterns are in the target language.
- The schema and activity types are in [`src/course.ts`](src/course.ts). `pnpm test` validates every bundled course.
- To try a course without building, drop the file into the app's data folder (`courses/`) and restart Sprigo.

Good first contributions: A2 for Spanish, French, German or Turkish, or A1 for a new language.

## Code

- Branch from `master`, open the pull request against `test`.
- Keep changes small and focused, and run `pnpm test` before pushing.
- Design decisions and their reasons are in [docs/DECISIONS.md](docs/DECISIONS.md) (in Turkish; ask in the issue if something is unclear).
