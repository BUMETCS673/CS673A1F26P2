const fs = require("node:fs"),
  assert = require("node:assert/strict");

const WebSocket = require("next/dist/compiled/ws");

const root =
  process.env.MBTA_QA_OUTPUT ||
  require("node:path").join(process.cwd(), ".next", "manual-qa");

fs.mkdirSync(root, { recursive: true });

(async () => {
  const source = JSON.parse(
    fs.readFileSync(
      require("node:path").join(__dirname, "../app/data/subway-network.json"),
    ),
  );

  const patterns = source.patterns
    .filter((p) => p.route === "Green-B")
    .map((p) => ({
      direction: p.direction,
      destination: source.stations[p.stops.at(-1)].name,
      stops: p.stops.map((id) => ({ ...source.stations[id], platforms: [] })),
    }));

  const network = { patterns, stops: patterns[0].stops };
  const pages = await (await fetch("http://127.0.0.1:9333/json")).json();
  const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);

  await new Promise((r) => ws.once("open", r));

  let id = 0;

  const pending = new Map(),
    errors = [];

  ws.on("message", (raw) => {
    const m = JSON.parse(raw);

    if (m.id) {
      const p = pending.get(m.id);

      pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }

    if (m.method === "Runtime.exceptionThrown")
      errors.push(m.params.exceptionDetails.text);
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;

      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);

    return r.result.value;
  };

  const wait = async (expression) => {
    for (let i = 0; i < 120; i++) {
      if (await ev(expression)) return;

      await new Promise((r) => setTimeout(r, 150));
    }

    throw new Error("Timed out " + expression);
  };

  const pause = () => new Promise((r) => setTimeout(r, 650));

  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });

    fs.writeFileSync(root + "/" + name, Buffer.from(r.data, "base64"));
  };

  const select = async (index, value) =>
    ev(
      `(()=>{const s=document.querySelectorAll("select")[${index}];s.value=${JSON.stringify(value)};s.dispatchEvent(new Event("change",{bubbles:true}));})()`,
    );

  const click = async (text) =>
    ev(
      `Array.from(document.querySelectorAll("button")).find(b=>b.textContent===${JSON.stringify(text)}).click()`,
    );

  const view = () => ev('document.querySelector("svg").getAttribute("viewBox")');

  let count = 0,
    mode = "ok";
  const results = [];
  const fixtures = {
    ...network,
    patterns: network.patterns.map((p) => ({
      ...p,
      stops: p.stops.map((s) => ({
        ...s,
        platforms:
          s.id === "place-gover"
            ? [p.direction === 0 ? "70202" : "70201"]
            : s.id === "place-lake"
              ? [p.direction === 0 ? "70107" : "70106"]
              : [],
      })),
    })),
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.__now=Date.now();Date.now=()=>window.__now;",
  });
  ws.on("message", async (raw) => {
    const m = JSON.parse(raw);
    if (m.method !== "Fetch.requestPaused") return;
    count++;
    const now = await ev("Date.now()");
    const record = (id, stop, direction, sequence, seconds, departure) => ({
      id,
      attributes: {
        direction_id: direction,
        stop_sequence: sequence,
        arrival_time: departure ? null : new Date(now + seconds * 1000).toISOString(),
        departure_time: departure ? new Date(now + seconds * 1000).toISOString() : null,
      },
      relationships: {
        route: { data: { id: "Green-B" } },
        stop: { data: { id: stop } },
        trip: { data: { id: "trip-" + direction } },
      },
    });
    const predictions = {
      data: [
        record("out-origin", "70202", 0, 1, 75, true),
        record("out-target", "70107", 0, 23, 1800, false),
        record("in-origin", "70106", 1, 1, 75, true),
        record("in-target", "70201", 1, 23, 1800, false),
      ],
    };
    const body =
      mode === "transport"
        ? { error: { message: "Unable to reach MBTA API.", retryAt: now + 60000 } }
        : {
            network: fixtures,
            predictions:
              mode === "429" ? null : mode === "vehicle" ? { data: [] } : predictions,
            vehicles: {
              data:
                mode === "vehicle"
                  ? [
                      {
                        id: "observed",
                        attributes: {
                          direction_id: 1,
                          current_status: "STOPPED_AT",
                          updated_at: new Date(now - 30000).toISOString(),
                        },
                        relationships: {
                          route: { data: { id: "Green-B" } },
                          stop: { data: { id: "70106" } },
                          trip: { data: { id: "observed-trip" } },
                        },
                      },
                    ]
                  : [],
              included: [
                {
                  type: "trip",
                  id: "observed-trip",
                  attributes: { direction_id: 1, headsign: "Government Center" },
                },
              ],
            },
            vehiclesCheckedAt: now,
            vehiclesError: null,
            alerts: { data: [] },
            predictionsCheckedAt: mode === "429" ? null : now,
            alertsCheckedAt: now,
            predictionsError:
              mode === "429"
                ? "MBTA API rate limit exceeded. Requests are paused before retrying."
                : null,
            alertsError: null,
            retryAt: mode === "429" ? now + 120000 : null,
            reused: false,
          };
    await new Promise((r) => setTimeout(r, 100));
    await send("Fetch.fulfillRequest", {
      requestId: m.params.requestId,
      responseCode: mode === "transport" ? 502 : 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    });
  });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/*" }] });
  const text = () => ev('document.querySelector("aside").innerText');
  const refresh = () =>
    ev(
      '[...document.querySelectorAll("button")].find(b=>b.textContent.startsWith("Refresh")).click()',
    );
  const swap = () =>
    ev(
      '[...document.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")==="Swap starting stop and destination").click()',
    );
  const advance = async (seconds) => {
    await ev("window.__now+=" + seconds * 1000);
    await new Promise((r) => setTimeout(r, 1150));
  };
  for (const width of [1440, 390]) {
    mode = "ok";
    count = 0;
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: width === 1440 ? 1000 : 844,
      deviceScaleFactor: 1,
      mobile: width === 390,
    });
    await send("Page.navigate", {
      url: process.env.MBTA_QA_URL || "http://127.0.0.1:3187",
    });
    await wait('document.querySelectorAll("select").length===2');
    await select(0, "place-gover");
    await select(1, "place-lake");
    await pause();
    assert.equal(count, 1);
    assert.ok((await text()).includes("Arrive at destination"));
    const checked = (await text()).match(/Checked[^\n]+/)[0];
    for (let i = 0; i < 6; i++) {
      await swap();
      await pause();
      assert.ok((await text()).includes("Arrive at destination"));
    }
    assert.equal(count, 1);
    for (let i = 0; i < 8; i++) await refresh();
    assert.equal(count, 1);
    assert.ok((await text()).includes("Already up to date."));
    await advance(61);
    let state = await text();
    assert.ok(state.includes("1\nmin") || state.includes("1 min"));
    assert.ok(state.includes(checked));
    assert.equal(count, 1);
    await ev(
      'window.dispatchEvent(new Event("focus"));document.dispatchEvent(new Event("visibilitychange"))',
    );
    assert.equal(count, 1);
    await advance(20);
    assert.ok(!(await text()).includes("Arrive at destination"));
    assert.ok((await text()).includes("saved MBTA data"));
    assert.equal(count, 1);
    await advance(10);
    assert.ok((await text()).includes("Predictions are out of date"));
    assert.equal(count, 1);
    await shot("manual-stale-" + width + ".png");
    await Promise.all(Array.from({ length: 8 }, refresh));
    await pause();
    assert.equal(count, 2);
    assert.ok((await text()).includes("MBTA data updated."));
    await shot("manual-fresh-" + width + ".png");
    await advance(31);
    mode = "429";
    await refresh();
    await pause();
    assert.equal(count, 3);
    state = await text();
    assert.ok(state.includes("rate limit exceeded"));
    assert.ok(!state.includes("No timed departure predictions"));
    assert.ok(state.includes("Refresh available after"));
    for (let i = 0; i < 6; i++) {
      await swap();
      await refresh();
    }
    await pause();
    assert.equal(count, 3);
    await shot("manual-rate-limit-" + width + ".png");
    await advance(121);
    assert.equal(count, 3);
    mode = "ok";
    await refresh();
    await pause();
    assert.equal(count, 4);
    assert.ok((await text()).includes("Arrive at destination"));
    await advance(31);
    mode = "transport";
    await refresh();
    await pause();
    assert.equal(count, 5);
    assert.ok((await text()).includes("Unable to reach MBTA API."));
    assert.ok(!(await text()).includes("No timed departure predictions"));
    await refresh();
    assert.equal(count, 5);
    await advance(61);
    mode = "vehicle";
    await refresh();
    await pause();
    await select(0, "place-lake");
    await select(1, "place-gover");
    await pause();
    assert.equal(count, 6);
    state = await text();
    assert.ok(state.includes("Vehicle reported at Boston College"));
    assert.ok(state.includes("Headsign: Government Center. Last reported"));
    assert.ok(state.includes("No departure time supplied. Boarding is not confirmed."));
    assert.ok(!state.includes("Arrive at destination"));
    await shot("vehicle-observation-" + width + ".png");
    await swap();
    await pause();
    assert.ok(!(await text()).includes("Vehicle reported at Boston College"));
    await swap();
    await pause();
    assert.ok((await text()).includes("Vehicle reported at Boston College"));
    for (let i = 0; i < 5; i++) await refresh();
    assert.equal(count, 6);
    await advance(61);
    assert.ok(!(await text()).includes("Vehicle reported at Boston College"));
    assert.equal(count, 6);
    results.push({
      vehiclePresenceWithoutEta: true,
      observationExpiresLocally: true,
      width,
      initial: 1,
      afterSixSwaps: 1,
      afterEightCooldownRefreshes: 1,
      after91Seconds: 1,
      afterExplicitRefresh: 2,
      after429AndRepeatedSwapsRefreshes: 3,
      afterBackoffElapsed: 3,
      afterExplicitRecovery: 4,
      afterTransportFailure: 5,
    });
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    root + "/manual-refresh-results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(JSON.stringify({ results, errors }, null, 2));
  await send("Fetch.disable");
  await send("Page.navigate", { url: "about:blank" });
  ws.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
