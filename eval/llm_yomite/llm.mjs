// Ask Claude Code, Codex or Antigravity (CLI, no tools) for an answer, and pull the JSON object out of it. Shared by
// the LLM experiments. call() waits; callAsync() lets several calls run at once.
import fs from "fs";
import path from "path";
import os from "os";
import { spawn, spawnSync } from "child_process";

/** the Gemini model Antigravity runs (agy models) */
export const AGY_MODEL = "gemini-4-argon-medium";

function command(llm, p, cwd) {
  // [program, args, stdin, read(stdout, stderr) -> { text, model, outputTokens, err }]
  if (llm === "claude")
    return [
      "claude",
      ["-p", "--output-format", "json", "--disallowedTools", "Bash", "Edit", "Write", "Read", "Glob", "Grep", "WebFetch", "WebSearch"],
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
      ["exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "-C", cwd, "-o", o],
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
export function callAsync(llm, p) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "llm_yomite_"));
  const t0 = Date.now();
  const [prog, args, input, read] = command(llm, p, cwd);
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
