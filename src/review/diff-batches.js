/**
 * diff-batches (KJC-BUG-0378, #2263): a third-party PR can be far larger than
 * what one reviewer prompt holds (the reviewer clips at DIFF_CLIP_CHARS). The
 * diff is cut at each file and whole files are packed into batches that fit, so
 * every batch is reviewed complete. A file larger than the limit, or files past
 * the batch cap, are not reviewed and are named in the coverage, never hidden.
 */

const FILE_HEAD = /^diff --git a\/(.+?) b\//;

/** The diff cut at each file, with the number of changed lines in each. */
export function splitByFile(diff) {
  const parts = [];
  for (const line of String(diff).split("\n")) {
    const head = FILE_HEAD.exec(line);
    if (head) parts.push({ file: head[1], lines: [] });
    if (parts.length === 0) continue;
    parts.at(-1).lines.push(line);
  }
  return parts.map(({ file, lines }) => ({
    file,
    text: lines.join("\n"),
    changed: lines.filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l)).length,
  }));
}

/**
 * Whole files packed into batches of at most `limit` characters, at most
 * `maxBatches` of them, and the coverage that leaves.
 */
export function batchDiff(diff, { limit, maxBatches }) {
  const batches = [];
  const unreviewed = [];
  for (const part of splitByFile(diff)) {
    const last = batches.at(-1);
    if (part.text.length > limit) unreviewed.push(part);
    else if (last && last.text.length + 1 + part.text.length <= limit) last.add(part);
    else if (batches.length < maxBatches) batches.push(newBatch(part));
    else unreviewed.push(part);
  }
  const reviewed = batches.flatMap((b) => b.parts);
  const sum = (ps) => ps.reduce((n, p) => n + p.changed, 0);
  return {
    batches: batches.map((b) => ({ files: b.parts.map((p) => p.file), text: b.text })),
    coverage: {
      files: { reviewed: reviewed.length, total: reviewed.length + unreviewed.length },
      lines: { reviewed: sum(reviewed), total: sum(reviewed) + sum(unreviewed) },
      truncated: unreviewed.length > 0,
      unreviewed: unreviewed.map((p) => p.file),
    },
  };
}

function newBatch(first) {
  const batch = {
    parts: [first],
    text: first.text,
    add(part) {
      batch.parts.push(part);
      batch.text = `${batch.text}\n${part.text}`;
    },
  };
  return batch;
}
