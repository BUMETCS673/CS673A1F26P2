import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Next loads this server-only .js file as ESM. A data import lets the Node
// harness exercise that same source without changing the team's package type.
const source = await readFile(
  new URL("../server/mbta-api.js", import.meta.url),
  "utf8",
);

const { getPredictions, getAlerts } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

for (const [name, read, cacheSeconds] of [
  ["predictions", getPredictions, 15],
  ["alerts", getAlerts, 60],
]) {
  test(`${name}: fresh journey requests bypass the Next data cache`, async (t) => {
    let requestOptions;
    let requestUrl;

    t.mock.method(globalThis, "fetch", async (url, options) => {
      requestUrl = new URL(url);
      requestOptions = options;

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    await read({ route: "Green-B" }, { fresh: true });
    assert.equal(requestOptions.cache, "no-store");
    assert.equal(requestOptions.next, undefined);
    assert.equal(requestUrl.searchParams.get("filter[route]"), "Green-B");

    if (name === "alerts")
      assert.equal(requestUrl.searchParams.get("filter[datetime]"), "NOW");
  });

  test(`${name}: existing callers retain their original cache behavior`, async (t) => {
    let requestOptions;

    t.mock.method(globalThis, "fetch", async (_url, options) => {
      requestOptions = options;

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    await read({ route: "Green-B" });
    assert.equal(requestOptions.cache, undefined);
    assert.deepEqual(requestOptions.next, { revalidate: cacheSeconds });
  });

  test(`${name}: fresh-read upstream failures surface to the journey endpoint`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
      throw new TypeError("Synthetic upstream network failure");
    });
    await assert.rejects(
      read({ route: "Green-B" }, { fresh: true }),
      (error) => error.status === 502 && error.message === "Unable to reach MBTA API.",
    );
  });
}
