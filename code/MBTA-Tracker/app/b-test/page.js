"use client";

import { useEffect, useState } from "react";
import { findJourney, journeyAlerts, upcomingTrains } from "@/lib/b-journey.mjs";
import styles from "./page.module.css";

function useData(url, interval = 30000) {
  const [state, setState] = useState({ url: null, data: null, error: "", checked: null });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let disposed = false;
    let timer;
    async function load() {
      let delay = interval;
      try {
        if (document.hidden) return;
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Unable to load data.");
        if (!disposed) setState({ url, data, checked: Date.now(), error: "" });
      } catch (error) {
        delay = Math.max(interval, 60000);
        if (!disposed) setState({ url, data: null, checked: null, error: error.message });
      } finally { if (!disposed && interval) timer = setTimeout(load, delay); }
    }
    load();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [url, interval, retry]);
  return { ...(state.url === url ? state : { data: null, error: "", checked: null }), refresh: () => setRetry((value) => value + 1) };
}

function Results({ journey, origin }) {
  const params = new URLSearchParams({ route: "Green-B", stop: origin, direction_id: String(journey.direction), include: "trip" });
  const predictions = useData(`/api/predictions?${params}`);
  const alerts = useData("/api/alerts?route=Green-B&datetime=NOW", 60000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const trains = predictions.data ? upcomingTrains(predictions.data, journey.direction, now) : [];
  const relevant = alerts.data ? journeyAlerts(alerts.data, journey) : [];
  const stale = predictions.checked && now - predictions.checked > 90000;
  return <>
    <section className={styles.card}><h2>Your journey</h2><p>{journey.stops[0].name} → {journey.stops.at(-1).name}</p><p className={styles.muted}>Direction: toward {journey.destination} · {journey.stops.length - 1} stop intervals</p><p className={styles.path}>{journey.stops.map((stop) => stop.name).join(" → ")}</p><p className={styles.muted}>This is the normal B-branch path. Check alerts for closures, shuttles or changed service.</p></section>
    <section className={styles.card} aria-live="polite"><div className={styles.heading}><h2>Upcoming 3 trains</h2><button onClick={predictions.refresh}>Refresh</button></div>
      {predictions.error ? <p role="alert" className={styles.error}>{predictions.error}</p> : !predictions.data ? <p>Loading predictions…</p> : <>
        <p className={styles.muted}>{stale ? "Stale — last checked " : "Last checked "}{new Date(predictions.checked).toLocaleTimeString()} · Refreshes every 30 seconds while visible.</p>
        {["Next train", "Following train", "Later train"].map((label, index) => { const train = stale ? null : trains[index]; return <div className={styles.train} key={label}><span>{label}<small>{train?.destination}</small></span><strong>{train ? train.time ? `${Math.max(0, Math.ceil((Date.parse(train.time) - now) / 60000))} min` : train.status : stale ? "Refresh needed" : "No prediction"}</strong></div>; })}
        <p className={styles.muted}>Predictions at your origin in the journey direction. Check each train’s destination; short-turn trains may not reach your chosen destination.</p>
      </>}
    </section>
    <section className={styles.card}><div className={styles.heading}><h2>Alerts on your way</h2><button onClick={alerts.refresh}>Refresh</button></div>
      {alerts.error ? <p role="alert" className={styles.error}>{alerts.error}</p> : !alerts.data ? <p>Loading alerts…</p> : <>
        <p className={styles.muted}>Includes alerts affecting selected stations/platforms and branch-wide alerts. Last checked {new Date(alerts.checked).toLocaleTimeString()}.</p>
        {relevant.length === 0 ? <p>No matching active alerts returned for this journey.</p> : relevant.map((alert) => <details key={alert.id}><summary>{alert.attributes.header || alert.attributes.effect}</summary><p>{alert.attributes.description || "No additional details provided."}</p></details>)}
      </>}
    </section>
  </>;
}

export default function BTestPage() {
  const network = useData("/api/b-stops", 3600000);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const journey = network.data ? findJourney(network.data.patterns, origin, destination) : null;
  return <main className={styles.page}><header><span className={styles.badge}>GREEN LINE B · API TEST</span><h1>B-branch journey check</h1><p>Select your current station and destination to view predictions and relevant alerts.</p></header>
    <section className={styles.card}>
      {network.error ? <p role="alert" className={styles.error}>{network.error} <button onClick={network.refresh}>Retry stations</button></p> : !network.data ? <p>Loading B-branch stations…</p> : <div className={styles.fields}>
        <label>Current location<select value={origin} onChange={(event) => setOrigin(event.target.value)}><option value="">Choose current station</option>{network.data.stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}</select></label>
        <label>Destination location<select value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">Choose destination station</option>{network.data.stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}</select></label>
      </div>}
      {origin && destination && !journey && <p className={styles.error}>{origin === destination ? "Choose different origin and destination stations." : "No normal direct B-branch path was found."}</p>}
    </section>
    {journey ? <Results key={`${origin}-${destination}`} journey={journey} origin={origin} /> : <p className={styles.muted}>Choose two B-branch stations to begin.</p>}
    <footer>MBTA V3 data · Test page · Not an official MBTA app</footer>
  </main>;
}
