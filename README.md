# yomiscript

Speech from the pronunciation an LLM writes: the LLM that writes a sentence also writes how it is read, as
**YomiScript**, a language-neutral DSL for pronunciation and prosody (IPA with prosody marks), and a small speech
engine speaks exactly that. It is not text-to-speech: how the text is read is decided by the LLM, not guessed by the
engine, which matters above all for Japanese, where one written form often has several readings (一日: ついたち or
いちにち, 上手: じょうず or うわて).

Status: early. The YomiScript spec is a v0.2 draft; the packages are on npm (`@yomiscript/*`, the CLI as `yomiscript`).

**Hear it:** [yomiscript.pages.dev](https://yomiscript.pages.dev/) has the sentences the original Kokoro misreads, each
as the original speaks it and as Kokoro speaks the LLM's YomiScript, generated in your browser
([`demo/ys_web/web/misread.html`](demo/ys_web/web/misread.html)).

## How it works

```
 LLM (writes the text and its reading)          YomiScript                   Katarite (YomiScript -> sound)
 ─────────────────────────────────────          ──────────                   ──────────────────────────────
 "一日から三日まで休みです。"         ──►  ja /tsɯitatɕi<t:一日> kaɾa<t:から>   ──►  Kokoro-82M (reference)
                                           mikka<t:三日> made<t:まで> ...↘/      Supertonic 3
```

- **Yomite** (読み手, "the reader") turns text into YomiScript. Here it is the calling LLM: it has the context the text
  was written in, so it knows which reading is meant. A Yomite can also be rules, a dedicated model or a person.
- **YomiScript** says how the text is pronounced, independent of any voice or engine. Whoever writes it decides the
  pronunciation; the engine follows it.
- **Katarite** (語り手, "the narrator") turns YomiScript into sound. It needs no text analysis of its own.

The TTS has no LLM and no text front end of its own: in an MCP server or a chat plugin, the calling LLM writes the
YomiScript as the tool's argument (D24).

## Results so far

From [`eval/browser_tts`](eval/browser_tts/) (one run each; the gold readings are provisional):

- Readings on a 70-sentence hard set (homographs, numbers, names): Codex 100%, Claude 98.6%, pyopenjtalk 78.6%, the
  original Kokoro front end 32.9%.
- Intelligibility (Whisper, kana error rate on the hard set): LLM-written YomiScript with Kokoro 3.7-3.9%, the
  original Kokoro 10.3%, Supertonic 3 on plain text 13.8% (5.6-7.6% when given kana for the ambiguous words), the
  macOS voice 5.5%.
- Cost: YomiScript is about 3 times the characters of the Japanese text (6 times with the original text `<t:…>`).

A paper draft is in [`paper/`](paper/).

## Packages

TypeScript, in [`packages/`](packages/) (to be published on npm). The models are not in the packages: the CLI and the
MCP server download them from Hugging Face on first use, and the Japanese accent dictionary the first time Japanese
is spoken.

| Package | What it is |
|---|---|
| [`@yomiscript/core`](packages/core/) | The YomiScript parser and types, the rule prosody, the Katarite interface, and `YOMISCRIPT_INSTRUCTIONS` (how to write YomiScript, for an LLM's prompt or a tool description) |
| [`@yomiscript/kokoro`](packages/kokoro/) | The Kokoro-82M Katarite: onnxruntime-node (fp32, identical to the original Kokoro, D21 / D22) and onnxruntime-web (fp16 weights) |
| [`@yomiscript/supertonic`](packages/supertonic/) | The Supertonic 3 Katarite: the original text with kana for the words it might misread (D23) |
| [`@yomiscript/ja-accent`](packages/ja-accent/) | The Japanese dictionary accent the tools add before Kokoro (D25): OpenJTalk's front end (jpreprocess, NAIST-JDIC) as WebAssembly marks the accent phrases it reads the same way as the YomiScript |
| [`yomiscript`](packages/cli/) | The CLI: `yomiscript speak "ja /ame<t:雨> desɯ<t:です。> ↘/"` |
| [`@yomiscript/mcp`](packages/mcp/) | An MCP server with one tool, `speak` |
| [`@yomiscript/gui-chat-plugin`](packages/gui-chat-plugin/) | A [GUI Chat Protocol](https://github.com/receptron/gui-chat-protocol) plugin that speaks in the browser and highlights the word being spoken |
| [`browser-extension`](packages/browser-extension/) | A Chromium extension (not on npm) that reads the open page or the selected text aloud: an LLM (Claude or OpenAI by API key, or Claude Code / Codex by subscription) writes the YomiScript of each sentence, Kokoro speaks it in the browser |

The browser demo [`demo/ys_web/`](demo/ys_web/) plays YomiScript entirely in the browser (it also has the ONNX
export of Kokoro).

## YomiScript

- **Phonemes** are plain IPA.
- **Prosody** uses IPA's own marks wherever they exist: pitch accent (`ꜛ` `ꜜ`), Chao tone letters (`˥˧˩`), stress
  (`ˈ` `ˌ`), length, boundaries (` | ` ` ‖ `) and sentence-final `↘` `↗`. Languages differ only in which marks they
  use.
- **Language tags** (BCP 47) apply to a whole utterance (`en-US /… ↘/`) or to a span inside it (`{ja …}`), so
  code-switching is native. Dialects are not tagged: a dialect is a Yomite setting, and its effect is already in the
  IPA and the pitch values (D19).
- **Pitch values** `<f0:…>` (semitones, per mora or syllable) can be written next to the marks. The Katarite renders
  only the values (D18).
- **The original text** `<t:…>` can follow each span (D23). It never changes the pronunciation; it lets a player show
  the text and lets a text-based engine such as Supertonic read it.
- **No native scripts** in the reading: kana, pinyin and other writing systems are not YomiScript; every language,
  Japanese included, is written in IPA (D17).

Example, an English sentence with Japanese names:

```
en-US /maɪ ˈfɹɛnd {ja taꜛnaka} ˈlɪvz ɪn {ja toꜛːkʲoː} ↘/
```

Spec: [`spec/yomiscript/`](spec/yomiscript/) (language tags: [`langtags.md`](spec/yomiscript/langtags.md)). Lexicons
(`.koedict`) and inline reading hints are inputs to a Yomite, not part of YomiScript (D14): [`spec/lexicon/`](spec/lexicon/).

## Other parts of the repository

| Part | What it is | Location |
|---|---|---|
| Kokoro Yomites | Kokoro's own English and Japanese front ends, rewritten as YomiScript, to check that the Katarite reproduces the original Kokoro exactly | [`yomite/`](yomite/), [`eval/kokoro_parity/`](eval/kokoro_parity/) |
| Evaluation | The LLM-as-Yomite experiments, the browser TTS comparison, the JSUT baselines | [`eval/`](eval/) |
| Katarite plugins | Notes on mapping YomiScript to other TTS engines and vendor formats | [`plugins/`](plugins/) |

### Earlier experiments

Kept for reference and for the comparison in the paper; not used by the packages.

| Part | What it was | Location |
|---|---|---|
| Yomi-0 | A dedicated 7.7M-parameter Japanese reading model (MLX), distilled from pyopenjtalk. It stayed below its teacher (JSUT sentence accuracy 68.2% vs 72.5%, hard set 57.1% vs 71.4%): distillation inherits the teacher's context-free readings, which is what the LLM Yomite avoids | [`models/yomi/`](models/yomi/) |
| MoLD | Shared weights plus a swappable memory per language or dialect for Yomi-0, with lexicons compiled into memory | [`mold/`](mold/), [`models/yomi/mlx/MOLD.md`](models/yomi/mlx/MOLD.md) |
| Python Kokoro Katarite | The first Kokoro Katarite, in the old notation; replaced by `@yomiscript/kokoro` | [`tts/kokoro_ys/`](tts/kokoro_ys/) |
| KOE-IR | The v0.1 draft that YomiScript replaced | [`spec/koe-ir/`](spec/koe-ir/) |

## Terminology (D9)

- **Lexicon**: the human-readable `.koedict` / `@lexicon` dictionaries given to a Yomite.
- **Memory**: a key-value memory inside a neural network (MoLD).

## Documents

- [Decisions D1-D24](docs/decisions.md), [hypotheses H0-H12](docs/hypotheses.md)
- [Distribution plan](docs/plan.md)
- [Contributing](CONTRIBUTING.md)

## License

- Code: Apache License 2.0 ([`LICENSE`](LICENSE))
- Specifications (under `spec/`): CC BY 4.0 ([`spec/LICENSE`](spec/LICENSE))
- Dictionaries and data follow their own licenses, stated in each file (for example
  [`eval/LICENSE_DATA.md`](eval/LICENSE_DATA.md)). Model weights are not in the repository; Kokoro-82M is Apache 2.0,
  Supertonic 3 is OpenRAIL-M.
