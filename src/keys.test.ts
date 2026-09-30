import { test } from "node:test";
import assert from "node:assert/strict";
import { bankMatch, inField, keyAction, type KeyState } from "./keys.ts";

const k = (key: string, extra = {}) => ({ key, ...extra });
const choice: KeyState = { kind: "choice", answered: false, options: 4 };

test("choice: digits pick, Enter is the main button", () => {
  assert.deepEqual(keyAction(k("1"), choice), { do: "pick", index: 0 });
  assert.deepEqual(keyAction(k("4"), choice), { do: "pick", index: 3 });
  assert.equal(keyAction(k("5"), choice), null);
  assert.deepEqual(keyAction(k("9"), { ...choice, options: 9 }), { do: "pick", index: 8 });
  assert.deepEqual(keyAction(k("Enter"), choice), { do: "primary" });
  assert.equal(keyAction(k("1"), { ...choice, options: 10 }), null); // more options than digits: off
});

test("ignores repeats, modifiers and Shift+Enter", () => {
  assert.equal(keyAction(k("Enter", { repeat: true }), choice), null);
  assert.equal(keyAction(k("1", { ctrlKey: true }), choice), null);
  assert.equal(keyAction(k("1", { metaKey: true }), choice), null);
  assert.equal(keyAction(k("1", { altKey: true }), choice), null);
  assert.equal(keyAction(k("Enter", { shiftKey: true }), choice), null);
});

test("Space replays the audio when there is some", () => {
  assert.deepEqual(keyAction(k(" "), { ...choice, listen: true }), { do: "listen" });
  assert.equal(keyAction(k(" "), choice), null);
  assert.deepEqual(keyAction(k(" "), { kind: "other", answered: false, listen: true }), { do: "listen" });
});

test("match: left 1–5, right 6–9 then 0", () => {
  const m: KeyState = { kind: "match", answered: false, matchL: 5, matchR: 5 };
  assert.deepEqual(keyAction(k("1"), m), { do: "match", side: "l", index: 0 });
  assert.deepEqual(keyAction(k("5"), m), { do: "match", side: "l", index: 4 });
  assert.deepEqual(keyAction(k("6"), m), { do: "match", side: "r", index: 0 });
  assert.deepEqual(keyAction(k("0"), m), { do: "match", side: "r", index: 4 });
  const small: KeyState = { kind: "match", answered: false, matchL: 3, matchR: 3 };
  assert.deepEqual(keyAction(k("4"), small), { do: "match", side: "r", index: 0 });
  assert.equal(keyAction(k("7"), small), null);
  assert.equal(keyAction(k("1"), { kind: "match", answered: false, matchL: 6, matchR: 5 }), null); // 11 boxes: off
});

test("bank: typing, adding, undoing, checking", () => {
  const b = (typed: string, hit: number): KeyState => ({ kind: "bank", answered: false, typed, hit });
  assert.deepEqual(keyAction(k("c"), b("", -1)), { do: "bankType", text: "c" });
  assert.deepEqual(keyAction(k("a"), b("c", 2)), { do: "bankType", text: "ca" });
  assert.deepEqual(keyAction(k(" "), b("ca", 2)), { do: "bankAdd", index: 2 });
  assert.deepEqual(keyAction(k("Enter"), b("ca", 2)), { do: "bankAdd", index: 2 });
  assert.deepEqual(keyAction(k("Enter"), b("zz", -1)), { do: "bankType", text: "zz" });
  assert.deepEqual(keyAction(k(" "), b("zz", -1)), { do: "bankType", text: "zz" });
  assert.deepEqual(keyAction(k("C", { shiftKey: true }), b("", -1)), { do: "bankType", text: "C" });
  assert.equal(keyAction(k(" "), b("", -1)), null);
  assert.deepEqual(keyAction(k("Backspace"), b("ca", 2)), { do: "bankType", text: "c" });
  assert.deepEqual(keyAction(k("Backspace"), b("", -1)), { do: "bankUndo" });
  assert.deepEqual(keyAction(k("Enter"), b("", -1)), { do: "primary" });
});

test("speak: Space toggles the mic", () => {
  assert.deepEqual(keyAction(k(" "), { kind: "speak", answered: false }), { do: "mic" });
});

test("after an answer: Enter continues, 1 explains, 2 appeals", () => {
  const a: KeyState = { kind: "choice", answered: true, options: 4, canExplain: true, canAppeal: true };
  assert.deepEqual(keyAction(k("Enter"), a), { do: "primary" });
  assert.deepEqual(keyAction(k("1"), a), { do: "explain" });
  assert.deepEqual(keyAction(k("2"), a), { do: "appeal" });
  assert.equal(keyAction(k("1"), { ...a, canExplain: false }), null);
  assert.equal(keyAction(k("2"), { ...a, canAppeal: false }), null);
  assert.deepEqual(keyAction(k(" "), { ...a, listen: true }), { do: "listen" });
  assert.equal(keyAction(k("c"), { kind: "bank", answered: true, typed: "", hit: -1 }), null);
});

test("bankMatch: first unused word starting with the typed text, ignoring case and accents", () => {
  const bank = ["Café", "cat", "dog", "cat"];
  assert.equal(bankMatch(bank, [], "ca"), 0);
  assert.equal(bankMatch(bank, [], "cafe"), 0);
  assert.equal(bankMatch(bank, [0], "ca"), 1);
  assert.equal(bankMatch(bank, [0, 1], "ca"), 3);
  assert.equal(bankMatch(bank, [], "x"), -1);
  assert.equal(bankMatch(bank, [], ""), -1);
});

test("inField: anything inside an input, textarea or contenteditable", () => {
  assert.equal(inField({ closest: (_s: string) => ({}) } as unknown as EventTarget), true);
  assert.equal(inField({ closest: () => null } as unknown as EventTarget), false);
  assert.equal(inField(null), false);
});
