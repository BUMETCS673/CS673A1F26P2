import test from "node:test";
import assert from "node:assert/strict";
import { createSharedMbtaCache } from "../server/shared-mbta-cache.mjs";

function fixture() {
  let time = 1000000;
  const counts = { network: 0, predictions: 0, alerts: 0, vehicles: 0 };
  const loaders = Object.fromEntries(
    Object.keys(counts).map((key) => [
      key,
      async () => {
        counts[key]++;
        return { data: [] };
      },
    ]),
  );
  return {
    counts,
    loaders,
    now: () => time,
    advance: (ms) => {
      time += ms;
    },
  };
}

test("cold load, swaps, concurrent refreshes and cooldown boundaries have bounded fanout", async () => {
  const f = fixture(),
    cache = createSharedMbtaCache(f.loaders, f.now);
  const load = () =>
    Promise.all([
      cache.read("network"),
      cache.read("predictions"),
      cache.read("alerts"),
      cache.read("vehicles"),
    ]);
  const [initial] = await Promise.all(Array.from({ length: 20 }, load));
  assert.deepEqual(f.counts, { network: 1, predictions: 1, alerts: 1, vehicles: 1 });
  f.advance(29999);
  const again = await load();
  assert.equal(again[1].fetchedAt, initial[1].fetchedAt);
  assert.equal(again[1].reused, true);
  f.advance(1);
  await Promise.all(Array.from({ length: 20 }, load));
  assert.deepEqual(f.counts, { network: 1, predictions: 2, alerts: 1, vehicles: 2 });
  f.advance(30000);
  await Promise.all(Array.from({ length: 20 }, load));
  assert.deepEqual(f.counts, { network: 1, predictions: 3, alerts: 2, vehicles: 3 });
});

for (const retryAfter of [
  "120",
  new Date(1000000 + 120000).toUTCString(),
  null,
  "invalid",
]) {
  test("429 backoff is shared and honors Retry-After: " + retryAfter, async () => {
    const f = fixture();
    f.loaders.predictions = async () => {
      f.counts.predictions++;
      throw Object.assign(new Error("limit"), { status: 429, retryAfter });
    };
    const cache = createSharedMbtaCache(f.loaders, f.now);
    const delay = retryAfter && retryAfter !== "invalid" ? 120000 : 60000;
    await assert.rejects(
      cache.read("predictions"),
      (e) => e.status === 429 && e.retryAt === f.now() + delay,
    );
    await Promise.all(
      Array.from({ length: 30 }, () => assert.rejects(cache.read("predictions"))),
    );
    await assert.rejects(cache.read("alerts"));
    await assert.rejects(cache.read("vehicles"));
    assert.deepEqual(f.counts, { network: 0, predictions: 1, alerts: 0, vehicles: 0 });
    f.advance(delay - 1);
    await assert.rejects(cache.read("predictions"));
    assert.equal(f.counts.predictions, 1);
    f.advance(1);
    await assert.rejects(cache.read("predictions"));
    assert.equal(f.counts.predictions, 2);
  });
}

test("expired successful data is not renewed or returned after failure; recovery is possible", async () => {
  const f = fixture(),
    cache = createSharedMbtaCache(f.loaders, f.now);
  const original = await cache.read("predictions");
  f.advance(30000);
  f.loaders.predictions = async () => {
    f.counts.predictions++;
    throw Object.assign(new Error("timeout"), { status: 504 });
  };
  await assert.rejects(cache.read("predictions"));
  await assert.rejects(cache.read("predictions"));
  assert.equal(f.counts.predictions, 2);
  f.advance(30000);
  f.loaders.predictions = async () => {
    f.counts.predictions++;
    return { data: [] };
  };
  const recovered = await cache.read("predictions");
  assert.ok(recovered.fetchedAt > original.fetchedAt);
  assert.equal(f.counts.predictions, 3);
});

test("different resources keep independent freshness during an outage", async () => {
  const f = fixture(),
    cache = createSharedMbtaCache(f.loaders, f.now);
  const alerts = await cache.read("alerts");
  f.loaders.predictions = async () => {
    throw Object.assign(new Error("limit"), { status: 429 });
  };
  await assert.rejects(cache.read("predictions"));
  assert.equal((await cache.read("alerts")).fetchedAt, alerts.fetchedAt);
  f.advance(60000);
  assert.equal((await cache.read("alerts")).fetchedAt, f.now());
});

test("server wrapper preserves Retry-After on 429 without changing other callers", async (t) => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../server/mbta-api.js", import.meta.url),
    "utf8",
  );
  const { getPredictions } = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ errors: [] }), {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
  );
  await assert.rejects(
    getPredictions({ route: "Green-B" }, { fresh: true }),
    (error) => error.status === 429 && error.retryAfter === "120",
  );
});
