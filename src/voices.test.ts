import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSystemVoice } from "./voices.ts";

const voices = [{ name: "Zarvox", lang: "en-US" }, { name: "Daniel", lang: "en-GB" }, { name: "Samantha", lang: "en_US" }, { name: "Yelda", lang: "tr-TR" }];

test("known names match by gender", () => {
  assert.equal(pickSystemVoice(voices, "en-US", "f").voice?.name, "Samantha");
  assert.equal(pickSystemVoice(voices, "en-US", "m").voice?.name, "Daniel");
  assert.equal(pickSystemVoice(voices, "en", "f").pitch, 1);
});

test("no known name falls back to the first voice with a pitch shift", () => {
  const r = pickSystemVoice(voices, "tr-TR", "m");
  assert.equal(r.voice?.name, "Yelda");
  assert.equal(r.pitch, 0.85);
  assert.equal(pickSystemVoice(voices, "tr", "f").pitch, 1);
  assert.equal(pickSystemVoice(voices, "xx", "f").voice, undefined);
});

test("no gender keeps the default", () => {
  assert.deepEqual(pickSystemVoice(voices, "tr-TR"), { voice: voices[3], pitch: 1 });
});
