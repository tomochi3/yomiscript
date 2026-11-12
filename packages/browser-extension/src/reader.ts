// Reading a list of sentences aloud, one after another: the Yomite writes the YomiScript of a batch of sentences ahead
// of the one being spoken, and the Katarite makes the audio of the next sentence while one plays. Everything it uses
// comes in as ReaderDeps, so the order of the steps is tested without models or the API.
import type { Speech } from "@yomiscript/core";
import { BATCH_SENTENCES, batchEnd, FIRST_BATCH } from "./sentences.ts";

export interface PlayingAudio {
  stop(): void;
  ended: Promise<void>;
}
export interface ReaderDeps {
  /** the YomiScript of each sentence of a batch (null where none could be written) */
  write(sentences: string[]): Promise<(string | null)[]>;
  /** the audio of one YomiScript */
  speak(ys: string): Promise<Speech>;
  /** plays it; throws when the browser does not allow audio yet */
  play(speech: Speech): Promise<PlayingAudio>;
}
export type SentenceState = "writing" | "speaking" | "done" | "skipped";
export interface ReaderEvents {
  sentence(i: number, state: SentenceState, ys?: string | null): void;
  /** a message for the status line; error: reading has stopped because of it */
  status(message: string, error?: boolean): void;
  end(): void;
}

/** how many sentences ahead of the one playing get their YomiScript requested */
export const WRITE_AHEAD = 3;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Reader {
  private ys: (Promise<string | null> | undefined)[] = [];
  private audio = new Map<number, Promise<Speech | null>>();
  private run = 0;
  private playing: PlayingAudio | null = null;
  /** the sentence being read (or the next one to read after a stop) */
  index = 0;

  readonly sentences: string[];
  private deps: ReaderDeps;
  private events: ReaderEvents;

  constructor(sentences: string[], deps: ReaderDeps, events: ReaderEvents) {
    this.sentences = sentences;
    this.deps = deps;
    this.events = events;
  }

  get reading(): boolean {
    return this.run % 2 === 1;
  }

  /** the YomiScript of sentence i, its batch requested when it has not been yet */
  private yomiscript(i: number, first: boolean): Promise<string | null> {
    const known = this.ys[i];
    if (known) return known;
    let end = batchEnd(this.sentences, i, first ? FIRST_BATCH : BATCH_SENTENCES);
    for (let j = i + 1; j < end; j++) if (this.ys[j]) end = j; // up to a sentence already asked for
    const batch = this.deps.write(this.sentences.slice(i, end));
    batch.catch(() => {
      // a failed batch is asked for again the next time one of its sentences is needed
      for (let j = i; j < end; j++) this.ys[j] = undefined;
    });
    for (let j = i; j < end; j++) {
      const ys = batch.then((r) => r[j - i] ?? null);
      ys.catch(() => undefined); // reported by whoever awaits it; the sentences after i may never be
      this.ys[j] = ys;
    }
    return this.ys[i] as Promise<string | null>;
  }

  /** the audio of sentence i, made once (again after a failure); null when it has no YomiScript */
  private speech(i: number, first: boolean): Promise<Speech | null> {
    let s = this.audio.get(i);
    if (!s) {
      s = this.yomiscript(i, first).then((ys) => (ys ? this.deps.speak(ys) : null));
      this.audio.set(i, s);
      s.catch(() => this.audio.delete(i));
    }
    return s;
  }

  private prepareAhead(i: number): void {
    for (let j = i + 1; j <= i + WRITE_AHEAD && j < this.sentences.length; j++) void this.yomiscript(j, false).catch(() => undefined);
    if (i + 1 < this.sentences.length) void this.speech(i + 1, false).catch(() => undefined);
    for (const k of this.audio.keys()) if (k < i) this.audio.delete(k);
  }

  /** reads from sentence `from` to the end; a running read is stopped first */
  async start(from = 0): Promise<void> {
    this.stop();
    const run = ++this.run; // odd while reading
    for (let i = from, first = true; i < this.sentences.length; i++, first = false) {
      this.index = i;
      if (!(await this.readOne(i, first, run))) return;
    }
    if (run === this.run) {
      this.run++;
      this.index = 0;
      this.events.end();
    }
  }

  /** false when reading stops here (a stop, or an error that stops it) */
  private async readOne(i: number, first: boolean, run: number): Promise<boolean> {
    this.events.sentence(i, "writing");
    let speech: Speech | null;
    let step = "The reading could not be written";
    try {
      const ys = await this.yomiscript(i, first);
      if (run !== this.run) return false;
      this.events.sentence(i, ys ? "speaking" : "skipped", ys);
      this.prepareAhead(i);
      step = "The audio could not be made";
      speech = await this.speech(i, first);
    } catch (e) {
      if (run !== this.run) return false;
      this.events.sentence(i, "writing");
      return this.failed(i, `${step}: ${message(e)}`);
    }
    if (run !== this.run) return false;
    if (!speech) return true;
    return this.playOne(i, speech, run);
  }

  private async playOne(i: number, speech: Speech, run: number): Promise<boolean> {
    let p: PlayingAudio;
    try {
      p = await this.deps.play(speech);
    } catch (e) {
      this.stopRun(run);
      this.events.status(message(e), true);
      return false;
    }
    if (run !== this.run) {
      p.stop(); // stopped while the audio was being started
      return false;
    }
    this.playing = p;
    await p.ended;
    if (this.playing === p) this.playing = null;
    if (run !== this.run) return false;
    this.events.sentence(i, "done");
    return true;
  }

  /** an error while writing or synthesizing: reading stops at this sentence, so that a click resumes it */
  private failed(i: number, why: string): boolean {
    this.index = i;
    this.stopRun(this.run);
    this.events.status(why, true);
    return false;
  }

  private stopRun(run: number): void {
    if (run === this.run && run % 2 === 1) this.run++;
  }

  stop(): void {
    if (this.run % 2 === 1) this.run++;
    const p = this.playing;
    this.playing = null;
    p?.stop();
  }
}
