// The native messaging host's entry (install.mjs points Chrome at a script that runs it): one message in, one out.
import { answer } from "./host.mjs";
import { frame, readMessage } from "./native.mjs";

let reply;
try {
  reply = await answer(await readMessage(process.stdin));
} catch (e) {
  reply = { error: String(e) };
}
process.stdout.write(frame(reply), () => process.exit(0));
