// The Kokoro Katarite in the browser: onnxruntime-web with the w16 models (D24), loaded once and shared by every
// tool result, with the Japanese dictionary accent (D25). Where the models, voices, onnxruntime's wasm files and the
// accent dictionary are served from is set with configureSpeaker().
import * as ort from "onnxruntime-web";
import type { Katarite, Speech } from "@yomiscript/core";
import { accentYomite, DICT_URL, loadFrontend, loadPitchModel, PITCH_URL, pitchOrAccentYomite, withAccent } from "@yomiscript/ja-accent";
import { Engine, KokoroKatarite, W16 } from "@yomiscript/kokoro";

export interface SpeakerOptions {
  /** URL of the directory with models/<part>_w16.onnx and voices/<voice>.bin */
  modelBase: string;
  /** URL of onnxruntime-web's dist/ (its .wasm and .mjs files); unset: onnxruntime-web's own default */
  ortWasmBase?: string;
  /** onnxruntime execution providers, ["wasm"] by default (["webgpu", "wasm"] to try WebGPU first) */
  executionProviders?: string[];
  /** URL of the Japanese accent dictionary (<file>.gz; Hugging Face by default, about 28 MB the first time Japanese
   * is spoken); null: no dictionary accent, Kokoro's own pitch everywhere */
  accentBase?: string | null;
  /** URL of the Japanese pitch model (D33, <file>.gz; Hugging Face by default, about 8 MB the first time Japanese is
   * spoken); null: the dictionary accent's values. Needs accentBase; if it cannot be loaded, the dictionary accent is used */
  pitchBase?: string | null;
  /** how a file under one of the bases is loaded (models, voices, dictionary, pitch model); unset: a plain fetch.
   * A host that keeps the downloads (the Cache API) passes its own */
  loader?: (base: URL) => Loader;
  /** onnxruntime's WASM threads; unset: 1, which needs no cross-origin isolation */
  numThreads?: number;
}
/** a file's bytes, by its path under a base */
export type Loader = (path: string) => Promise<Uint8Array>;
let options: SpeakerOptions = { modelBase: "/kokoro/", accentBase: DICT_URL, pitchBase: PITCH_URL };
let katarite: Promise<Katarite> | null = null;
const cache = new Map<string, Promise<Speech>>();

export function configureSpeaker(o: Partial<SpeakerOptions>): void {
  options = { ...options, ...o };
  katarite = null;
  cache.clear();
}
export function speakerOptions(): Readonly<SpeakerOptions> {
  return options;
}
const absolute = (base: string): URL => new URL(base.endsWith("/") ? base : base + "/", globalThis.location?.href ?? "http://localhost/");
const plainFetcher =
  (base: URL): Loader =>
  async (p: string): Promise<Uint8Array> => {
    const r = await fetch(new URL(p, base));
    if (!r.ok) throw new Error(`cannot load ${p}: HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  };

/** the Katarite, created on first use (downloads about 165 MB of models the first time; the browser caches them) */
export function loadKatarite(): Promise<Katarite> {
  katarite ??= (async () => {
    if (options.ortWasmBase) ort.env.wasm.wasmPaths = absolute(options.ortWasmBase).href;
    ort.env.wasm.numThreads = options.numThreads ?? 1; // 1: no cross-origin isolation needed
    const fetcher = options.loader ?? plainFetcher;
    const load = fetcher(absolute(options.modelBase));
    const engine = await new Engine(ort, load).init({ suffix: W16, executionProviders: options.executionProviders ?? ["wasm"] });
    const k = new KokoroKatarite(engine),
      dict = options.accentBase;
    if (!dict) return k;
    const pitch = options.pitchBase;
    const step = async () => {
      const a = await loadFrontend(fetcher(absolute(dict)));
      if (!pitch) return accentYomite(a);
      return pitchOrAccentYomite(
        a,
        () => loadPitchModel(fetcher(absolute(pitch))),
        (e) => console.warn("yomiscript: no pitch model, the dictionary accent is used:", e),
      );
    };
    return withAccent(k, step, (e) => console.warn("yomiscript: no Japanese dictionary accent, Kokoro's own pitch is used:", e));
  })();
  katarite.catch(() => (katarite = null)); // a failed load can be retried
  return katarite;
}

/** the speech for a YomiScript, synthesized once and kept for replays */
export function synthesize(ys: string): Promise<Speech> {
  let s = cache.get(ys);
  if (!s) {
    s = loadKatarite().then((k) => k.speak(ys));
    cache.set(ys, s);
    s.catch(() => cache.delete(ys));
  }
  return s;
}

let ctx: AudioContext | null = null;
export interface Playback {
  /** AudioContext time when the audio started */
  startedAt: number;
  context: AudioContext;
  stop(): void;
  ended: Promise<void>;
}
/** plays the speech; throws when the browser does not allow audio yet (no user gesture) */
export async function play(speech: Speech): Promise<Playback> {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  if (ctx.state !== "running") throw new Error("audio is not allowed yet: press play");
  const buf = ctx.createBuffer(1, speech.samples.length, speech.sampleRate);
  buf.copyToChannel(Float32Array.from(speech.samples), 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  const ended = new Promise<void>((resolve) => (src.onended = () => resolve()));
  const startedAt = ctx.currentTime + 0.05;
  src.start(startedAt);
  return { startedAt, context: ctx, stop: () => src.stop(), ended };
}
