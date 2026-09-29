# Wave 2 / C: Settings layout + profile deletion

Spec: `docs/superpowers/specs/2026-09-29-v1-roadmap-design.md`, section C.

## Task 1: profile delete SQL (TDD)
- `src/profileDelete.ts`: pure `deleteProfileSql(id)` returning one `BEGIN; ...; COMMIT;` string. Id validated with `Number.isInteger` and inlined. Deletes `words`, `mistakes`, `content_cache`, `step_progress`, `enrollments` of the profile, then `profiles`.
- `src/profileDelete.test.ts` (sql.js): no rows of the deleted profile remain in any table; other profiles' rows remain; non-integer id throws.
- `db.deleteProfile(id)`: one `execute` call (+ ROLLBACK on failure, as in `migrate.ts`), clears `last_profile` if it equals `id`.

## Task 2: profile deletion UI (`src/screens/Profiles.tsx`)
- Profile card becomes a row with the select button plus a ⋯ button opening a small menu with "Sil".
- PIN-protected profile: reuse `PinSheet` with an `onOk` callback, then the confirm sheet.
- Confirm sheet: spec text, name input, delete button disabled until the exact name is typed.
- After delete the gate reloads the list; zero profiles falls back to the create form.
- Strings in `en.json` / `tr.json` under `profiles.*`; CSS for the menu in `styles.css`.

## Task 3: settings layout (`src/screens/Settings.tsx`)
- Order: Kurs, Genel (toggles), Görünüm, Yapay zekâ ve ses (AI row, TTS "Sistem sesi", STT "Whisper (yerel)"), `{/* Veri (B) */}`, Güncellemeler, Hesap.
- "Çıkış yap" becomes "Profil değiştir" (same `logout`).
- New strings `settings.general`, `settings.aiVoice`, `settings.tts`, `settings.stt`, `settings.ttsSystem`, `settings.sttWhisper`.

## Checks
`pnpm test`, `pnpm -s tsc --noEmit -p .` after each task.
