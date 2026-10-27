/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Share live-data and timetable requests with separate freshness limits and rate-limit backoff.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

// Five process-local entries: topology, predictions, alerts, vehicles, schedules.
// Expired data is never silently returned after an upstream failure.
export function createSharedMbtaCache(loaders, now = Date.now) {
  const ttl = { network: 3600000, predictions: 30000, alerts: 60000, vehicles: 30000, schedules: 300000 };
  const entries = new Map(Object.keys(ttl).map((key) => [key, { failures: 0 }]));
  let rateLimitUntil = 0;

  function failure(message, status, retryAt) {
    return Object.assign(new Error(message), { status, retryAt });
  }

  async function read(key) {
    const entry = entries.get(key);
    if (!entry) throw new Error("Unknown MBTA snapshot");
    const time = now();
    if (entry.snapshot && time - entry.snapshot.fetchedAt < ttl[key])
      return { ...entry.snapshot, reused: true };
    if (entry.pending) return entry.pending;
    if (time < rateLimitUntil)
      throw failure(
        "MBTA API rate limit exceeded. Requests are paused before retrying.",
        429,
        rateLimitUntil,
      );
    if (time < (entry.retryAt ?? 0)) throw entry.error;

    entry.pending = Promise.resolve()
      .then(loaders[key])
      .then((data) => {
        entry.snapshot = { data, fetchedAt: now() };
        entry.failures = 0;
        entry.retryAt = 0;
        entry.error = null;
        return entry.snapshot;
      })
      .catch((error) => {
        entry.failures += 1;
        const time = now();
        const backoff = Math.min(300000, 30000 * 2 ** Math.min(entry.failures - 1, 4));
        let delay = backoff;
        if (error.status === 429) {
          const header = error.retryAfter;
          const seconds =
            typeof header === "string" && /^\s*\d+(\.\d+)?\s*$/.test(header)
              ? Number(header)
              : NaN;
          const date = typeof header === "string" ? Date.parse(header) : NaN;
          delay = Math.max(
            60000,
            backoff,
            Number.isFinite(seconds)
              ? seconds * 1000
              : Number.isFinite(date)
                ? date - time
                : 0,
          );
          rateLimitUntil = Math.max(rateLimitUntil, time + delay);
        }
        entry.retryAt = time + delay;
        entry.error = failure(
          error.status === 429
            ? "MBTA API rate limit exceeded. Requests are paused before retrying."
            : "Unable to load fresh MBTA data. Requests are paused before retrying.",
          error.status ?? 502,
          entry.retryAt,
        );
        throw entry.error;
      })
      .finally(() => {
        entry.pending = null;
      });
    return entry.pending;
  }

  return { read };
}
