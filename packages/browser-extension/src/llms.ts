// The Llm the settings choose.
import { anthropicClient, anthropicLlm } from "./llm_anthropic.ts";
import { localLlm } from "./llm_local.ts";
import { openAiClient, openAiLlm } from "./llm_openai.ts";
import type { Settings } from "./settings.ts";
import type { Llm } from "./yomite.ts";

export function llmFor(s: Settings): Llm {
  switch (s.provider) {
    case "anthropic":
      return anthropicLlm(anthropicClient(s.anthropicKey), s.anthropicModel, s.effort);
    case "openai":
      return openAiLlm(openAiClient(s.openaiKey), s.openaiModel, s.effort);
    case "claude-code":
      return localLlm("claude");
    case "codex":
      return localLlm("codex");
  }
}
