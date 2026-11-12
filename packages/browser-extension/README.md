# @yomiscript/browser-extension

A Chromium extension (Chrome, Edge, Brave; Manifest V3) that reads the open page or the selected text aloud. It is the
YomiScript pipeline on any web page: an LLM is the Yomite and writes how every sentence is read, from the context of
the page, and the Kokoro Katarite speaks it in the browser. Not published to npm (`private`); build it and load it
unpacked.

```
tab ─► the page's main text, or the selection (page_text.ts)
    ─► sentences (sentences.ts) ─► batches of up to 8 sentences (the first one 2, so that the speech starts soon)
    ─► Claude writes one YomiScript utterance per sentence (yomite.ts; YOMISCRIPT_INSTRUCTIONS from @yomiscript/core)
    ─► the Japanese dictionary accent and pitch, Kokoro w16 on onnxruntime-web (the chat plugin's speaker)
    ─► audio, sentence by sentence, the next one made while one plays (reader.ts)
```

## Use

- The toolbar button opens the side panel: **Read page** reads the page's `<article>` or `<main>` (or the body without
  navigation, header and footer), **Read selection** the selected text. A click on a sentence reads from there;
  **Stop** / **Play** stop and resume.
- The context menu has **Read the selection aloud** and **Read this page aloud**; they open the panel and start.
- **Settings** (in the panel): your Anthropic API key, the model (`claude-opus-5-5` by default, or Sonnet / Haiku) and
  the effort (`low` by default, for a quick start). Hover a sentence to see its YomiScript.

What leaves the browser: the sentences being read and the page's title go to `api.anthropic.com` with your key (the
key is kept in the extension's local storage). The voice runs locally: the Kokoro models and voices (about 165 MB),
the accent dictionary (28 MB) and the pitch model (8 MB) are downloaded from Hugging Face the first time and kept in
the Cache API.

Permissions: `activeTab` and `scripting` read the tab the toolbar button or the context menu was used on; for another
tab the panel asks for that site's access once (`optional_host_permissions`). The host permissions are the API and
Hugging Face only. The panel is cross-origin isolated (COOP / COEP in the manifest), so onnxruntime runs on up to 4
threads.

## Build and load

```bash
yarn install && yarn build     # at the repository root; the extension is built last, into packages/browser-extension/dist
```

Then open `chrome://extensions`, turn on Developer mode, and **Load unpacked** `packages/browser-extension/dist`.

`vite build` bundles the panel (`sidepanel.html`, `src/sidepanel.ts`) and the service worker (`src/background.ts` to
`background.js`), copies `public/manifest.json`, and copies onnxruntime-web's `ort-wasm-simd-threaded.jsep.{mjs,wasm}`
into `ort/`: an extension may not load code from elsewhere, so onnxruntime takes its WASM from the extension itself.

## Code

| File | What it does |
|---|---|
| `src/background.ts` | The service worker: the panel opens on the toolbar button; the context menu opens it with a request (`src/request.ts`, through session storage) |
| `src/sidepanel.ts` | The panel: controls, the sentences with the one being read highlighted, settings |
| `src/tab.ts`, `src/page_text.ts` | The text of a tab (`extractPageText` runs inside the page) |
| `src/sentences.ts` | Sentences (`Intl.Segmenter`, long ones cut at a comma) and batches |
| `src/yomite.ts` | The LLM Yomite: one request per batch with structured output (`{"utterances": [...]}`), each utterance checked with the parser, the ones that do not parse asked for again once with the parser's error, then left out. The larger models get the server-side fallback on a refusal |
| `src/reader.ts` | The order of the steps: the YomiScript of the next sentences requested ahead, the next audio made while one plays, stop / resume, a failure stops at its sentence |
| `src/speech.ts` | The Katarite: `@yomiscript/gui-chat-plugin`'s speaker with the demo's model cache (`demo/ys_web/web/model_cache.js`) |

## Checks

- `npx vitest run packages/browser-extension` (from the repository root): sentences, batches, settings, the Yomite with
  a stand-in for the API (the request, the retry), and the Reader's order of steps with stand-ins for the Yomite, the
  Katarite and the player. No browser, models or network.
- `yarn workspace @yomiscript/browser-extension typecheck`, and `npx eslint packages/browser-extension`.
- In a browser: load the unpacked extension, open a page, press **Read page**.
