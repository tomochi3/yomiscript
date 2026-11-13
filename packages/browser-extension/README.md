# @yomiscript/browser-extension

A Chromium extension (Chrome, Edge, Brave; Manifest V3) that reads the open page or the selected text aloud. It is the
YomiScript pipeline on any web page: an LLM is the Yomite and writes how every sentence is read, from the context of
the page, and the Kokoro Katarite speaks it in the browser. The LLM is Claude or an OpenAI model through its API (your
API key), or Claude Code or Codex on your computer (your subscription, no API key). Not published to npm (`private`); build it and load it
unpacked.

```
tab ─► the page's main text, or the selection (page_text.ts)
    ─► sentences (sentences.ts) ─► batches of up to 8 sentences (the first one 2, so that the speech starts soon)
    ─► the LLM writes one YomiScript utterance per sentence (yomite.ts; YOMISCRIPT_INSTRUCTIONS from @yomiscript/core)
    ─► the Japanese dictionary accent and pitch, Kokoro w16 on onnxruntime-web (the chat plugin's speaker)
    ─► audio, sentence by sentence, the next one made while one plays (reader.ts)
```

## Use

- The toolbar button opens the side panel: **Read page** reads the page's `<article>` or `<main>` (or the body without
  navigation, header and footer), **Read selection** the selected text. A click on a sentence reads from there;
  **Stop** / **Play** stop and resume.
- The context menu has **Read the selection aloud** and **Read this page aloud**; they open the panel and start.
- **Settings** (in the panel): which LLM writes the reading, and the effort (`low` by default, for a quick start).
  Hover a sentence to see its YomiScript.

| Provider | What it needs |
|---|---|
| Claude API | an Anthropic API key; the model (`claude-opus-5-5` by default, or Sonnet / Haiku) |
| OpenAI API | an OpenAI API key; the model, chosen from your account's models (**Load models**) |
| Claude Code | the `claude` CLI signed in with your Claude plan, and the helper (below) |
| Codex | the `codex` CLI signed in with your ChatGPT plan, and the helper (below) |

### The helper for a subscription (Claude Code, Codex)

A browser extension cannot run a program, so the CLI is reached through Chrome's native messaging: a small host in
`host/` that Chrome starts for each batch of sentences. Install it once, from the repository, in a terminal where
`claude` (or `codex`) works (macOS, Linux; Windows is not supported yet):

```bash
node packages/browser-extension/host/install.mjs
```

It writes `host/run.sh` (this `node`, `host/main.mjs`, and this terminal's `PATH`, since Chrome starts hosts with a
minimal one) and registers the host for every Chromium browser it finds. Restart the browser afterwards. The
extension's ID is fixed by the `key` in its manifest, so the registration fits every unpacked copy. Run it again after
moving the repository or changing node; `--uninstall` removes it. The host runs the CLI as
`eval/llm_yomite/llm.mjs` does for the experiments, in its locked form, and only those two. A page can hold
instructions aimed at the LLM, so the CLI starts with no tools at all: Claude Code with `--tools ""`, no MCP servers
(`--strict-mcp-config`), no skills or slash commands, and none of your settings (`--setting-sources ""`: your
permission rules and hooks); Codex read-only, without your `config.toml` (its MCP servers) or rules, without web search,
the shell, connectors, plugins, the browser and computer use. It can only answer with text, in a temporary folder,
with the CLI's default model. Each batch starts the CLI, so the speech starts later than with an API.

What leaves the browser: the sentences being read and the page's title go to the chosen LLM: `api.anthropic.com` or
`api.openai.com` with your key (kept in the extension's local storage), or the CLI, which sends them to its own service. The voice runs locally: the Kokoro models and voices (about 165 MB),
the accent dictionary (28 MB) and the pitch model (8 MB) are downloaded from Hugging Face the first time and kept in
the Cache API.

Permissions: the context menu reads the tab it is used on (`activeTab`, `scripting`). The panel's **Read page** /
**Read selection** buttons ask once for website access (all sites, an optional permission: Chrome tells an extension
a tab's address only once it has access, so it cannot ask for one site); Chrome's own pages and the Web Store cannot be
read. The host permissions are the two APIs and
Hugging Face only; `nativeMessaging` reaches the helper. The panel is cross-origin isolated (COOP / COEP in the manifest), so onnxruntime runs on up to 4
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
| `src/yomite.ts` | The LLM Yomite: one request per batch asking for `{"utterances": [...]}`, each utterance checked with the parser, the ones that do not parse asked for again once with the parser's error, then left out |
| `src/llm_anthropic.ts`, `src/llm_openai.ts`, `src/llm_local.ts`, `src/llms.ts` | The LLMs: the Messages API (structured output; the server-side fallback on a refusal), the Responses API (strict structured output), the helper; the one the settings choose |
| `src/settings.ts`, `src/settings_ui.ts` | The settings and their fields in the panel |
| `host/` | The helper: `main.mjs` (one message in, one out), `host.mjs` (the answer), `native.mjs` (Chrome's framing), `install.mjs` |
| `src/reader.ts` | The order of the steps: the YomiScript of the next sentences requested ahead, the next audio made while one plays, stop / resume, a failure stops at its sentence |
| `src/speech.ts` | The Katarite: `@yomiscript/gui-chat-plugin`'s speaker with the demo's model cache (`demo/ys_web/web/model_cache.js`) |

## Checks

- `npx vitest run packages/browser-extension` (from the repository root): sentences, batches, settings, the Yomite and
  each LLM with stand-ins for the APIs (the requests, the retry, refusals), the helper (framing, answers, install
  files), and the Reader's order of steps with stand-ins for the Yomite, the Katarite and the player. No browser,
  models, CLI or network.
- `yarn workspace @yomiscript/browser-extension typecheck`, and `npx eslint packages/browser-extension`.
- In a browser: load the unpacked extension, open a page, press **Read page**.
