// The Yomite and its LLMs with stand-ins for the APIs and the native host: the prompt, the answer's checks, the retry
// of an utterance that does not parse, each provider's request and errors. No network.
import { describe, expect, it } from "vitest";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Response } from "openai/resources/responses/responses";
import { YOMISCRIPT_INSTRUCTIONS } from "@yomiscript/core";
import { answerText, requestBody } from "../src/llm_anthropic.ts";
import { hostText } from "../src/llm_local.ts";
import { openAiLlm, responseBody, responseText, textModels, type ResponsesClient } from "../src/llm_openai.ts";
import { SYSTEM, userMessage, utterancesOf, writeYomiScript, type Llm } from "../src/yomite.ts";

const GOOD = "ja /ame<t:雨> desɯ<t:です。> ↘/";
const json = (utterances: unknown) => JSON.stringify({ utterances });

function fakeLlm(answers: string[]): Llm & { users: string[] } {
  const users: string[] = [];
  return {
    users,
    complete: (_system, user) => {
      users.push(user);
      const a = answers.shift();
      return a === undefined ? Promise.reject(new Error("no more answers")) : Promise.resolve(a);
    },
  };
}

describe("prompt and answer", () => {
  it("numbers the sentences under the title, with the YomiScript instructions", () => {
    expect(userMessage("T", ["a", "b"])).toBe("Page title: T\n\n1. a\n2. b");
    expect(SYSTEM).toContain(YOMISCRIPT_INSTRUCTIONS);
  });
  it("takes as many utterances as sentences, also from an answer in a code fence", () => {
    expect(utterancesOf(json([GOOD]), 1)).toEqual([GOOD]);
    expect(utterancesOf("```json\n" + json([GOOD]) + "\n```", 1)).toEqual([GOOD]);
    expect(() => utterancesOf(json([GOOD]), 2)).toThrow(/expected 2/);
    expect(() => utterancesOf("sorry", 1)).toThrow(/no JSON/);
  });
});

describe("writeYomiScript", () => {
  it("returns the utterances when all parse, in one request", async () => {
    const llm = fakeLlm([json([GOOD, GOOD])]);
    expect(await writeYomiScript(llm, "T", ["雨です。", "雨です。"])).toEqual([GOOD, GOOD]);
    expect(llm.users).toHaveLength(1);
  });
  it("asks again for the ones that do not parse, and leaves out what still does not", async () => {
    const llm = fakeLlm([json([GOOD, "ja /broken", "nope"]), json([GOOD, "still broken"])]);
    expect(await writeYomiScript(llm, "T", ["a", "b", "c"])).toEqual([GOOD, GOOD, null]);
    expect(llm.users[1]).toContain("ja /broken");
    expect(llm.users[1]).toContain("parser error");
    expect(llm.users[1]).not.toContain("1. a");
  });
});

describe("Claude API", () => {
  it("asks for JSON in the schema, at the effort, with the server-side fallback except on Haiku", () => {
    const b = requestBody("claude-opus-5-5", "low", "S", "U");
    expect(b.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    expect(b).toMatchObject({ system: "S", betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect(requestBody("claude-haiku-5-5", "low", "S", "U")).not.toHaveProperty("fallbacks");
  });
  it("reports a refusal and a cut-off answer", () => {
    const m = (stop_reason: string) => ({ content: [], stop_reason }) as unknown as BetaMessage;
    expect(() => answerText(m("refusal"))).toThrow(/declined/);
    expect(() => answerText(m("max_tokens"))).toThrow(/cut off/);
  });
});

describe("OpenAI API", () => {
  const ok = (text: string) => ({ output: [], status: "completed", output_text: text }) as unknown as Response;
  it("asks for strict JSON in the schema, with the reasoning effort", () => {
    const b = responseBody("m", "low", "S", "U");
    expect(b).toMatchObject({ model: "m", instructions: "S", input: "U", reasoning: { effort: "low" } });
    expect(b.text?.format).toMatchObject({ type: "json_schema", strict: true });
    expect(responseBody("m", null, "S", "U")).not.toHaveProperty("reasoning");
  });
  it("reports a refusal and an incomplete response", () => {
    const refusal = { output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }], status: "completed", output_text: "" };
    expect(() => responseText(refusal as unknown as Response)).toThrow(/declined/);
    expect(() => responseText({ output: [], status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } as unknown as Response)).toThrow(
      /cut off/,
    );
  });
  it("asks again without the effort when the model has no reasoning, and keeps it off", async () => {
    const bodies: unknown[] = [];
    const client: ResponsesClient = {
      create: (body) => {
        bodies.push(body);
        if ("reasoning" in body) return Promise.reject(new Error("400 Unsupported parameter: 'reasoning.effort' is not supported with this model."));
        return Promise.resolve(ok("{}"));
      },
      models: () => Promise.resolve([]),
    };
    const llm = openAiLlm(client, "m", "low");
    expect(await llm.complete("S", "U")).toBe("{}");
    expect(await llm.complete("S", "U")).toBe("{}");
    expect(bodies.map((b) => "reasoning" in (b as object))).toEqual([true, false, false]);
  });
  it("lists only the models that write text", () => {
    expect(textModels(["tts-1", "m-b", "text-embedding-3", "m-a", "whisper-1", "dall-e-3"])).toEqual(["m-a", "m-b"]);
  });
});

describe("subscription CLI (native host)", () => {
  it("returns the host's text, or its error", () => {
    expect(hostText({ text: "{}" })).toBe("{}");
    expect(() => hostText({ error: "claude gave no answer: not logged in" })).toThrow(/not logged in/);
    expect(() => hostText(undefined)).toThrow(/no answer/);
  });
  it("tells how to install the host when Chrome cannot find it", () => {
    expect(() => hostText(undefined, "Specified native messaging host not found.")).toThrow(/host\/install\.mjs/);
  });
});
