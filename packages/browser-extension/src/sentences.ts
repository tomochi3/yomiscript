// The text of a page cut into what is read one at a time: sentences, short enough for one YomiScript utterance each,
// and the sentences put together into the batches one LLM request writes.

/** a sentence longer than this is cut at a comma or a space (one utterance per piece) */
export const MAX_SENTENCE = 160;
/** a batch: at most this many sentences, and at most BATCH_CHARS characters. The first batch after a start is
 * FIRST_BATCH sentences, so that the speech starts soon */
export const BATCH_SENTENCES = 8;
export const FIRST_BATCH = 2;
export const BATCH_CHARS = 900;

const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
// where a long sentence may be cut: after a comma (Japanese or Latin) or a space
const CUT = /[、，,;；:：]|\s/u;
// only spaces, punctuation and symbols: nothing to say
const SILENT = /^[\s\p{P}\p{S}]*$/u;

/** a long sentence as pieces of at most `max` characters, each cut after the last comma or space that fits */
export function cutLong(s: string, max = MAX_SENTENCE): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > max) {
    let at = -1;
    for (let i = max; i > max / 3; i--)
      if (CUT.test(rest[i - 1])) {
        at = i;
        break;
      }
    if (at < 0) at = max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out.filter((x) => x && !SILENT.test(x));
}

/** the sentences of a text: each paragraph (line) cut by Intl.Segmenter, long ones cut again, silent ones dropped */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    const p = para.replace(/\s+/g, " ").trim();
    if (!p || SILENT.test(p)) continue;
    for (const { segment } of segmenter.segment(p)) out.push(...cutLong(segment.trim()));
  }
  return out;
}

/** the end of the batch that starts at `start`: at most `maxSentences` sentences and `maxChars` characters, at least one */
export function batchEnd(sentences: string[], start: number, maxSentences = BATCH_SENTENCES, maxChars = BATCH_CHARS): number {
  let end = start + 1,
    chars = sentences[start]?.length ?? 0;
  while (end < sentences.length && end - start < maxSentences && chars + sentences[end].length <= maxChars) chars += sentences[end++].length;
  return Math.min(end, sentences.length);
}
