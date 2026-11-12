// Chrome's native messaging framing: each message is its JSON in UTF-8, after its length as a 32-bit unsigned integer
// in the machine's byte order (little-endian on every platform Chrome runs on).

/** a message as Chrome expects it on the host's stdout */
export function frame(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

/** the first message of a buffer, or null while it is not complete */
export function unframe(buf) {
  if (buf.length < 4) return null;
  const n = buf.readUInt32LE(0);
  if (buf.length < 4 + n) return null;
  return JSON.parse(buf.subarray(4, 4 + n).toString("utf8"));
}

/** the first message Chrome sends on stdin */
export function readMessage(stream) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      const m = unframe(buf);
      if (m === null) return;
      stream.off("data", onData);
      resolve(m);
    };
    stream.on("data", onData);
    stream.on("end", () => reject(new Error("stdin closed before a whole message arrived")));
  });
}
