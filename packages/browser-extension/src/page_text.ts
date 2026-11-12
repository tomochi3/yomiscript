// What is read from a tab. extractPageText runs inside the page (chrome.scripting.executeScript serializes it), so it
// uses nothing from outside its own body.

export interface PageText {
  title: string;
  url: string;
  /** the selected text; empty when nothing is selected */
  selection: string;
  /** the page's main text: its <article> or <main> when it has one, else the body without navigation and the like */
  text: string;
}

export function extractPageText(): PageText {
  // inside an article its own header (the title) is kept; on the whole body, the site's header and footer go too
  const NOISE = "nav, aside, script, style, noscript, template, form, button, figure, [role=navigation], [aria-hidden=true]";
  const PAGE_NOISE = `${NOISE}, header, footer, [role=banner], [role=contentinfo]`;
  const visibleText = (root: HTMLElement): string => {
    // innerText follows the layout (hidden elements left out, blocks on their own lines); the noise is hidden while it
    // is read and shown again at once
    const hidden = [...root.querySelectorAll<HTMLElement>(root === document.body ? PAGE_NOISE : NOISE)];
    const before = hidden.map((e) => e.style.getPropertyValue("display"));
    const priority = hidden.map((e) => e.style.getPropertyPriority("display"));
    hidden.forEach((e) => e.style.setProperty("display", "none", "important"));
    try {
      return root.innerText;
    } finally {
      hidden.forEach((e, i) => (before[i] ? e.style.setProperty("display", before[i], priority[i]) : e.style.removeProperty("display")));
    }
  };
  const main = [...document.querySelectorAll<HTMLElement>("article, main, [role=main]")].sort((a, b) => b.innerText.length - a.innerText.length)[0];
  return {
    title: document.title,
    url: location.href,
    selection: window.getSelection()?.toString() ?? "",
    text: visibleText(main && main.innerText.trim().length > 200 ? main : document.body),
  };
}
