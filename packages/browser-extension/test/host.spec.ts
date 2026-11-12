// The native messaging host without Chrome or a CLI: the framing, the answer to a message, the install files.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { answer } from "../host/host.mjs";
import { extensionId, hostDirs, hostManifest, HOST, runScript } from "../host/install.mjs";
import { frame, unframe } from "../host/native.mjs";
import { HOST as EXTENSION_HOST } from "../src/llm_local.ts";
import manifest from "../public/manifest.json";

describe("framing", () => {
  it("round-trips a message, Japanese included", () => {
    const m = { cli: "claude", prompt: "一日から三日まで" };
    const b = frame(m);
    expect(b.readUInt32LE(0)).toBe(b.length - 4);
    expect(unframe(b)).toEqual(m);
  });
  it("waits for the whole message", () => {
    expect(unframe(frame({ a: 1 }).subarray(0, 6))).toBeNull();
    expect(unframe(Buffer.alloc(2))).toBeNull();
  });
});

describe("answer", () => {
  const call =
    (text: string, stderr = "") =>
    () =>
      Promise.resolve({ text, stderr });
  it("returns the CLI's text", async () => {
    expect(await answer({ cli: "codex", prompt: "p" }, call("{}"))).toEqual({ text: "{}" });
  });
  it("returns the CLI's error output when it answered nothing", async () => {
    expect(await answer({ cli: "claude", prompt: "p" }, call("", "Error: spawn claude ENOENT"))).toEqual({
      error: "claude gave no answer: Error: spawn claude ENOENT",
    });
  });
  it("refuses any other program, and an empty prompt", async () => {
    expect(await answer({ cli: "sh", prompt: "p" }, call("x"))).toEqual({ error: "unknown CLI: sh" });
    expect(await answer({ cli: "claude", prompt: "" }, call("x"))).toEqual({ error: "no prompt" });
  });
});

describe("install", () => {
  it("names the host as the extension calls it", () => expect(HOST).toBe(EXTENSION_HOST));
  it("gives the extension a fixed ID from its manifest key", () => {
    const id = extensionId(manifest.key);
    expect(id).toMatch(/^[a-p]{32}$/);
    expect(hostManifest("/x/run.sh", id).allowed_origins).toEqual([`chrome-extension://${id}/`]);
  });
  it("finds the browsers' folders per platform", () => {
    expect(hostDirs("darwin", "/Users/u")[0].dir).toBe(path.join("/Users/u/Library/Application Support/Google/Chrome/NativeMessagingHosts"));
    expect(hostDirs("linux", "/home/u")[0].dir).toBe("/home/u/.config/google-chrome/NativeMessagingHosts");
  });
  it("writes a launcher that keeps the PATH, quoted", () => {
    const s = runScript("/opt/node/bin/node", "/r/main.mjs", "/a b:/it's");
    expect(s).toContain(`export PATH='/a b:/it'\\''s'`);
    expect(s).toContain(`exec '/opt/node/bin/node' '/r/main.mjs'`);
  });
});
