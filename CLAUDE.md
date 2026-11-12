# CLAUDE.md — yomiscript

Working notes for AI coding agents in this repo. Human-facing docs (what it is, the architecture, each part's setup)
live in **README.md** and the README of each directory — read them for anything not covered here. The coding rules
follow `../mulmoterminal/CLAUDE.md`, adapted to a JavaScript + Python repo.

## The center of the project
**YomiScript** (`spec/yomiscript/`) is the language-neutral hub. A **Yomite** turns text into YomiScript (an LLM,
Yomi-0, rules, a person); a **Katarite** turns YomiScript into sound (Kokoro-82M is the reference). Decisions are
numbered D1, D2, … in `docs/decisions.md`. A change to the notation or to who decides what is a new D entry, not a
silent edit.

## Stack & package manager
- **TypeScript** for everything that ships (D24): yarn workspaces in `packages/` (core, kokoro,
  supertonic, ja-accent, cli, mcp, gui-chat-plugin; published as `@yomiscript/*`, the CLI as `yomiscript`), `tsc -b` to `dist/` (`yarn build`). Relative imports use `.ts`
  (rewritten to `.js` on build); packages import each other by name (`@yomiscript/core`). The browser demo loads the
  built packages through an import map; Node scripts (`eval/`, `yomite/`) import the built packages too, so run
  `yarn build` after changing a package. Vitest reads the sources directly. No Python in what ships.
- **Python 3.11+**: each part keeps its own `requirements.txt` (`eval/`, `models/yomi/mlx/` with its own `.venv`).
  The Kokoro Yomites need `pip install kokoro "misaki[ja]"`.
- **yarn** (classic) workspaces: the root `package.json` holds the dev tools, each package its own dependencies.
  Use `yarn add` (`yarn workspace @yomiscript/<p> add …`); don't hand-edit versions. `onnxruntime-web` and
  `onnxruntime-node` are pinned to exactly **1.22.0**: the parity results in `eval/kokoro_parity` were measured with
  it, so a new version is a change to re-measure, not a routine bump.

## Run after changes
- `yarn build` compiles the packages. `yarn format` runs Prettier (printWidth 160) on TS / JS / HTML, then `ruff format` on Python. Markdown and JSON data
  are not formatted (`.prettierignore`).
- `yarn lint` builds the packages' types first (the type-aware rules read `@yomiscript/*` from their `dist/`), then runs
  ESLint (`eslint.config.js`, with typescript-eslint for `.ts`), then `ruff check` (`pyproject.toml`).
  ruff is not an npm dependency; it has to be on `PATH` (setup in `CONTRIBUTING.md`).
- `yarn typecheck` runs `tsc -b` on the packages, then on their tests (`packages/*/test/tsconfig.json`; Vitest strips
  types without checking them), and the plugin's own `typecheck`.
- `yarn test` runs Vitest (`test/**/*.spec.js`, `packages/*/test/**/*.spec.ts`). Tests run without models, Python, network or API keys. Mock
  external services; never call them.
- Yomi-0: `cd models/yomi/mlx && .venv/bin/python -m pytest -q tests`.
- When you touch the Kokoro Katarite (`packages/kokoro`, the parser in `packages/core`) or a Kokoro Yomite
  (`yomite/*_kokoro/`), `yarn test` checks the phoneme string and ids. The audio check is `eval/kokoro_parity`
  (README there). It needs the exported ONNX models and takes minutes; run it before claiming parity.

## Lint policy: every rule is an error
Same as mulmoterminal. The presets decide WHICH rules run, and every one of them runs at error, because a warning
reports a violation and ships it. A rule that genuinely must not apply somewhere is turned off **by name, for those
files, with the reason** in `eslint.config.js` or `pyproject.toml`. Don't use warn, and don't put a bare disable
comment in the code.

Size limits, the same in both languages: function length 60 lines / 60 statements, complexity 20, nesting depth 4,
6 parameters, 600 lines per file. When a function is over a limit, split it into named steps. Don't raise the limit.
One exemption exists: model constructors and loss functions in `models/yomi/mlx` and `tts/kokoro_ft` take their
hyperparameters from saved checkpoint configs, so their parameter counts are exempt.

Refactoring must not change behaviour. Check it against the committed version: the same output on the presets and
fixtures (JS), the same generated data or training losses with a fixed seed (Python). Say what you compared.

## No copies kept in sync by hand
A value or function two places need lives in ONE place, and both import it. Never mirror it with a "keep the two
copies in sync" comment. Examples already in the repo:
- The parser, the rule prosody and the YomiScript instructions for LLMs (`YOMISCRIPT_INSTRUCTIONS`) live in
  `packages/core`; the demo, the eval scripts, the CLI, the MCP server and the plugin all import them.
- Kokoro's vocabulary lives in `packages/kokoro/src/vocab.ts`; `VOWELS` in core's `yomiscript.ts`;
  `f0_override.py` is the one Python copy of the F0 rendering (for the Python checks only); it does not copy the
  Japanese rendering of D28 (`packages/kokoro/src/render_ja.ts`).
- `demo/ys_web/node.mjs` is the eval scripts' entry to the Kokoro package with onnxruntime-web;
  `yomite/kokoro_yomite.mjs` is what the Kokoro Yomites share; the CLI's `runtime.ts` is what the CLI and MCP share.
- Demo data (`presets.json`) exists only under `demo/ys_web/web/`.

If two sides genuinely differ, share the common core and keep each side's extras local.

## The Kokoro reference: the original as the baseline, improved from there (D21, D22, D26)
The first stage reproduced the original Kokoro exactly (same phoneme string, ids, voice-pack entry, durations, F0,
audio within its run-to-run spread). That stage is done; from here the Katarite and the Yomites are improved
wherever the original reads unnaturally (D26: Japanese 。 and 、 are passed as `.` and `,`). Each such change is a D
entry and is checked by listening. The original's behaviour stays reproducible as the baseline (`plan(ys, { original:
true })`, `eval/kokoro_parity`). `test/fixtures/kokoro_original.json` was recorded from the original pipeline.
Regenerate it only from the original (`eval/kokoro_parity/ref_kokoro.py`), never from our own output.

## No emojis
No emojis anywhere you write in this repository: code, comments, docs, commit messages, CLI output. Compact notation
stays text (`↘ ↗ ‖ ꜛ ꜜ` are YomiScript, not decoration).

## Documentation language
Documentation is in English. Japanese appears only in examples and data (readings, example sentences, dictionary
entries). Comments, docstrings and messages (print, help, errors) are in English too.

## Layout
- `spec/`: YomiScript and lexicon specifications. `docs/`: decisions (D…), hypotheses (H…) and the distribution plan
  (`plan.md`: TypeScript on npm, no Python in what ships, D24).
- `packages/`: what ships on npm (D24): `core` (YomiScript), `kokoro`, `supertonic`, `ja-accent` (the Japanese
  dictionary accent, D25; its WebAssembly is built from Rust in `wasm/`, the build kept in `wasm/pkg/`), `cli`, `mcp`,
  `gui-chat-plugin`, and `browser-extension` (private, not on npm: reads a web page aloud, Claude as the Yomite).
- `demo/ys_web/`: the browser demo (`web/`, using the built packages). It also has the ONNX export
  (`export_split.py`, `exact_stft.py`).
- `yomite/`: the Kokoro-based Yomites (`en_kokoro`, `ja_kokoro`), used for the parity checks.
- `models/yomi/mlx/`: Yomi-0 and MoLD (training, tools, tests). `mold/`, `dict/`: lexicons and memories.
- `eval/`: benchmarks and investigations (`kokoro_parity`, `kokoro_questions`, `llm_yomite`, `browser_tts`, `audio8`, `prosody_ref`, JSUT baselines).
- `tts/`: earlier Python Kokoro experiments (old notation). `tools/`: converters (kana labels → YomiScript).
- `test/`: Vitest specs and fixtures across packages (the parity fixtures); each package has its own `test/`.
- `paper/`: the paper draft (LaTeX).
