/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Check rendered station-label placement across viewport and journey scenarios.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

const fs = require("node:fs"),
  assert = require("node:assert/strict");

const WebSocket = require("next/dist/compiled/ws");

const root =
  process.env.MBTA_QA_OUTPUT ||
  require("node:path").join(process.cwd(), ".next", "label-qa");

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

  ws.on("message", async (raw) => {
    const m = JSON.parse(raw);

    if (m.method !== "Fetch.requestPaused") return;

    const body = {
      network,
      predictions: { data: [] },
      alerts: { data: [] },
      predictionsCheckedAt: Date.now(),
      alertsCheckedAt: Date.now(),
      predictionsError: null,
      alertsError: null,
    };

    await send("Fetch.fulfillRequest", {
      requestId: m.params.requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    }).catch((error) => {
      if (!error.message.includes("Invalid InterceptionId")) throw error;
    });
  });
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "*/api/b-snapshot*" }],
  });

  await send("Page.enable");
  await send("Runtime.enable");

  const checks = [];

  async function check(name) {
    await pause();

    const result = await ev(`(()=>{
    const svg=document.querySelector("svg").getBoundingClientRect();
    const labels=[...document.querySelectorAll("[data-map-label]")].map(e=>({id:e.dataset.mapLabel,text:e.textContent,transform:e.getAttribute("transform"),r:e.getBoundingClientRect()}));
    const overlap=[];
    for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i].r,b=labels[j].r;if(a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top)overlap.push([labels[i].text,labels[j].text]);}
    const clipped=labels.filter(e=>e.r.left<svg.left-1||e.r.right>svg.right+1||e.r.top<svg.top-1||e.r.bottom>svg.bottom+1).map(e=>e.text);
    return {labels:labels.map(e=>({id:e.id,text:e.text,transform:e.transform})),overlap,clipped,width:innerWidth,bodyWidth:document.body.scrollWidth};
  })()`);

    assert.deepEqual(result.overlap, [], name + " collisions");
    assert.deepEqual(result.clipped, [], name + " clipping");
    assert.ok(
      result.labels.every((l) => !l.transform),
      name + " rotations",
    );
    assert.equal(result.width, result.bodyWidth, name + " page overflow");

    for (const label of result.labels)
      assert.ok(
        label.text.endsWith(
          network.stops.find((s) => s.id === label.id)?.name || label.text,
        ),
        name + " full names",
      );

    if (name.includes("bu-fit"))
      for (const id of ["place-bucen", "place-bland"])
        assert.ok(
          result.labels.some((l) => l.id === id),
          name + " regression station " + id,
        );

    checks.push({
      name,
      count: result.labels.length,
      overlaps: result.overlap.length,
      clipped: result.clipped.length,
      labels: result.labels,
    });
    await ev(
      'document.querySelectorAll("nextjs-portal").forEach(e=>e.style.display="none")',
    );
    await shot("labels-" + name + ".png");
  }

  for (const width of [1440, 390]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: width === 1440 ? 1000 : 844,
      deviceScaleFactor: 1,
      mobile: width === 390,
    });
    await send("Page.navigate", {
      url: process.env.MBTA_QA_URL || "http://127.0.0.1:3187",
    });
    await wait('document.querySelectorAll("svg g[role=button]").length===23');
    await check(width + "-overview");

    for (const [name, origin, destination] of [
      ["bu", "place-bucen", "place-gover"],
      ["short", "place-bucen", "place-buest"],
      ["long", "place-lake", "place-gover"],
    ]) {
      await select(0, origin);
      await select(1, destination);
      await wait('!!document.querySelector("[data-testid=selected-journey]")');
      await pause();
      await check(width + "-" + name + "-fit");
      await ev(
        '[...document.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")==="Zoom in map").click()',
      );
      await check(width + "-" + name + "-zoom-in");
      await click("Fit journey");
      await pause();
      await ev(
        '[...document.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")==="Zoom out map").click()',
      );
      await check(width + "-" + name + "-zoom-out");
    }
  }

  assert.deepEqual(errors, []);
  fs.writeFileSync(
    root + "/label-regression-results.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        checks: checks.map((c) => ({
          name: c.name,
          count: c.count,
          overlaps: c.overlaps,
          clipped: c.clipped,
        })),
        errors,
      },
      null,
      2,
    ),
  );
  await send("Fetch.disable");
  await send("Page.navigate", { url: "about:blank" });
  ws.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
