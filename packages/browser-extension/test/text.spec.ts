// The extension's text handling without a browser: sentences, batches, the stored settings, the context menu's request.
import { describe, expect, it } from "vitest";
import { isFresh, REQUEST_TTL_MS } from "../src/request.ts";
import { batchEnd, cutLong, splitSentences } from "../src/sentences.ts";
import { DEFAULT_SETTINGS, missing, normalize } from "../src/settings.ts";

describe("sentences", () => {
  it("cuts paragraphs into sentences and drops the silent ones", () => {
    expect(splitSentences("一日から三日まで休みです。週末は京都へ行きます。\n\n---\nIt is raining. Is it?")).toEqual([
      "一日から三日まで休みです。",
      "週末は京都へ行きます。",
      "It is raining.",
      "Is it?",
    ]);
  });
  it("joins the lines of a paragraph's whitespace", () => {
    expect(splitSentences("  a   b  \n")).toEqual(["a b"]);
  });
  it("cuts a long sentence after a comma that fits", () => {
    const s = "あ".repeat(50) + "、" + "い".repeat(50) + "、" + "う".repeat(50);
    const parts = cutLong(s, 80);
    expect(parts.join("")).toBe(s);
    expect(parts[0]).toBe("あ".repeat(50) + "、");
    expect(parts.every((p) => p.length <= 80)).toBe(true);
  });
  it("cuts a sentence with no comma at the limit", () => {
    expect(cutLong("x".repeat(25), 10)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });
});

describe("batches", () => {
  const s = ["aaaa", "bbbb", "cccc", "dddd", "eeee"];
  it("stops at the sentence count", () => expect(batchEnd(s, 1, 2, 100)).toBe(3));
  it("stops at the character count", () => expect(batchEnd(s, 0, 8, 9)).toBe(2));
  it("takes at least one sentence, however long", () => expect(batchEnd(["x".repeat(50), "y"], 0, 8, 10)).toBe(1));
  it("ends at the last sentence", () => expect(batchEnd(s, 3, 8, 100)).toBe(5));
});

describe("settings", () => {
  it("falls back to the defaults for unknown values", () => {
    expect(normalize({ provider: "x", anthropicKey: " k ", anthropicModel: "gpt-x", effort: "max" })).toEqual({ ...DEFAULT_SETTINGS, anthropicKey: "k" });
    expect(normalize(undefined)).toEqual(DEFAULT_SETTINGS);
  });
  it("takes the first version's key and model as the Claude API's", () => {
    expect(normalize({ apiKey: "k", model: "claude-haiku-5-5", effort: "high" })).toMatchObject({
      provider: "anthropic",
      anthropicKey: "k",
      anthropicModel: "claude-haiku-5-5",
      effort: "high",
    });
  });
  it("says what a provider still needs", () => {
    expect(missing(DEFAULT_SETTINGS)).toMatch(/Anthropic API key/);
    expect(missing({ ...DEFAULT_SETTINGS, provider: "openai", openaiKey: "k" })).toMatch(/OpenAI model/);
    expect(missing({ ...DEFAULT_SETTINGS, provider: "openai", openaiKey: "k", openaiModel: "m" })).toBeNull();
    expect(missing({ ...DEFAULT_SETTINGS, provider: "claude-code" })).toBeNull();
  });
});

describe("read request", () => {
  const r = { kind: "page", tabId: 3, selectionText: "", at: 1000 };
  it("is taken while fresh", () => expect(isFresh(r, 1000 + REQUEST_TTL_MS - 1)).toBe(true));
  it("is dropped when old or malformed", () => {
    expect(isFresh(r, 1000 + REQUEST_TTL_MS)).toBe(false);
    expect(isFresh({ ...r, kind: "other" }, 1000)).toBe(false);
    expect(isFresh(null, 1000)).toBe(false);
  });
});
