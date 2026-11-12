// The service worker: the toolbar button opens the side panel, and the context menu items open it with a request to
// read the selection or the page. The side panel does the reading; the request reaches it through session storage,
// which it reads when it opens and watches while it is open.
import { REQUEST_KEY, type ReadRequest } from "./request.ts";

const MENU = { selection: "yomiscript-read-selection", page: "yomiscript-read-page" } as const;

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.selection, title: "Read the selection aloud (YomiScript)", contexts: ["selection"] });
    chrome.contextMenus.create({ id: MENU.page, title: "Read this page aloud (YomiScript)", contexts: ["page"] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id || (info.menuItemId !== MENU.selection && info.menuItemId !== MENU.page)) return;
  // open() must be called while the click still counts as a user gesture: before anything is awaited
  const opened = chrome.sidePanel.open({ tabId: tab.id });
  const request: ReadRequest = {
    kind: info.menuItemId === MENU.selection ? "selection" : "page",
    tabId: tab.id,
    selectionText: info.selectionText ?? "",
    at: Date.now(),
  };
  void opened.then(() => chrome.storage.session.set({ [REQUEST_KEY]: request }));
});
