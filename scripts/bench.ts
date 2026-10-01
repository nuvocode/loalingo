// Live-lesson LLM latency against Ollama: the tutor's real prompt, schema and sentence split (src/tutor.ts), sent the way
// src/ai.ts sends it (OpenAI-compatible /v1, streamed). Measures only the model; speech end → first sound is in src/latency.ts.
// pnpm bench [model…]   (default: every model Ollama lists; EFFORT=low|none|… overrides the app's reasoning choice, TURNS=5)
import { z } from "zod";
import { tutorSystem, tutorPrompt, tutorSchema, partialSay, sentences, type TutorMsg } from "../src/tutor.ts";

const BASE = process.env.OLLAMA ?? "http://localhost:11434", TURNS = +(process.env.TURNS ?? 5);
const ctx = { name: "Lily", persona: "Dry, sarcastic teen who secretly cares.", target: "English", native: "Turkish", level: "A2",
  unit: "Daily routines", words: ["wake up", "breakfast", "usually", "commute", "weekend"], grammar: ["present simple", "adverbs of frequency"], about: [] as string[] };
const said = ["Hi! I am fine, thanks. I am little tired today.", "I usually wake up at seven o'clock.", "I go to work with metro, it take forty minutes.",
  "On weekend I sleep late and I meet my friends.", "Yes, I have been to London one time."];
const schema = z.toJSONSchema(tutorSchema);
const system = tutorSystem(ctx) + `\n\nJSON schema of the reply:\n${JSON.stringify(schema)}`;
// Same rule as `reasoning` in src/ai.ts.
const effort = (m: string) => process.env.EFFORT ?? (m.startsWith("glm-5.3-flash") ? "low" : "none");

type Turn = { say?: number; total: number; tokens: number; reply: string };

async function turn(model: string, history: TutorMsg[], text?: string): Promise<Turn> {
  const prompt = tutorPrompt(ctx.name, history, "", text ? { kind: "user_said", text } : { kind: "start" });
  const t0 = performance.now();
  const r = await fetch(`${BASE}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(180_000), // like generateStream; a thinking model can otherwise run for minutes
    body: JSON.stringify({ model, stream: true, stream_options: { include_usage: true }, reasoning_effort: effort(model),
      response_format: { type: "json_schema", json_schema: { name: "response", schema, strict: true } },
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }) });
  if (!r.ok || !r.body) throw new Error(`${r.status} ${await r.text()}`);
  let raw = "", buf = "", say: number | undefined, tokens = 0;
  for await (const chunk of r.body.pipeThrough(new TextDecoderStream())) {
    buf += chunk;
    for (let i; (i = buf.indexOf("\n")) >= 0; buf = buf.slice(i + 1)) {
      const line = buf.slice(0, i).trim();
      if (!line.startsWith("data:") || line === "data: [DONE]") continue;
      const j = JSON.parse(line.slice(5));
      if (j.usage) tokens = j.usage.completion_tokens;
      raw += j.choices?.[0]?.delta?.content ?? "";
      if (say === undefined) { const p = partialSay(raw); if (sentences(p.text, p.closed).length) say = performance.now() - t0; }
    }
  }
  return { say, total: performance.now() - t0, tokens, reply: partialSay(raw).text };
}

const median = (v: number[]) => (v.length ? Math.round([...v].sort((a, b) => a - b)[v.length >> 1]) : NaN);

const models: string[] = process.argv.slice(2).length ? process.argv.slice(2)
  : (await (await fetch(`${BASE}/api/tags`)).json()).models.map((m: { name: string }) => m.name).filter((n: string) => !/embed|ocr/.test(n));

const rows = [];
for (const model of models) {
  console.error(`\n${model} (reasoning ${effort(model)})`);
  try {
    await turn(model, []); // load the model first, like warmUp() before a call
    const history: TutorMsg[] = [], turns: Turn[] = [];
    for (let k = 0; k < TURNS; k++) {
      const text = k ? said[(k - 1) % said.length] : undefined;
      if (text) history.push({ from: "me", text, via: "voice" });
      const t = await turn(model, history, text);
      history.push({ from: "tutor", text: t.reply, via: "voice" });
      turns.push(t);
      console.error(`  first sentence ${Math.round(t.say ?? NaN)} ms · reply ${Math.round(t.total)} ms · ${t.tokens} tokens — ${t.reply.slice(0, 60)}`);
    }
    rows.push({ model, reasoning: effort(model), "first sentence (ms)": median(turns.flatMap((t) => t.say ?? [])),
      "reply (ms)": median(turns.map((t) => t.total)), tokens: median(turns.map((t) => t.tokens)) });
  } catch (e) {
    rows.push({ model, reasoning: effort(model), error: String((e as Error).message ?? e).slice(0, 80) });
  }
}
console.log(`\nMedian of ${TURNS} turns:`);
console.table(rows);
