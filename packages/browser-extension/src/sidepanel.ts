// The side panel: what is being read, sentence by sentence (a click reads from that sentence), the controls and the
// settings. The text comes from the tab (tab.ts), the YomiScript from the LLM (yomite.ts), the audio from Kokoro
// (speech.ts); reader.ts puts them in order.
import { Reader, type SentenceState } from "./reader.ts";
import { isFresh, REQUEST_KEY, type ReadRequest } from "./request.ts";
import { splitSentences } from "./sentences.ts";
import { loadSettings, saveSettings } from "./settings.ts";
import { setUpSpeech, speechDeps, warmUp } from "./speech.ts";
import { activeTab, pageText } from "./tab.ts";
import { anthropicClient, MODELS, writeYomiScript, type YomiteSettings } from "./yomite.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  readPage: $<HTMLButtonElement>("read-page"),
  readSelection: $<HTMLButtonElement>("read-selection"),
  toggle: $<HTMLButtonElement>("toggle"),
  status: $<HTMLDivElement>("status"),
  settings: $<HTMLDetailsElement>("settings"),
  apiKey: $<HTMLInputElement>("api-key"),
  model: $<HTMLSelectElement>("model"),
  effort: $<HTMLSelectElement>("effort"),
  save: $<HTMLButtonElement>("save"),
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

async function settingsWithKey(): Promise<YomiteSettings | null> {
  const s = await loadSettings();
  if (s.apiKey) return s;
  ui.settings.open = true;
  ui.apiKey.focus();
  status("Enter your Anthropic API key in the settings first.", true);
  return null;
}

/** reads a text: cut into sentences, shown, and read from the first */
async function read(title: string, text: string): Promise<void> {
  const settings = await settingsWithKey();
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
  const client = anthropicClient(settings.apiKey);
  reader = new Reader(
    sentences,
    { write: (batch) => writeYomiScript(client, settings, title, batch), ...speechDeps },
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

async function handleRequest(r: unknown): Promise<void> {
  if (!isFresh(r)) return;
  await chrome.storage.session.remove(REQUEST_KEY);
  const q: ReadRequest = r;
  await readTab(q.kind, q.kind === "selection" ? q.selectionText : "", q.tabId);
}

async function showSettings(): Promise<void> {
  ui.model.replaceChildren(...MODELS.map((m) => new Option(m, m)));
  const s = await loadSettings();
  ui.apiKey.value = s.apiKey;
  ui.model.value = s.model;
  ui.effort.value = s.effort;
  if (!s.apiKey) ui.settings.open = true;
}

function wire(): void {
  ui.readPage.addEventListener("click", () => void readTab("page"));
  ui.readSelection.addEventListener("click", () => void readTab("selection"));
  ui.toggle.addEventListener("click", () => {
    if (!reader) return;
    if (reader.reading) reader.stop();
    else void reader.start(reader.index).finally(updateToggle);
    updateToggle();
  });
  ui.save.addEventListener("click", () => {
    void saveSettings({ apiKey: ui.apiKey.value, model: ui.model.value, effort: ui.effort.value as YomiteSettings["effort"] }).then(() => {
      ui.settings.open = false;
      status("Settings saved.");
    });
  });
  chrome.storage.session.onChanged.addListener((changes) => {
    if (REQUEST_KEY in changes) void handleRequest(changes[REQUEST_KEY].newValue);
  });
}

async function main(): Promise<void> {
  setUpSpeech();
  wire();
  await showSettings();
  const pending = await chrome.storage.session.get(REQUEST_KEY);
  await handleRequest(pending[REQUEST_KEY]);
}

void main();
