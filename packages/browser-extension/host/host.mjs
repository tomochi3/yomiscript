// What the native messaging host of the extension answers (main.mjs runs it): Chrome starts it for one message, { cli, prompt }, and it answers with
// { text } (the CLI's answer) or { error }. The CLI is the user's own Claude Code (`claude -p`) or Codex (`codex exec`),
// signed in with their subscription; how each is called is eval/llm_yomite/llm.mjs, the repository's one definition.
// Installed with install.mjs, which also gives it the PATH of the shell it was installed from (Chrome starts hosts
// with a minimal PATH, where neither CLI nor node would be found).
import { callAsync } from "../../../eval/llm_yomite/llm.mjs";

const CLIS = new Set(["claude", "codex"]);

/** the answer to one message */
export async function answer(message, call = callAsync) {
  const { cli, prompt } = message ?? {};
  if (!CLIS.has(cli)) return { error: `unknown CLI: ${String(cli)}` };
  if (typeof prompt !== "string" || !prompt) return { error: "no prompt" };
  const r = await call(cli, prompt);
  if (r.text) return { text: r.text };
  const why = (r.stderr || "").trim().slice(-600) || "no output";
  return { error: `${cli} gave no answer: ${why}` };
}
