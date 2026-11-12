// Reading the text of a tab. The extension asks for no website access at install: the context menu grants it for the
// tab it is used on (activeTab); the panel's buttons ask for website access once (askSiteAccess).
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

/** website access, asked for once: the panel's buttons read whichever tab is open, and Chrome tells an extension
 * a tab's address only once it has access to it, so access is asked for all sites (an optional permission, not asked
 * at install). Called first thing in a click, so that the click still counts as the user gesture Chrome requires. */
export async function askSiteAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.request({ origins: ["<all_urls>"] });
  } catch {
    return false;
  }
}

/** the text of a tab; throws with the reason when the page cannot be read (a browser page, the web store, no access) */
export async function pageText(tab: chrome.tabs.Tab): Promise<PageText> {
  try {
    return await run(tab.id as number);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    const hint = /permission|Cannot access/i.test(why)
      ? " (Chrome's own pages and the Web Store cannot be read; on other sites, allow website access when asked)"
      : "";
    throw new Error(`cannot read this page: ${why}${hint}`, { cause: e });
  }
}
