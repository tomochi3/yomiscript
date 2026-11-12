// The LLM Yomite with a stand-in for the Messages API: the request, the answer's checks, the retry of an utterance that
// does not parse. No network.
import { describe, expect, it } from "vitest";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { YOMISCRIPT_INSTRUCTIONS } from "@yomiscript/core";
import { requestBody, SYSTEM, userMessage, utterancesOf, writeYomiScript, type MessagesClient, type YomiteSettings } from "../src/yomite.ts";

const settings: YomiteSettings = { apiKey: "k", model: "claude-opus-5-5", effort: "low" };
const GOOD = "ja /ame<t:雨> desɯ<t:です。> ↘/";

const answer = (utterances: unknown, stop_reason: BetaMessage["stop_reason"] = "end_turn"): BetaMessage =>
  ({ content: [{ type: "text", text: JSON.stringify({ utterances }) }], stop_reason }) as unknown as BetaMessage;

function fakeClient(answers: BetaMessage[]): MessagesClient & { bodies: unknown[] } {
  const bodies: unknown[] = [];
  return {
    bodies,
    create: (body) => {
      bodies.push(body);
      const a = answers.shift();
      return a ? Promise.resolve(a) : Promise.reject(new Error("no more answers"));
    },
  };
}

describe("request", () => {
  it("numbers the sentences under the title", () => {
    expect(userMessage("T", ["a", "b"])).toBe("Page title: T\n\n1. a\n2. b");
  });
  it("carries the YomiScript instructions and asks for JSON", () => {
    const b = requestBody(settings, "x");
    expect(b.system).toBe(SYSTEM);
    expect(SYSTEM).toContain(YOMISCRIPT_INSTRUCTIONS);
    expect(b.output_config?.format?.type).toBe("json_schema");
    expect(b.output_config?.effort).toBe("low");
  });
  it("asks for the server-side fallback except on Haiku", () => {
    expect(requestBody(settings, "x")).toMatchObject({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect(requestBody({ ...settings, model: "claude-haiku-5-5" }, "x")).not.toHaveProperty("fallbacks");
  });
});

describe("answer", () => {
  it("takes as many utterances as sentences", () => {
    expect(utterancesOf(answer([GOOD]), 1)).toEqual([GOOD]);
    expect(() => utterancesOf(answer([GOOD]), 2)).toThrow(/expected 2/);
  });
  it("reports a refusal and a cut-off answer", () => {
    expect(() => utterancesOf(answer([], "refusal"), 0)).toThrow(/declined/);
    expect(() => utterancesOf(answer([], "max_tokens"), 0)).toThrow(/cut off/);
  });
});

describe("writeYomiScript", () => {
  it("returns the utterances when all parse, in one request", async () => {
    const c = fakeClient([answer([GOOD, GOOD])]);
    expect(await writeYomiScript(c, settings, "T", ["雨です。", "雨です。"])).toEqual([GOOD, GOOD]);
    expect(c.bodies).toHaveLength(1);
  });
  it("asks again for the ones that do not parse, and leaves out what still does not", async () => {
    const c = fakeClient([answer([GOOD, "ja /broken", "nope"]), answer([GOOD, "still broken"])]);
    expect(await writeYomiScript(c, settings, "T", ["a", "b", "c"])).toEqual([GOOD, GOOD, null]);
    const retry = JSON.stringify(c.bodies[1]);
    expect(retry).toContain("ja /broken");
    expect(retry).toContain("parser error");
    expect(retry).not.toContain("1. a");
  });
});
