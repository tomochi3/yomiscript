// Ask Claude Code, Codex or Antigravity (CLI, no tools) for an answer, and pull the JSON object out of it. Shared by
// the LLM experiments and the browser extension's native host. call() waits; callAsync() lets several calls run at once.
// { locked: true } is for text that is not the caller's own (a web page): the CLI starts with no tools at all, none of
// the user's MCP servers, connectors, plugins, hooks or settings, so that instructions hidden in the text cannot make
// it act; it can only answer with text. The experiments keep the earlier invocation (their results were measured with it).
import fs from "fs";
import path from "path";
import os from "os";
import { spawn, spawnSync } from "child_process";

/** the Gemini model Antigravity runs (agy models) */
export const AGY_MODEL = "gemini-4-argon-medium";

/** Claude Code with no tools (the built-in ones, MCP servers, skills and slash commands), no saved session, and none
 * of the user's settings (their permission rules and hooks) */
export const CLAUDE_LOCKED = ["--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence", "--setting-sources", ""];
// Codex features that act or reach out: the shell, connectors (apps), plugins, the browser and computer use, images,
// sub-agents, hooks. Given as -c features.<name>=false, which a Codex without that feature ignores (--disable rejects it)
const CODEX_OFF = [
  "shell_tool",
  "unified_exec",
  "apps",
  "plugins",
  "remote_plugin",
  "browser_use",
  "browser_use_external",
  "computer_use",
  "image_generation",
  "view_image",
  "multi_agent",
  "goals",
  "hooks",
];
/** Codex without the user's config.toml (their MCP servers) or rules, without web search, and without the features above */
export const CODEX_LOCKED = [
  "--ignore-user-config",
  "--ignore-rules",
  "-c",
  'web_search="disabled"',
  ...CODEX_OFF.flatMap((f) => ["-c", `features.${f}=false`]),
];

function command(llm, p, cwd, locked = false) {
  // [program, args, stdin, read(stdout, stderr) -> { text, model, outputTokens, err }]
  if (llm === "claude")
    return [
      "claude",
      locked
        ? ["-p", "--output-format", "json", ...CLAUDE_LOCKED]
        : ["-p", "--output-format", "json", "--disallowedTools", "Bash", "Edit", "Write", "Read", "Glob", "Grep", "WebFetch", "WebSearch"],
      p,
      (out, err) => {
        try {
          const j = JSON.parse(out);
          return { text: j.result, model: Object.keys(j.modelUsage ?? {}).join(","), outputTokens: j.usage?.output_tokens, err };
        } catch {
          return { text: out, err };
        }
      },
    ];
  if (llm === "codex") {
    const o = path.join(cwd, "out.txt");
    return [
      "codex",
      ["exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", ...(locked ? CODEX_LOCKED : []), "-C", cwd, "-o", o],
      p,
      (out, err) => ({ text: fs.existsSync(o) ? fs.readFileSync(o, "utf8") : out, model: (err.match(/model:\S*\s+(\S+)/) || [])[1], err }),
    ];
  }
  if (llm === "agy")
    return [
      "agy",
      ["--output-format", "json", "--model", AGY_MODEL, "--sandbox", "-p", p],
      "",
      (out, err) => {
        try {
          const j = JSON.parse(out);
          return { text: j.response, model: AGY_MODEL, outputTokens: j.usage?.output_tokens, err };
        } catch {
          return { text: out, err };
        }
      },
    ];
  throw new Error(`unknown LLM ${llm}`);
}
function finish(cwd, t0, { text, model, outputTokens, err }) {
  fs.rmSync(cwd, { recursive: true, force: true });
  return { text, model, outputTokens, seconds: (Date.now() - t0) / 1000, stderr: text ? "" : err };
}
export function call(llm, p) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "llm_yomite_"));
  const t0 = Date.now();
  const [prog, args, input, read] = command(llm, p, cwd);
  const r = spawnSync(prog, args, { input, cwd, encoding: "utf8", maxBuffer: 1 << 26 });
  return finish(cwd, t0, read(r.stdout, r.stderr));
}
export function callAsync(llm, p, { locked = false } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "llm_yomite_"));
  const t0 = Date.now();
  const [prog, args, input, read] = command(llm, p, cwd, locked);
  return new Promise((resolve) => {
    const c = spawn(prog, args, { cwd });
    let out = "",
      err = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (err += d));
    // a program that cannot be started (not on PATH) is reported in stderr, like one that fails; "close" still follows
    c.on("error", (e) => (err += String(e)));
    c.stdin.on("error", () => {}); // its stdin is closed when it did not start
    c.on("close", () => resolve(finish(cwd, t0, read(out, err))));
    c.stdin.end(input);
  });
}
export function json(text) {
  const a = text?.indexOf("{"),
    b = text?.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}
