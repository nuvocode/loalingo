import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHARACTERS, parseTalkId, talkId, type CharacterId } from "./characters.ts";

const load = (l: string) => JSON.parse(readFileSync(new URL(`./locales/${l}.json`, import.meta.url), "utf8"));
const locales = [load("en"), load("tr")];
const ids = Object.keys(CHARACTERS) as CharacterId[];

test("three women, three men, distinct names and voices", () => {
  assert.equal(ids.length, 6);
  assert.equal(ids.filter((k) => CHARACTERS[k].gender === "f").length, 3);
  const voices = ids.map((k) => CHARACTERS[k].kokoroVoice);
  assert.equal(new Set(voices).size, 6);
  assert.equal(new Set(ids.map((k) => CHARACTERS[k].name)).size, 6);
  for (const k of ids) {
    const { gender, kokoroVoice } = CHARACTERS[k];
    assert.match(kokoroVoice, gender === "f" ? /^[ab]f_/ : /^[ab]m_/, k);
  }
  assert.ok(voices.some((v) => v.startsWith("bf_") || v.startsWith("bm_")));
});

test("4-6 topics each with unique ids and titles in en and tr", () => {
  for (const k of ids) {
    const { topics } = CHARACTERS[k];
    assert.ok(topics.length >= 4 && topics.length <= 6, k);
    assert.equal(new Set(topics.map((x) => x.id)).size, topics.length, k);
    for (const x of topics) {
      assert.notEqual(x.id, "free");
      for (const l of locales) assert.ok(typeof l.roleplay.topics[k]?.[x.id] === "string", `${k}.${x.id}`);
    }
  }
});

test("talk ids round-trip", () => {
  for (const k of ids) for (const x of CHARACTERS[k].topics) for (const voice of [false, true])
    assert.deepEqual(parseTalkId(talkId(voice, k, x.id)), { voice, who: k, topic: x });
  const free = "Çay: şeker mi, limon mu?";
  assert.deepEqual(parseTalkId(talkId(true, "leo", { free })), { voice: true, who: "leo", topic: { goal: `have a natural conversation about: ${free}` } });
});

test("broken talk ids are null", () => {
  for (const bad of ["", "chat", "chat:mia", "chat:mia:nope", "chat:zed:checkIn", "talk:mia:checkIn", "chat:mia:free:", "chat:mia:free:  ", "chat:toString:x"]) assert.equal(parseTalkId(bad), null, bad);
});

test("every character has a valid, distinct face", () => {
  const faces = ids.map((k) => CHARACTERS[k].face);
  for (const [i, f] of faces.entries()) {
    assert.ok(Number.isInteger(f.skin) && f.skin >= 0 && f.skin <= 4, ids[i]);
    assert.ok(Number.isInteger(f.hairColor) && f.hairColor >= 0 && f.hairColor <= 5, ids[i]);
  }
  assert.equal(new Set(faces.map((f) => JSON.stringify(f))).size, faces.length);
});
