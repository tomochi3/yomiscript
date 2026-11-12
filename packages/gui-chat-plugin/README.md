# @yomiscript/gui-chat-plugin

A [GUI Chat Protocol](https://github.com/receptron/gui-chat-protocol) plugin that lets the LLM speak. The LLM calls
the `speak` tool with one YomiScript utterance it wrote itself; the plugin speaks it in the browser with the Kokoro
Katarite (fp16 weights on onnxruntime-web, D24) and shows the original text (`<t:…>`, D23), highlighting the word
being spoken.

- **Tool:** `speak({ yomiscript })`. Its description is `YOMISCRIPT_INSTRUCTIONS` from `@yomiscript/core` with a short
  preface. `execute` checks the YomiScript with the parser. A parse error goes back to the LLM as the result message
  (no card) with instructions to fix it and call again.
- **View:** the text with the current span highlighted (requestAnimationFrame against the AudioContext clock), play /
  stop, a status while the models load, and the YomiScript in a collapsible detail. It plays when it mounts; when the
  browser does not allow audio yet, it waits for Play. **Preview:** the text.
- **Exports:** `.` and `./vue` export the Vue plugin (`plugin`, `View`, `Preview`) and the core. `./core` exports the
  framework-agnostic parts: `TOOL_DEFINITION`, `executeSpeak`, `pluginCore`, `SAMPLES`, `configureSpeaker`,
  `synthesize`, `play`, `spanAt`.
- **Vue only for now; React comes later.** The components are render functions in `.ts` files, not `.vue` files.

## Setup in a host

```ts
import { plugin, configureSpeaker } from "@yomiscript/gui-chat-plugin";

configureSpeaker({
  modelBase: "https://example.com/kokoro/", // models/{enc,f0n,dec}_w16.onnx and voices/<voice>.bin
  ortWasmBase: "https://example.com/ort/", // onnxruntime-web's dist/ (its .wasm and .mjs files)
  // executionProviders: ["webgpu", "wasm"],
  // accentBase: null, // no Japanese dictionary accent; default: the dictionary on Hugging Face (DICT_URL)
  // pitchBase: null, // the dictionary accent's Japanese values; default: the predicted pitch (D33), its model on Hugging Face (PITCH_URL)
  // loader: (base) => (path) => …, // how a file is loaded (Uint8Array); default: a plain fetch. The browser extension keeps them in the Cache API
  // numThreads: 4, // onnxruntime's WASM threads; default 1, which needs no cross-origin isolation
});
```

The models are downloaded on first use: about 163 MB, plus 0.5 MB per voice. The browser caches them. Japanese
gets the dictionary accent of `@yomiscript/ja-accent` (D25): its dictionary (28 MB) is fetched from `accentBase` the
first time Japanese is spoken, and its WebAssembly (1.4 MB) is resolved by the host's bundler next to the package's
glue (`new URL(…, import.meta.url)`). If the dictionary cannot be loaded, Kokoro's own pitch is used (a console
warning says so). The values then come from the pitch model (D33, D35, 8 MB, CC BY-SA 4.0), fetched from `pitchBase` the
first time Japanese is spoken; if it cannot be loaded, the dictionary accent is used (a console warning says so).
`onnxruntime-web` is pinned to 1.22.0 through `@yomiscript/kokoro`.

## Demo

```bash
cd packages/gui-chat-plugin && npx vite        # http://localhost:5173
```

The dev server serves the Kokoro models and voices from `demo/ys_web/web/`, onnxruntime's files from
`node_modules/onnxruntime-web/dist/`, where they already are, and the accent dictionary from the CLI's cache
(`$YOMISCRIPT_JA_DICT` or `~/.cache/yomiscript/ja-dict/jpreprocess-0.15.0`; run the CLI on Japanese once to fill it)
(`vite.config.ts`); nothing is copied. The sample calls
are YomiScript written by Codex for `eval/browser_tts` (Japanese homographs, a date, English). A text box takes any
YomiScript, so the error path can be tried too.

## Checks

- `npx vitest run packages/gui-chat-plugin` (from the repository root): the tool definition, the samples parse,
  execute's validation, and the timeline.
- `npx tsc -p packages/gui-chat-plugin/tsconfig.json`, and `npx eslint packages/gui-chat-plugin`.
