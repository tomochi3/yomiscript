// Installs the native messaging host, so that the extension can use the Claude Code or Codex CLI of this computer
// (the user's subscription, no API key). Run from the repository, in a shell where `claude` / `codex` work:
//   node packages/browser-extension/host/install.mjs              # install (or update)
//   node packages/browser-extension/host/install.mjs --uninstall
// It writes host/run.sh (this node, this script, and this shell's PATH: Chrome starts hosts with a minimal PATH) and
// the host's manifest into the NativeMessagingHosts folder of every Chromium browser found (macOS, Linux). The
// extension's ID comes from the "key" in its manifest, so it is the same for every unpacked copy.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HOST = "com.yomiscript.reader";
const here = path.dirname(fileURLToPath(import.meta.url));

/** the ID Chrome gives an extension with this manifest key: the SHA-256 of the key, its first 32 hex digits as a-p */
export function extensionId(key) {
  const hex = crypto.createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

/** the NativeMessagingHosts folders of the Chromium browsers, on this platform */
export function hostDirs(platform = process.platform, home = os.homedir()) {
  const browsers =
    platform === "darwin"
      ? [
          "Google/Chrome",
          "Google/Chrome Beta",
          "Google/Chrome Canary",
          "Chromium",
          "Microsoft Edge",
          "BraveSoftware/Brave-Browser",
          "Vivaldi",
          "Arc/User Data",
        ].map((b) => path.join(home, "Library/Application Support", b))
      : ["google-chrome", "google-chrome-beta", "chromium", "microsoft-edge", "BraveSoftware/Brave-Browser", "vivaldi"].map((b) =>
          path.join(home, ".config", b),
        );
  return browsers.map((b) => ({ browser: b, dir: path.join(b, "NativeMessagingHosts") }));
}

export function hostManifest(runPath, id) {
  return {
    name: HOST,
    description: "YomiScript Reader: Claude Code / Codex on this computer",
    path: runPath,
    type: "stdio",
    allowed_origins: [`chrome-extension://${id}/`],
  };
}

// a single-quoted shell word: each ' becomes '\'' (close, an escaped quote, reopen)
const ESCAPED_QUOTE = "'\\''";
const quote = (s) => "'" + s.replaceAll("'", ESCAPED_QUOTE) + "'";
export function runScript(nodePath, mainPath, pathEnv) {
  return `#!/bin/sh\n# written by install.mjs: Chrome starts the host with a minimal PATH, so the installing shell's PATH is kept here\nexport PATH=${quote(pathEnv)}\nexec ${quote(nodePath)} ${quote(mainPath)}\n`;
}

function install(uninstall) {
  if (process.platform === "win32") throw new Error("Windows is not supported yet (its hosts are registered in the registry)");
  const manifest = JSON.parse(fs.readFileSync(path.join(here, "../public/manifest.json"), "utf8"));
  const id = extensionId(manifest.key);
  const run = path.join(here, "run.sh");
  const found = hostDirs().filter((d) => fs.existsSync(d.browser));
  if (!found.length) throw new Error("no Chromium browser profile folder was found");
  for (const { dir } of found) {
    const file = path.join(dir, `${HOST}.json`);
    if (uninstall) fs.rmSync(file, { force: true });
    else {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(hostManifest(run, id), null, 2) + "\n");
    }
    console.log(`${uninstall ? "removed" : "wrote"} ${file}`);
  }
  if (uninstall) return fs.rmSync(run, { force: true });
  fs.writeFileSync(run, runScript(process.execPath, path.join(here, "main.mjs"), process.env.PATH ?? ""), { mode: 0o755 });
  console.log(`wrote ${run}\nextension ID: ${id}\nRestart the browser if the extension says the helper is not installed.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    install(process.argv.includes("--uninstall"));
  } catch (e) {
    console.error(`install.mjs: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
