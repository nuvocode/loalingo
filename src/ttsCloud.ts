// Byte-based TTS engines (cloud and local servers): the HTTP request for one line, nothing else. Pure, tested by src/ttsCloud.test.ts.

export type ByteRequest = { url: string; headers: Record<string, string>; body: string };

// ponytail: two premade multilingual voices (Rachel, Adam); the learner can paste others in Settings.
export const ELEVEN_VOICES: Record<"f" | "m", string> = { f: "21m00Tcm4TlvDq8ikWAM", m: "pNInz6obpgDQGcFmaJgB" };

/** ElevenLabs Turbo v2.5 (it takes an explicit language; without one it guesses from the text). Replies with MP3. */
export function elevenRequest(key: string, voiceId: string, text: string, lang: string): ByteRequest {
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5", language_code: lang.slice(0, 2).toLowerCase() }),
  };
}
