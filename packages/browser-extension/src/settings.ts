// The user's settings, kept in the extension's local storage on this device only: which LLM writes the reading (an
// API with the user's key, or a CLI with the user's subscription), the keys, the models, the effort.
import { ANTHROPIC_MODELS } from "./llm_anthropic.ts";

export type Provider = "anthropic" | "openai" | "claude-code" | "codex";
export type Effort = "low" | "medium" | "high";
export const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "anthropic", label: "Claude API (API key)" },
  { id: "openai", label: "OpenAI API (API key)" },
  { id: "claude-code", label: "Claude Code (your subscription)" },
  { id: "codex", label: "Codex (your ChatGPT subscription)" },
];
const EFFORTS: Effort[] = ["low", "medium", "high"];

export interface Settings {
  provider: Provider;
  anthropicKey: string;
  anthropicModel: string;
  openaiKey: string;
  /** chosen from the account's model list; empty until one is chosen */
  openaiModel: string;
  effort: Effort;
}
export const DEFAULT_SETTINGS: Settings = {
  provider: "anthropic",
  anthropicKey: "",
  anthropicModel: ANTHROPIC_MODELS[0],
  openaiKey: "",
  openaiModel: "",
  effort: "low",
};

const KEY = "settings";
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const oneOf = <T>(v: unknown, values: readonly T[], fallback: T): T => (values.includes(v as T) ? (v as T) : fallback);

/** stored values made safe: unknown values fall back to the defaults; the first version's apiKey / model are the Claude API's */
export function normalize(v: unknown): Settings {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    provider: oneOf(
      o.provider,
      PROVIDERS.map((p) => p.id),
      DEFAULT_SETTINGS.provider,
    ),
    anthropicKey: str(o.anthropicKey ?? o.apiKey),
    anthropicModel: oneOf(o.anthropicModel ?? o.model, ANTHROPIC_MODELS as readonly string[], DEFAULT_SETTINGS.anthropicModel),
    openaiKey: str(o.openaiKey),
    openaiModel: str(o.openaiModel),
    effort: oneOf(o.effort, EFFORTS, DEFAULT_SETTINGS.effort),
  };
}

/** what is missing before the provider can be used, or null */
export function missing(s: Settings): string | null {
  if (s.provider === "anthropic" && !s.anthropicKey) return "Enter your Anthropic API key in the settings first.";
  if (s.provider === "openai" && !s.openaiKey) return "Enter your OpenAI API key in the settings first.";
  if (s.provider === "openai" && !s.openaiModel) return "Choose an OpenAI model in the settings first (Load models).";
  return null;
}

export async function loadSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(KEY);
  return normalize(r[KEY]);
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: normalize(s) });
}
