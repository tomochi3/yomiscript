// The settings in the side panel: the provider, its key and model, the effort. Only the fields of the chosen
// provider are shown; the OpenAI models are loaded from the account with its key.
import { ANTHROPIC_MODELS } from "./llm_anthropic.ts";
import { openAiClient } from "./llm_openai.ts";
import { loadSettings, normalize, PROVIDERS, saveSettings, type Settings } from "./settings.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const f = {
  details: $<HTMLDetailsElement>("settings"),
  provider: $<HTMLSelectElement>("provider"),
  anthropic: $<HTMLDivElement>("anthropic-fields"),
  anthropicKey: $<HTMLInputElement>("anthropic-key"),
  anthropicModel: $<HTMLSelectElement>("anthropic-model"),
  openai: $<HTMLDivElement>("openai-fields"),
  openaiKey: $<HTMLInputElement>("openai-key"),
  openaiModel: $<HTMLSelectElement>("openai-model"),
  loadModels: $<HTMLButtonElement>("load-models"),
  effortFields: $<HTMLDivElement>("effort-fields"),
  effort: $<HTMLSelectElement>("effort"),
  local: $<HTMLDivElement>("local-fields"),
  localCli: $<HTMLSpanElement>("local-cli"),
  save: $<HTMLButtonElement>("save"),
};

function showProvider(): void {
  const p = f.provider.value;
  f.anthropic.hidden = p !== "anthropic";
  f.openai.hidden = p !== "openai";
  f.effortFields.hidden = p !== "anthropic" && p !== "openai";
  f.local.hidden = p !== "claude-code" && p !== "codex";
  f.localCli.textContent = p === "codex" ? "codex" : "claude";
}

function setOpenAiModels(ids: string[], chosen: string): void {
  const all = chosen && !ids.includes(chosen) ? [chosen, ...ids] : ids;
  f.openaiModel.replaceChildren(new Option(all.length ? "(choose a model)" : "(Load models first)", ""), ...all.map((m) => new Option(m, m)));
  f.openaiModel.value = chosen;
}

function read(): Settings {
  return normalize({
    provider: f.provider.value,
    anthropicKey: f.anthropicKey.value,
    anthropicModel: f.anthropicModel.value,
    openaiKey: f.openaiKey.value,
    openaiModel: f.openaiModel.value,
    effort: f.effort.value,
  });
}

/** the stored settings in the fields; the settings open when the provider is not ready yet */
export async function showSettings(needsSetUp: (s: Settings) => boolean): Promise<void> {
  f.provider.replaceChildren(...PROVIDERS.map((p) => new Option(p.label, p.id)));
  f.anthropicModel.replaceChildren(...ANTHROPIC_MODELS.map((m) => new Option(m, m)));
  const s = await loadSettings();
  f.provider.value = s.provider;
  f.anthropicKey.value = s.anthropicKey;
  f.anthropicModel.value = s.anthropicModel;
  f.openaiKey.value = s.openaiKey;
  setOpenAiModels([], s.openaiModel);
  f.effort.value = s.effort;
  showProvider();
  if (needsSetUp(s)) f.details.open = true;
}

export function openSettings(): void {
  f.details.open = true;
  showProvider();
}

export function wireSettings(status: (m: string, error?: boolean) => void): void {
  f.provider.addEventListener("change", showProvider);
  f.loadModels.addEventListener("click", () => {
    const key = f.openaiKey.value.trim();
    if (!key) return status("Enter your OpenAI API key first.", true);
    status("Loading the models of your OpenAI account...");
    openAiClient(key)
      .models()
      .then((ids) => {
        setOpenAiModels(ids, f.openaiModel.value);
        status(`${ids.length} models. Choose one and Save.`);
      })
      .catch((e: unknown) => status(`The models could not be loaded: ${e instanceof Error ? e.message : String(e)}`, true));
  });
  f.save.addEventListener("click", () => {
    void saveSettings(read()).then(() => {
      f.details.open = false;
      status("Settings saved.");
    });
  });
}
