// The Katarite of the extension: the chat plugin's speaker (Kokoro w16 on onnxruntime-web, with the Japanese
// dictionary accent and pitch model), running in the side panel. The models come from Hugging Face the first time and
// are kept in the Cache API by the demo's model cache, so a later session starts without downloading them again.
import { configureSpeaker, loadKatarite, play, type Loader } from "@yomiscript/gui-chat-plugin/core";
import { KOKORO_MODELS_URL } from "@yomiscript/kokoro";
import { modelBytes, modelFetcher } from "../../../demo/ys_web/web/model_cache.js";
import type { ReaderDeps } from "./reader.ts";

/** a loader that keeps every file of a Hugging Face base in the Cache API (a plain fetch for any other base) */
const cachedLoader = (base: URL): Loader => {
  const bytes = modelFetcher(base.href).then(modelBytes);
  return async (path) => (await bytes)(path);
};

/** onnxruntime's threads: several when the panel is cross-origin isolated (the manifest asks for it), else one */
const threads = (): number => (globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1);

export function setUpSpeech(): void {
  configureSpeaker({
    modelBase: KOKORO_MODELS_URL,
    ortWasmBase: chrome.runtime.getURL("ort/"),
    loader: cachedLoader,
    numThreads: threads(),
  });
}

/** the Katarite and the player of the Reader */
export const speechDeps: Pick<ReaderDeps, "speak" | "play"> = {
  speak: async (ys) => (await loadKatarite()).speak(ys),
  play,
};

/** starts loading the models now (they take a while the first time) */
export function warmUp(): Promise<unknown> {
  return loadKatarite();
}
