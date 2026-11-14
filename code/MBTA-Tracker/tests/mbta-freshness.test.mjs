/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Test fresh journey requests while preserving the existing API wrapper cache defaults.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Next loads this server-only .js file as ESM. A data import lets the Node
// harness exercise that same source without changing the team's package type.
const source = await readFile(
  new URL("../server/mbta-api.js", import.meta.url),
  "utf8",
);

const { getPredictions, getAlerts, getSchedules, getVehicles } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

test("API wrappers accept every rapid-transit route and still reject unrelated or invalid routes", async (t) => {
  const routes = ["Red", "Orange", "Blue", "Mattapan", "Green-B", "Green-C", "Green-D", "Green-E", "741", "742", "743", "751", "749", "746"];
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(new URL(url));
    return new Response(JSON.stringify({ data: [] }));
  });
  for (const read of [getPredictions, getAlerts, getSchedules, getVehicles]) {
    await read({ route: routes, include: "trip,stop" });
    assert.equal(urls.at(-1).searchParams.get("filter[route]"), routes.join(","));
    await assert.rejects(read({ route: "CR-Fitchburg" }), (error) => error.status === 400);
    await assert.rejects(read({ route: "invalid" }), (error) => error.status === 400);
  }
});

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
