// The order of the Reader's steps with stand-ins for the Yomite, the Katarite and the player: batches written ahead,
// audio made ahead, stop and resume, errors.
import { describe, expect, it } from "vitest";
import type { Speech } from "@yomiscript/core";
import { Reader, type PlayingAudio, type ReaderDeps, type SentenceState } from "../src/reader.ts";

const speechOf = (ys: string): Speech => ({ samples: new Float32Array(1), sampleRate: 24000, texts: [ys], times: [] });

function setUp(sentences: string[], over: Partial<ReaderDeps> = {}) {
  const log: string[] = [];
  const states: [number, SentenceState][] = [];
  const status: [string, boolean][] = [];
  let ended = 0;
  let current: { finish: () => void } | null = null;
  const deps: ReaderDeps = {
    write: (batch) => {
      log.push(`write ${batch.join(",")}`);
      return Promise.resolve(batch.map((s) => (s.startsWith("-") ? null : `ja /a<t:${s}> ↘/`)));
    },
    speak: (ys) => {
      log.push(`speak ${ys}`);
      return Promise.resolve(speechOf(ys));
    },
    play: (s) => {
      log.push(`play ${s.texts[0]}`);
      let finish = () => {};
      const ended = new Promise<void>((r) => (finish = r));
      current = { finish };
      const p: PlayingAudio = { stop: finish, ended };
      return Promise.resolve(p);
    },
    ...over,
  };
  const reader = new Reader(sentences, deps, {
    sentence: (i, s) => states.push([i, s]),
    status: (m, e) => status.push([m, !!e]),
    end: () => ended++,
  });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const finishPlaying = async () => {
    await tick();
    current?.finish();
    await tick();
  };
  return { reader, log, states, status, finishPlaying, ended: () => ended, tick };
}

const S = Array.from({ length: 12 }, (_, i) => `s${i}`);

describe("Reader: the order of the steps", () => {
  it("writes a short first batch, then larger ones ahead, and reads every sentence in order", async () => {
    const t = setUp(S);
    const done = t.reader.start(0);
    for (let i = 0; i < S.length; i++) await t.finishPlaying();
    await done;
    const writes = t.log.filter((l) => l.startsWith("write"));
    expect(writes[0]).toBe("write s0,s1");
    expect(writes[1]).toBe("write s2,s3,s4,s5,s6,s7,s8,s9");
    expect(writes.join(",").split("s").length - 1).toBe(S.length); // each sentence written once
    expect(t.log.filter((l) => l.startsWith("play")).map((l) => l.slice(5))).toEqual(S.map((s) => `ja /a<t:${s}> ↘/`));
    expect(t.ended()).toBe(1);
    expect(t.reader.reading).toBe(false);
  });

  it("makes the next sentence's audio while one plays", async () => {
    const t = setUp(S);
    void t.reader.start(0);
    await t.tick();
    await t.tick();
    expect(t.log).toContain("play ja /a<t:s0> ↘/");
    expect(t.log).toContain("speak ja /a<t:s1> ↘/");
    t.reader.stop();
  });

  it("skips a sentence with no YomiScript", async () => {
    const t = setUp(["s0", "-s1", "s2"]);
    const done = t.reader.start(0);
    for (let i = 0; i < 3; i++) await t.finishPlaying();
    await done;
    expect(t.states).toContainEqual([1, "skipped"]);
    expect(t.log.filter((l) => l.startsWith("play"))).toHaveLength(2);
  });
});

describe("Reader: stops and errors", () => {
  it("stops, and resumes where it stopped", async () => {
    const t = setUp(S);
    const done = t.reader.start(3);
    await t.finishPlaying();
    await t.tick();
    expect(t.reader.index).toBe(4);
    t.reader.stop();
    await done;
    expect(t.reader.reading).toBe(false);
    expect(t.ended()).toBe(0);
    const plays = t.log.filter((l) => l.startsWith("play")).length;
    void t.reader.start(t.reader.index);
    await t.tick();
    await t.tick();
    expect(t.log.filter((l) => l.startsWith("play"))).toHaveLength(plays + 1);
    expect(t.log.at(-1)).toContain("s4");
    t.reader.stop();
  });

  it("stops at a sentence whose batch fails, and asks for the batch again on resume", async () => {
    let fail = true;
    const t = setUp(S, {
      write: (batch) => (fail ? Promise.reject(new Error("401 invalid x-api-key")) : Promise.resolve(batch.map((s) => `ja /a<t:${s}> ↘/`))),
    });
    await t.reader.start(0);
    expect(t.status.at(-1)).toEqual(["The reading could not be written: 401 invalid x-api-key", true]);
    expect(t.reader.reading).toBe(false);
    expect(t.reader.index).toBe(0);
    fail = false;
    void t.reader.start(t.reader.index);
    await t.tick();
    await t.tick();
    expect(t.reader.reading).toBe(true);
    t.reader.stop();
  });

  it("stops when the audio cannot be made", async () => {
    const t = setUp(S, { speak: () => Promise.reject(new Error("models/enc_w16.onnx: 404")) });
    await t.reader.start(0);
    expect(t.status.at(-1)).toEqual(["The audio could not be made: models/enc_w16.onnx: 404", true]);
  });

  it("reports when the browser does not allow audio, so that Play resumes the same sentence", async () => {
    const t = setUp(S, { play: () => Promise.reject(new Error("audio is not allowed yet: press play")) });
    await t.reader.start(2);
    expect(t.status.at(-1)).toEqual(["audio is not allowed yet: press play", true]);
    expect(t.reader.index).toBe(2);
    expect(t.reader.reading).toBe(false);
  });
});
