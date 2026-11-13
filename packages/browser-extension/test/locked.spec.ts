// The host starts the CLIs locked: a web page's text must not be able to make them act. Checked on the arguments,
// without running a CLI.
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as unknown[][]);
vi.mock("../../../eval/llm_yomite/llm.mjs", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, callAsync: (...args: unknown[]) => (calls.push(args), Promise.resolve({ text: "{}", stderr: "" })) };
});
const { answer } = await import("../host/host.mjs");
const { CLAUDE_LOCKED, CODEX_LOCKED } = await import("../../../eval/llm_yomite/llm.mjs");

describe("locked CLIs", () => {
  it("the host asks for the locked form", async () => {
    await answer({ cli: "claude", prompt: "p" });
    expect(calls.at(-1)).toEqual(["claude", "p", { locked: true }]);
  });
  it("Claude Code gets no tools, no MCP servers, no slash commands and none of the user's settings", () => {
    const at = (flag: string) => CLAUDE_LOCKED[CLAUDE_LOCKED.indexOf(flag) + 1];
    expect(at("--tools")).toBe("");
    expect(at("--setting-sources")).toBe("");
    expect(CLAUDE_LOCKED).toEqual(expect.arrayContaining(["--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]));
  });
  it("Codex gets no user config, no rules, no web search, no shell and no connectors", () => {
    expect(CODEX_LOCKED).toEqual(
      expect.arrayContaining([
        "--ignore-user-config",
        "--ignore-rules",
        'web_search="disabled"',
        "features.shell_tool=false",
        "features.unified_exec=false",
        "features.apps=false",
      ]),
    );
  });
});
