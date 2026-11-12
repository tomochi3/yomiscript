// Reading the text of a tab. The extension asks for no website access at install: the toolbar button and the context
// menu grant it for the tab they are used on (activeTab); for any other tab the panel asks for the site's access once.
import { extractPageText, type PageText } from "./page_text.ts";

export async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("no tab to read");
  return tab;
}

async function run(tabId: number): Promise<PageText> {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPageText });
  if (!r?.result) throw new Error("the page gave no text");
  return r.result;
}

/** the site's access, asked for when the extension does not have it yet (needs the click that led here) */
async function askAccess(tab: chrome.tabs.Tab): Promise<boolean> {
  let origin: string;
  try {
    origin = new URL(tab.url ?? "").origin;
  } catch {
    return false;
  }
  if (!/^https?:/.test(origin)) return false;
  const origins = [`${origin}/*`];
  if (await chrome.permissions.contains({ origins })) return false; // it has access, so the failure is something else
  return chrome.permissions.request({ origins });
}

/** the text of a tab; throws with the reason when the page cannot be read (a browser page, the web store, no access) */
export async function pageText(tab: chrome.tabs.Tab): Promise<PageText> {
  const tabId = tab.id as number;
  try {
    return await run(tabId);
  } catch (e) {
    if (await askAccess(tab)) return run(tabId);
    throw new Error(`cannot read this page: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}
