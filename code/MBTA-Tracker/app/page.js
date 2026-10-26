/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Keep Green B journeys updated automatically, with labeled schedules and bounded approximate countdowns during outages.
 * AI Contribution: (~90%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { journeyTrains, journeyVehicles, offlineJourneyTrains, estimateMinutes } from "@/lib/b-trains.mjs";
import { scheduledFallback } from "@/lib/b-schedules.mjs";
import { journeyAlerts } from "@/lib/b-journey.mjs";
import { createSnapshotClient } from "./components/b-snapshot-client.mjs";
import { findJourney } from "@/lib/b-journey.mjs";
import SubwayMap from "./components/SubwayMap";
import styles from "./page.module.css";

function useSnapshot() {
  const [client] = useState(() =>
    createSnapshotClient(async () => {
      const response = await fetch("/api/b-snapshot", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw Object.assign(
          new Error(data.error?.message || "Unable to load MBTA data."),
          { retryAt: data.error?.retryAt },
        );
      return data;
    }),
  );
  const [state, setState] = useState(client.getState);
  useEffect(() => {
    const unsubscribe = client.subscribe(setState);
    const stop = client.startAutoRefresh({
      isVisible: () => !document.hidden,
      subscribeVisibility: (listener) => {
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
    });
    return () => { stop(); unsubscribe(); };
  }, [client]);
  return { ...state, refresh: () => client.load(true) };
}

const clockTime = (time) =>
  new Date(time).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });

const minutesUntil = (time, now) =>
  Math.max(0, Math.ceil((Date.parse(time) - now) / 60000));

function JourneyResults({ journey, snapshot }) {
  const result = {
    ...snapshot,
    data: snapshot.data
      ? {
          ...snapshot.data,
          alerts: journeyAlerts(snapshot.data.alerts ?? { data: [] }, journey),
        }
      : null,
  };
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);

  const predictionsChecked =
    result.data?.predictionsCheckedAt ?? result.data?.checkedAt ?? result.checked;
  const alertsChecked =
    result.data?.alertsCheckedAt ?? result.data?.checkedAt ?? result.checked;
  const stale = predictionsChecked && now - predictionsChecked > 90000;
  const alertsStale = alertsChecked && now - alertsChecked > 90000;
  const retryAt = Math.max(result.retryAt ?? 0, result.data?.retryAt ?? 0);
  const retrying = retryAt > now;
  const predictionsOld = Boolean(stale || result.error || result.data?.predictionsError);

  const predictions = snapshot.data?.predictions ?? { data: [] };
  const trains = predictionsOld
    ? offlineJourneyTrains(predictions, journey, predictionsChecked, now)
    : journeyTrains(predictions, journey, now);

  const alerts = result.data?.alerts ?? [];
  const scheduled = scheduledFallback(snapshot.data, journey, trains, now, true);
  const departures = trains.length ? trains : scheduled;
  const isScheduled = trains.length === 0 && scheduled.length > 0;
  const schedulesStale = now - (result.data?.schedulesCheckedAt ?? 0) > 300000;
  const cardsOld = isScheduled
    ? Boolean(schedulesStale || result.error || result.data?.schedulesError)
    : predictionsOld;
  const vehicles = journeyVehicles(snapshot.data?.vehicles ?? { data: [] }, journey, now, true);
  const vehicleDataOld = result.error || result.data?.vehiclesError || now - (result.data?.vehiclesCheckedAt ?? 0) > 90000;

  return (
    <>
      <div className={styles.journeySummary}>
        <span className={styles.directionArrow}>↗</span>
        <div>
          <strong>Toward {journey.destination}</strong>
          <p>{journey.stops.length - 1} stops to your destination · Direct</p>
        </div>
      </div>
      <section className={styles.results} aria-labelledby="arrivals-heading">
        <div className={styles.sectionHeading}>
          <h2 id="arrivals-heading">Next departures</h2>
          <button
            className={styles.textButton}
            onClick={result.refresh}
            disabled={result.busy}
          >
            Refresh ↻
          </button>
        </div>
        <p className={styles.small}>From {journey.stops[0].name}</p>
        <p className={styles.small}>{result.busy ? "Updating MBTA data…" : retrying
          ? `Updates paused until ${clockTime(retryAt)} ET; retrying automatically while this tab is visible.`
          : "Updates automatically every 30 seconds while this tab is visible."}</p>
        {result.notice && (
          <p role="status" className={styles.small}>
            {result.notice}
          </p>
        )}
        <div aria-live="polite">
          {(result.error || result.data?.predictionsError || stale) && (
            <p role="alert" className={styles.notice}>
              {result.error || result.data?.predictionsError || "Live predictions are out of date."}{" "}
              {predictionsChecked ? `Last successful prediction check: ${clockTime(predictionsChecked)} ET. Saved times are not current live estimates.` : "Live predictions are unavailable."}
            </p>
          )}
          {!result.data ? (
            <p className={styles.empty}>Checking MBTA predictions.</p>
          ) : departures.length === 0 ? (
            <div className={styles.empty}>
              <strong>No timed departure predictions in saved data</strong>
              <p>
                This B-branch route exists, but the saved MBTA data has no timed
                departures from {journey.stops[0].name} in this direction. Refresh to
                check again; this does not confirm that service has stopped.
              </p>
              <p>
                {result.data.schedulesError
                  ? "Scheduled departures could not be loaded. Use Refresh to try again."
                  : !result.data.schedules || schedulesStale
                    ? "Refresh to check scheduled departures."
                    : "No matching scheduled departures in the saved two-hour window. This does not confirm that service has stopped."}
              </p>
              <a
                href="https://www.mbta.com/schedules/Green-B/line"
                target="_blank"
                rel="noreferrer"
              >
                Check the MBTA schedule ↗
              </a>
            </div>
          ) : (
            <>
            {isScheduled && <p className={styles.small}>{predictionsOld ? "Live departure predictions could not be updated." : "No live departure predictions for this journey."} Times below are scheduled, not live. Check service alerts before travelling.</p>}
            {isScheduled && (result.data.schedulesError || schedulesStale) && <p role="alert" className={styles.notice}>Timetable could not be updated. Showing the last saved schedule checked {clockTime(result.data.schedulesCheckedAt)} ET.</p>}
            {departures.map((train, index) => (
              <article className={styles.trainCard} key={train.id}>
                <div className={styles.trainTop}>
                  <span className={styles.trainLabel}>
                    {isScheduled ? "SCHEDULED TRAIN" : index === 0 ? "NEXT TRAIN" : "FOLLOWING TRAIN"}
                  </span>
                  <span className={styles.liveLabel}>{isScheduled ? "Scheduled · MBTA timetable" : cardsOld ? "Stale · approximate estimate" : "MBTA prediction"}</span>
                </div>
                <div className={styles.trainDeparture}>
                  <strong>
                    {cardsOld && !isScheduled ? `~${estimateMinutes(train.departure, now)}` : minutesUntil(train.departure, now)}
                    <small> min</small>
                  </strong>
                  <span>
                    Toward {train.headsign}
                    <small>{isScheduled ? "Scheduled departure" : cardsOld ? "Last predicted departure" : "Departs"} {clockTime(train.departure)} ET</small>
                  </span>
                </div>
                {cardsOld && !isScheduled && <p className={styles.small}>Based on last update at {clockTime(predictionsChecked)} ET; live updates unavailable. {Date.parse(train.departure) <= now ? "Estimate passed — awaiting update; departure is not confirmed." : "Approximate remaining time, not current tracking."}</p>}
                {train.originArrival && !cardsOld && (
                  <p className={styles.small}>
                    At your stop:{" "}
                    {Date.parse(train.originArrival) <= now
                      ? "arriving / boarding"
                      : `~${minutesUntil(train.originArrival, now)} min`}
                    {train.status ? ` · ${train.status}` : ""}
                  </p>
                )}
                <div className={styles.destinationEstimate}>
                  {train.destinationStatus === "predicted" || isScheduled ? (
                    <>
                      <span>{isScheduled ? "Scheduled arrival" : cardsOld ? "Last predicted arrival" : "Arrive at destination"}</span>
                      <strong>~{clockTime(train.destinationArrival)} ET</strong>
                      <small>{isScheduled ? "Scheduled ride" : "Same train"} · ~{train.rideMinutes} min on board</small>
                    </>
                  ) : (
                    <>
                      <strong>
                        {train.destinationStatus === "not-served"
                          ? "Destination stop not served"
                          : "Destination prediction unavailable"}
                      </strong>
                      <small>
                        {train.destinationStatus === "not-served"
                          ? "MBTA marks this train's destination stop as skipped or canceled. Check alerts before boarding."
                          : "Check the train's headsign and alerts. A departure prediction alone does not confirm this train reaches your destination."}
                      </small>
                    </>
                  )}
                </div>
              </article>
            ))}
            {isScheduled && <p className={styles.timestamp}>Timetable checked {clockTime(result.data.schedulesCheckedAt)} ET. Scheduled times do not confirm actual train movement.</p>}
            </>
          )}
        </div>
        {trains.length === 0 &&
          vehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className={styles.notice}
              data-testid="observed-vehicle"
            >
              <strong>{vehicleDataOld || now - Date.parse(vehicle.updatedAt) > 90000 ? "Last known vehicle observation at" : "Vehicle reported at"} {journey.stops[0].name}</strong>
              <p>
                Headsign: {vehicle.headsign}. Last reported{" "}
                {clockTime(vehicle.updatedAt)} ET.
              </p>
              <p>{vehicleDataOld || now - Date.parse(vehicle.updatedAt) > 90000 ? "Historical observation; current position is unknown. " : ""}No departure time supplied. Boarding is not confirmed.</p>
            </div>
          ))}
        {trains.length === 0 && result.data?.vehiclesError && (
          <p className={styles.small}>Vehicle positions could not be checked.</p>
        )}
        {predictionsChecked && (
          <p className={styles.timestamp}>
            Checked {clockTime(predictionsChecked)} ET · Refresh to update MBTA data.
          </p>
        )}
        <p className={styles.small}>
          Offline estimates stop after 15 minutes without a successful prediction check, or two minutes after the saved departure time. Refresh can request an earlier update, subject to cooldowns. Times are
          estimates, not guarantees.
        </p>
      </section>
      <section className={styles.alerts} aria-labelledby="alerts-heading">
        <div className={styles.sectionHeading}>
          <h2 id="alerts-heading">Along your route</h2>
          <span className={styles.alertCount}>
            {result.data && !result.data.alertsError && !alertsStale
              ? alerts.length
              : "—"}
          </span>
        </div>
        {result.error ? (
          <p className={styles.notice}>Alerts could not be checked.</p>
        ) : !result.data ? (
          <p className={styles.small}>Checking service alerts…</p>
        ) : result.data.alertsError ? (
          <p role="alert" className={styles.notice}>
            {result.data.alertsError}
            {retrying && ` Next retry after ${clockTime(retryAt)} ET.`}
          </p>
        ) : alertsStale ? (
          <p className={styles.notice}>
            Alert information is out of date. Automatic updates will retry; check service before travelling.
          </p>
        ) : alerts.length === 0 ? (
          <p className={styles.allClear}>
            <span>✓</span> No matching active alerts returned.
          </p>
        ) : (
          alerts.map((alert) => (
            <details className={styles.alert} key={alert.id}>
              <summary>
                <span>
                  {alert.attributes.effect?.replaceAll("_", " ") || "SERVICE ALERT"}
                </span>
                {alert.attributes.header || "Service update"}
              </summary>
              <p>{alert.attributes.description || "No further details supplied."}</p>
            </details>
          ))
        )}
        <p className={styles.small}>
          Checks the selected stations, platforms and branch-wide notices.
        </p>
      </section>
    </>
  );
}

export default function Home() {
  const snapshot = useSnapshot();
  const network = {
    ...snapshot,
    data: snapshot.data?.network,
    error: snapshot.data?.network ? "" : snapshot.error,
  };
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [activeField, setActiveField] = useState("origin");

  const journey =
    network.data && origin && destination
      ? findJourney(network.data.patterns, origin, destination)
      : null;

  function pickStop(id) {
    if (activeField === "origin") {
      setOrigin(id);
      setActiveField("destination");
    } else {
      setDestination(id);
      setActiveField("origin");
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>B</span> MBTA journey planner
        </Link>
        <a
          className={styles.mbtaLink}
          href="https://www.mbta.com/schedules/Green-B/line"
          target="_blank"
          rel="noreferrer"
        >
          MBTA service information
        </a>
      </header>
      <main className={styles.workspace}>
        <SubwayMap
          network={network.data}
          journey={journey}
          origin={origin}
          destination={destination}
          activeField={activeField}
          onPick={pickStop}
        />
        <aside
          id="journey-planner"
          className={styles.sidebar}
          aria-label="Journey planner"
        >
          <div className={styles.plannerHeading}>
            <h2>B-branch journey</h2>
            <p>Boston College ↔ Government Center</p>
          </div>
          {network.error ? (
            <p role="alert" className={styles.notice}>
              {network.error}{" "}
              <button className={styles.textButton} onClick={network.refresh}>
                Retry stations
              </button>
            </p>
          ) : !network.data ? (
            <p className={styles.empty}>Loading B-branch stations.</p>
          ) : (
            <>
              <div className={styles.fields}>
                <label className={activeField === "origin" ? styles.activeField : ""}>
                  <span>
                    <b>A</b> Starting stop
                  </span>
                  <select
                    value={origin}
                    onFocus={() => setActiveField("origin")}
                    onChange={(event) => {
                      setOrigin(event.target.value);
                      setActiveField("destination");
                    }}
                  >
                    <option value="">Choose starting stop</option>
                    {network.data.stops.map((stop) => (
                      <option key={stop.id} value={stop.id}>
                        {stop.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className={styles.swap}
                  aria-label="Swap starting stop and destination"
                  disabled={!origin && !destination}
                  onClick={() => {
                    setOrigin(destination);
                    setDestination(origin);
                  }}
                >
                  ⇅
                </button>
                <label
                  className={activeField === "destination" ? styles.activeField : ""}
                >
                  <span>
                    <b>B</b> Destination
                  </span>
                  <select
                    value={destination}
                    onFocus={() => setActiveField("destination")}
                    onChange={(event) => setDestination(event.target.value)}
                  >
                    <option value="">Choose destination</option>
                    {network.data.stops.map((stop) => (
                      <option key={stop.id} value={stop.id}>
                        {stop.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!journey && (
                <p role="status" className={styles.notice}>
                  {!origin || !destination
                    ? "Choose two B-branch stops to see departures and service alerts."
                    : origin === destination
                      ? "Choose a different destination to see trains."
                      : "These stations do not have a normal direct B-branch journey."}
                </p>
              )}
              {journey && (
                <JourneyResults
                  key={`${origin}-${destination}`}
                  journey={journey}
                  snapshot={snapshot}
                />
              )}
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
