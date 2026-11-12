// The side panel: what is being read, sentence by sentence (a click reads from that sentence), the controls and the
// settings. The text comes from the tab (tab.ts), the YomiScript from the LLM (yomite.ts), the audio from Kokoro
// (speech.ts); reader.ts puts them in order.
import { Reader, type SentenceState } from "./reader.ts";
import { isFresh, REQUEST_KEY, type ReadRequest } from "./request.ts";
import { splitSentences } from "./sentences.ts";
import { llmFor } from "./llms.ts";
import { loadSettings, missing, type Settings } from "./settings.ts";
import { openSettings, showSettings, wireSettings } from "./settings_ui.ts";
import { setUpSpeech, speechDeps, warmUp } from "./speech.ts";
import { activeTab, askSiteAccess, pageText } from "./tab.ts";
import { writeYomiScript } from "./yomite.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  readPage: $<HTMLButtonElement>("read-page"),
  readSelection: $<HTMLButtonElement>("read-selection"),
  toggle: $<HTMLButtonElement>("toggle"),
  status: $<HTMLDivElement>("status"),
  title: $<HTMLDivElement>("title"),
  sentences: $<HTMLDivElement>("sentences"),
};
let reader: Reader | null = null;

function status(text: string, error = false): void {
  ui.status.textContent = text;
  ui.status.classList.toggle("error", error);
}
function updateToggle(): void {
  ui.toggle.disabled = !reader;
  ui.toggle.textContent = reader?.reading ? "Stop" : "Play";
}

function showSentence(i: number, state: SentenceState, ys?: string | null): void {
  const p = ui.sentences.children[i] as HTMLElement | undefined;
  if (!p) return;
  for (const s of ["writing", "speaking", "done", "skipped"]) p.classList.toggle(s, s === state);
  if (ys !== undefined) p.title = ys ?? "no YomiScript could be written for this sentence";
  if (state === "speaking") p.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function showText(title: string, sentences: string[]): void {
  ui.title.textContent = title;
  ui.sentences.replaceChildren(
    ...sentences.map((s, i) => {
      const p = document.createElement("p");
      p.textContent = s;
      p.addEventListener("click", () => void reader?.start(i).finally(updateToggle));
      return p;
    }),
  );
}

/** the settings, or null (and the settings opened) when the chosen provider is not ready */
async function readySettings(): Promise<Settings | null> {
  const s = await loadSettings();
  const why = missing(s);
  if (!why) return s;
  openSettings();
  status(why, true);
  return null;
}

/** reads a text: cut into sentences, shown, and read from the first */
async function read(title: string, text: string): Promise<void> {
  const settings = await readySettings();
  if (!settings) return;
  const sentences = splitSentences(text);
  if (!sentences.length) {
    status("Nothing to read.", true);
    return;
  }
  reader?.stop();
  showText(title, sentences);
  // the voice loads (downloads, the first time) while the first sentences are being written
  warmUp().catch(() => undefined); // a failure is reported by the reader, at the sentence it stops at
  const llm = llmFor(settings);
  reader = new Reader(
    sentences,
    { write: (batch) => writeYomiScript(llm, title, batch), ...speechDeps },
    {
      sentence: (i, state, ys) => {
        showSentence(i, state, ys);
        if (state === "writing") status(`Reading ${i + 1} / ${sentences.length}`);
      },
      status: (m, error) => {
        status(m, error);
        updateToggle();
      },
      end: () => {
        status("Finished.");
        updateToggle();
      },
    },
  );
  const done = reader.start(0);
  updateToggle();
  await done;
  updateToggle();
}

/** reads the page or the selection of a tab (the active one unless the context menu named one) */
async function readTab(kind: "page" | "selection", fallback = "", tabId?: number): Promise<void> {
  try {
    const tab = tabId === undefined ? await activeTab() : await chrome.tabs.get(tabId);
    const t = await pageText(tab).catch((e: unknown) => {
      if (fallback) return { title: tab.title ?? "", selection: fallback, text: "", url: "" };
      throw e;
    });
    const text = kind === "selection" ? t.selection || fallback : t.text;
    if (kind === "selection" && !text.trim()) {
      status("Select some text on the page first.", true);
      return;
    }
    await read(t.title, text);
  } catch (e) {
    status(e instanceof Error ? e.message : String(e), true);
  }
}

/** a panel button: website access first (nothing awaited before it, so the click is still the gesture), then the tab */
async function readWithAccess(kind: "page" | "selection"): Promise<void> {
  if (await askSiteAccess()) return readTab(kind);
  status("Reading needs website access: press the button again and allow it.", true);
}

async function handleRequest(r: unknown): Promise<void> {
  if (!isFresh(r)) return;
  await chrome.storage.session.remove(REQUEST_KEY);
  const q: ReadRequest = r;
  await readTab(q.kind, q.kind === "selection" ? q.selectionText : "", q.tabId);
}

function wire(): void {
  ui.readPage.addEventListener("click", () => void readWithAccess("page"));
  ui.readSelection.addEventListener("click", () => void readWithAccess("selection"));
  ui.toggle.addEventListener("click", () => {
    if (!reader) return;
    if (reader.reading) reader.stop();
    else void reader.start(reader.index).finally(updateToggle);
    updateToggle();
  });
  wireSettings(status);
  chrome.storage.session.onChanged.addListener((changes) => {
    if (REQUEST_KEY in changes) void handleRequest(changes[REQUEST_KEY].newValue);
  });
}

async function main(): Promise<void> {
  setUpSpeech();
  wire();
  await showSettings((s) => missing(s) !== null);
  const pending = await chrome.storage.session.get(REQUEST_KEY);
  await handleRequest(pending[REQUEST_KEY]);
}

void main();
