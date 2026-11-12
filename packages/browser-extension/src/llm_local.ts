// The LLM of the user's own subscription: the Claude Code or Codex CLI on this computer, reached through Chrome's
// native messaging (the host in host/, installed once with host/install.mjs). No API key: the CLI uses the plan it is
// signed in with, and its own default model.

import type { Llm } from "./yomite.ts";

/** the native messaging host's name (host/install.mjs registers it under this name) */
export const HOST = "com.yomiscript.reader";
export type LocalCli = "claude" | "codex";

export interface HostReply {
  text?: string;
  error?: string;
}

/** the text of the host's reply; throws with the host's error, or with how to install the host when it is missing */
export function hostText(reply: HostReply | undefined, lastError?: string): string {
  if (lastError) {
    if (/not found|forbidden/i.test(lastError))
      throw new Error(`the helper for the subscription is not installed (${lastError}); run: node packages/browser-extension/host/install.mjs`);
    throw new Error(`the helper failed: ${lastError}`);
  }
  if (reply?.error) throw new Error(reply.error);
  if (typeof reply?.text !== "string") throw new Error("the helper gave no answer");
  return reply.text;
}

export function localLlm(cli: LocalCli): Llm {
  return {
    complete: (system, user) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendNativeMessage(HOST, { cli, prompt: `${system}\n\n${user}` }, (reply: HostReply | undefined) => {
          try {
            resolve(hostText(reply, chrome.runtime.lastError?.message));
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      }),
  };
}
