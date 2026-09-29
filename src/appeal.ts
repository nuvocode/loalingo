// F: state change when an appeal is accepted. Pure, tested by src/appeal.test.ts.
export const APPEAL_XP = 10; // same as a normal correct answer in Lesson.grade

/** The answer now counts as correct; a heart lost for it (if any) comes back, capped at the max. */
export function acceptAppeal(score: { correct: number; xp: number }, hearts: number, maxHearts: number, heartLost: boolean) {
  return {
    score: { correct: score.correct + 1, xp: score.xp + APPEAL_XP },
    hearts: heartLost ? Math.min(maxHearts, hearts + 1) : hearts,
  };
}
