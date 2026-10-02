import { test } from "node:test";
import assert from "node:assert/strict";
import { elevenRequest, ELEVEN_VOICES } from "./ttsCloud.ts";

test("ElevenLabs request: voice in the path, key header, turbo model with the language", () => {
  const r = elevenRequest("k123", ELEVEN_VOICES.f, "Hola", "es-ES");
  assert.equal(r.url, "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM");
  assert.deepEqual(r.headers, { "xi-api-key": "k123", "Content-Type": "application/json" });
  assert.deepEqual(JSON.parse(r.body), { text: "Hola", model_id: "eleven_turbo_v2_5", language_code: "es" });
});
