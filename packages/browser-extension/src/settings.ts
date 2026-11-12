// The user's settings (the API key, the model, the effort), kept in the extension's local storage on this device only.
import { DEFAULT_SETTINGS, MODELS, type YomiteSettings } from "./yomite.ts";

const KEY = "settings";
const EFFORTS: YomiteSettings["effort"][] = ["low", "medium", "high"];

/** stored values made safe: unknown models and efforts fall back to the defaults */
export function normalize(v: unknown): YomiteSettings {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof YomiteSettings, unknown>>;
  return {
    apiKey: typeof o.apiKey === "string" ? o.apiKey.trim() : "",
    model: (MODELS as readonly unknown[]).includes(o.model) ? (o.model as string) : DEFAULT_SETTINGS.model,
    effort: EFFORTS.includes(o.effort as YomiteSettings["effort"]) ? (o.effort as YomiteSettings["effort"]) : DEFAULT_SETTINGS.effort,
  };
}

export async function loadSettings(): Promise<YomiteSettings> {
  const r = await chrome.storage.local.get(KEY);
  return normalize(r[KEY]);
}

export async function saveSettings(s: YomiteSettings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: normalize(s) });
}
