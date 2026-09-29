// AI providers (DECISIONS C1). Config is device-wide (E6): device_settings "ai" + API key in the OS keychain.
import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { isTauri, getSetting, setSetting } from "./db";

export type ProviderId = "ollama" | "lmstudio" | "openai" | "anthropic" | "gemini";
export const PROVIDERS: Record<ProviderId, { label: string; baseURL: string; needsKey: boolean }> = {
  ollama: { label: "Ollama", baseURL: "http://localhost:11434", needsKey: false },
  lmstudio: { label: "LM Studio", baseURL: "http://localhost:1234/v1", needsKey: false },
  openai: { label: "OpenAI", baseURL: "https://api.openai.com/v1", needsKey: true },
  anthropic: { label: "Anthropic", baseURL: "https://api.anthropic.com/v1", needsKey: true },
  gemini: { label: "Gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta", needsKey: true },
};
export type AiConfig = { provider: ProviderId; baseURL: string; model: string };

// Tauri's HTTP plugin sidesteps CORS for local servers and cloud APIs; the dev browser preview uses window.fetch.
const http = (isTauri ? tauriFetch : window.fetch.bind(window)) as typeof fetch;
const trim = (u: string) => u.replace(/\/+$/, "");

export async function loadAiConfig(): Promise<AiConfig | null> {
  const v = await getSetting("ai");
  return v ? JSON.parse(v) : null;
}
export const saveAiConfig = (c: AiConfig) => setSetting("ai", JSON.stringify(c));

// ---- API keys ----
// ponytail: the dev browser preview has no keychain, so it keeps keys in localStorage. Never used in the app.
const DEV_KEY = (p: ProviderId) => `loalingo.devkey.${p}`;
export async function getKey(p: ProviderId): Promise<string | null> {
  if (!PROVIDERS[p].needsKey) return null;
  return isTauri ? invoke<string | null>("secret_get", { key: `api-key.${p}` }) : localStorage.getItem(DEV_KEY(p));
}
export async function setKey(p: ProviderId, value: string | null) {
  if (isTauri) return invoke("secret_set", { key: `api-key.${p}`, value });
  value ? localStorage.setItem(DEV_KEY(p), value) : localStorage.removeItem(DEV_KEY(p));
}

// ---- Models ----

function model(c: AiConfig, key: string | null): LanguageModel {
  const baseURL = trim(c.baseURL || PROVIDERS[c.provider].baseURL);
  const apiKey = key ?? "";
  switch (c.provider) {
    // Ollama and LM Studio both speak the OpenAI chat API with json_schema structured output.
    case "ollama": return createOpenAICompatible({ name: "ollama", baseURL: `${baseURL}/v1`, fetch: http, supportsStructuredOutputs: true }).chatModel(c.model);
    case "lmstudio": return createOpenAICompatible({ name: "lmstudio", baseURL, fetch: http, supportsStructuredOutputs: true }).chatModel(c.model);
    case "openai": return createOpenAI({ apiKey, baseURL, fetch: http })(c.model);
    case "anthropic": return createAnthropic({ apiKey, baseURL, fetch: http, headers: { "anthropic-dangerous-direct-browser-access": "true" } })(c.model);
    case "gemini": return createGoogle({ apiKey, baseURL, fetch: http })(c.model);
  }
}

/** Model ids offered by the provider; throws with the server's message when unreachable/unauthorized. */
export async function listModels(c: AiConfig, key: string | null): Promise<string[]> {
  const base = trim(c.baseURL || PROVIDERS[c.provider].baseURL);
  const get = async (url: string, headers: Record<string, string> = {}) => {
    const r = await http(url, { headers });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  switch (c.provider) {
    case "ollama": return (await get(`${base}/api/tags`)).models.map((m: any) => m.name);
    case "lmstudio": return (await get(`${base}/models`)).data.map((m: any) => m.id);
    case "openai": return (await get(`${base}/models`, { Authorization: `Bearer ${key}` })).data.map((m: any) => m.id).sort();
    case "anthropic": return (await get(`${base}/models`, { "x-api-key": key ?? "", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" })).data.map((m: any) => m.id);
    case "gemini": return (await get(`${base}/models?key=${encodeURIComponent(key ?? "")}`)).models
      .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent")).map((m: any) => m.name.replace(/^models\//, ""));
  }
}

// Thinking models (e.g. glm on Ollama) otherwise reason for minutes; exercises need little. Measured: 185 s → 7 s.
// ponytail: local providers only; cloud models keep their default until measured per provider.
const reasoning = (c: AiConfig) => c.provider === "ollama" || c.provider === "lmstudio" ? "low" as const : undefined;

let active: { cfg: AiConfig; key: string | null } | null = null;
export async function activateConfig(cfg: AiConfig | null) {
  active = cfg && { cfg, key: await getKey(cfg.provider) };
}

/** Pulls the JSON object out of replies wrapped in ```json fences or prose. */
export function extractJson(text: string): unknown {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no JSON object in the reply");
  return JSON.parse(text.slice(a, b + 1));
}

/** Structured generation with the active provider. */
export async function generate<S extends z.ZodType>(schema: S, system: string, prompt: string, cfg = active): Promise<z.infer<S>> {
  if (!cfg) throw new Error("AI provider is not set up");
  // Some servers ignore response_format (e.g. Ollama cloud models), so the schema is in the prompt too.
  system += `\n\nJSON schema of the reply:\n${JSON.stringify(z.toJSONSchema(schema))}`;
  try {
    const r = await generateText({
      model: model(cfg.cfg, cfg.key), reasoning: reasoning(cfg.cfg), system, prompt, maxRetries: 1,
      output: Output.object({ schema }),
      abortSignal: AbortSignal.timeout(180_000),
    });
    return r.output as z.infer<S>;
  } catch (e) {
    if (!NoObjectGeneratedError.isInstance(e) || !e.text) throw e;
    return schema.parse(extractJson(e.text)); // lenient retry on fenced / chatty replies
  }
}

export async function generatePlain(system: string, prompt: string) {
  if (!active) throw new Error("AI provider is not set up");
  const r = await generateText({ model: model(active.cfg, active.key), reasoning: reasoning(active.cfg), system, prompt, maxRetries: 1, abortSignal: AbortSignal.timeout(60_000) });
  return r.text.trim();
}
