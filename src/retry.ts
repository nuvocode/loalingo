// Pure retry loop (tested by src/retry.test.ts).

/** Runs `fn` up to `tries` times, retrying only errors `again` accepts; the last error is thrown. */
export async function retry<T>(fn: () => Promise<T>, again: (e: unknown) => boolean, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= tries || !again(e)) throw e; }
  }
}
