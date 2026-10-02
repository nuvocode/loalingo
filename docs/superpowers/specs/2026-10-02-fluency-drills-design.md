# Fluency drills (Practice) — design

Kaneo epic #31. Agreed 2026-10-02. Goal: four timed speaking drills without crowding the UI.

## Decisions

- **One entry point.** Practice gets a single card, "Fluency drills". Like the other voice cards, it is gated by `useSpeakBlock`.
- **Two-step sheet.** Step 1 lists the four drills, each with a one-line description. Step 2 holds that drill's settings, then Back and Start.
- **Drills are a mode of the voice chat** (`Chat` with `voice: true`, the roleplay "Call"). They open through their own lesson id, the same way rehearsal does. No new screen, no TutorCall changes.
- **Timer in the top bar.** The `Shell` progress bar shows time left, with a small `mm:ss` next to it. Nothing else is added to the screen.
- **Ladder ships with 3 rungs.** Rung 4 (interruptions, 8 s mic cap, the "leave rung 4" button) is out of scope.
- **4/3/2 asks for voice analysis** when it is off. In step 2: one line plus "Turn on and start". Plain Start still runs the drill, and unmeasured values show "—".

## Entry: Practice card and sheet

Step 1, the list:

| Drill | Description line |
|---|---|
| Planning time | Shows the next planning time, e.g. "Think 60 s, then talk 3 min" |
| 4/3/2 | "Same topic: 4, 3, then 2 minutes" |
| Pressure ladder | "3 rungs, each a little harder" |
| Structure | Shows the target, e.g. "Target: past simple" |

Step 2, the settings:
- Topic: text input, defaults to the current unit's title.
- Character: the face picker from `RehearseSheet`, defaults to Leo.
- One drill-specific control:
  - Ladder: rung 1/2/3 as a `.seg` control.
  - 4/3/2 with voice analysis off: the note and "Turn on and start".

## The drill screen

- **Screen:** the existing voice `Chat`: face, bubbles, `MicButton`.
  - The subtitle under the name becomes "<drill> · <topic>".
  - The progress bar becomes a time bar. When it reaches 0 the mic closes and `finish()` runs.
- **Planning pre-screen** (planning drill and ladder rung 1):
  - Contents: the topic, a large `mm:ss` countdown and "Start speaking". No input field.
  - Countdown at 0 or the button calls `turn([])` exactly once.
- **Structure note:** only shown when the learner avoided the target three times (see below). It is one line above the chat, "This time, try using *<structure>*". Otherwise nothing appears, never "you may be avoiding".
- **Session length:** 3 min for planning, ladder and structure; 4, 3 and 2 min for 4/3/2.

## Each drill

- **Planning time**
  - Planning time comes from `nextPlanningSec(history)`: 60 → 30 → 0, two sessions per step, never goes back up.
  - History is the past sessions with `conditions.planningTimeSec > 0`, newest first.
- **4/3/2**
  - Three rounds on the same topic. The id carries `round` and each previous round's stats (`prev`); no table.
  - Rounds 2–3 add `REPETITION_RULE` to the prompt.
  - Between rounds, the footer shows "Next round".
  - After round 3, the `Rounds` card shows three columns with rows for words/min, pause ratio and fillers. Unmeasured values show "—". There is a footnote and no accuracy row.
- **Pressure ladder**
  - `rungContext(1..3)`.
  - Rung 1 starts with 60 s planning. That session does not count toward the planning drill's progression.
  - Rung 2 has no planning.
  - Rung 3 picks a random topic from a short `NOVEL_TOPICS` list.
- **Structure**
  - Goal: `unitGrammar(currentUnit)[0]`.
  - The prompt steers the talk toward a natural use of the goal.
  - At the end, `avoidancePass` asks the model whether the learner attempted the goal, using voice turns only. `attempted: false` → the row gets `avoided = goal`.
  - At start, `goalToName(last 30 sessions)` returns a goal avoided in ≥3 different sessions (newest wins). If it does, the system prompt gets `NAME_STRUCTURE_PROMPT(goal)` and the screen shows the note.

## Data

- **Migration v4:**
  - Adds `speech_sessions.conditions TEXT`, a JSON `MonitorContext`; NULL means not measured.
  - Adds `speech_sessions.avoided TEXT`.
  - Upgrading takes a `pre-v4-*` backup.
- **`saveSpeechSession`** takes the mode `tutor | chat | rehearse | drill` plus `conditions` and `avoided`. `listSpeechSessions(profileId, limit)` returns them.
- **What gets saved:**
  - Every voice `Chat` session with at least one utterance saves one row; drills save with mode `drill`.
  - TutorCall saves `{ ...FREE_CONTEXT, mode, topicFamiliarity: "prepared" }`.
- **Memory:** drill sessions are not written to memory (`rememberSession`). The coach screen counts them like other sessions.
- **Prompt history:** drill prompts keep only the last 12 messages.

## Order (Kaneo subtasks)

1. #39 condition logging (migration v4 + voice chat metrics)
2. #40 Practice card + two-step sheet + planning drill + time bar
3. #41 4/3/2 + rounds card
4. #42 ladder, 3 rungs
5. #43 avoidance pass
6. #44 structure drill + note

Branch `feature/fluency-drills` → merge into `test`. Each subtask moves on with approval. Nothing goes to `master` without approval.

## Out of scope

- Ladder rung 4.
- Self-repair classification.
- Monitor Load profile.
- Accuracy on screen.

## Testing

- **`src/drills.test.ts`:**
  - `nextPlanningSec` table.
  - `planningHistory` drops zeros.
  - Drill id round-trip.
  - `fourThreeTwoContext`; `REPETITION_RULE` only in rounds 2–3.
  - `rungContext(1..3)`.
  - `verifyAvoidance` gates.
  - `goalToName`: 2 rows → null, 3 → the goal, the newest of two goals wins.
- **`src/migrate.test.ts`:** v4 columns exist.
- **`speech.test.ts`:** passes unchanged.
- **Browser checks:** sheet steps, time bar, planning countdown fires once, rounds card, structure note shows only after three avoided rows.
