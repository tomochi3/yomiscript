// A request to read, from the context menu (the service worker) to the side panel.
export const REQUEST_KEY = "readRequest";
/** a request older than this when the panel sees it is dropped (the panel was opened later, by hand) */
export const REQUEST_TTL_MS = 15000;

export interface ReadRequest {
  kind: "selection" | "page";
  tabId: number;
  /** the selection as the context menu gives it (its line breaks lost), used when the page cannot be read */
  selectionText: string;
  at: number;
}

export function isFresh(r: unknown, now = Date.now()): r is ReadRequest {
  if (!r || typeof r !== "object") return false;
  const q = r as Partial<ReadRequest>;
  return (q.kind === "selection" || q.kind === "page") && typeof q.tabId === "number" && typeof q.at === "number" && now - q.at < REQUEST_TTL_MS;
}
