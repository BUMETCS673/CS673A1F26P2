/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Build the Green Line B journey planner with origin/destination selection, arrivals, ETA, alerts and manual refresh.
 * AI Contribution: (~90%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { journeyTrains, journeyVehicles } from "@/lib/b-trains.mjs";
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
    client.load();
    return unsubscribe;
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
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);

  const predictionsChecked =
    result.data?.predictionsCheckedAt ?? result.data?.checkedAt ?? result.checked;
  const alertsChecked =
    result.data?.alertsCheckedAt ?? result.data?.checkedAt ?? result.checked;
  const stale = predictionsChecked && now - predictionsChecked > 90000;
  const alertsStale = alertsChecked && now - alertsChecked > 90000;
  const retrying = result.data?.retryAt > now;

  const trains =
    stale || result.error || result.data?.predictionsError
      ? []
      : journeyTrains(snapshot.data?.predictions ?? { data: [] }, journey, now);

  const alerts = result.data?.alerts ?? [];
  const vehicles =
    !result.error &&
    !result.data?.vehiclesError &&
    now - (result.data?.vehiclesCheckedAt ?? 0) <= 90000
      ? journeyVehicles(snapshot.data?.vehicles ?? { data: [] }, journey, now)
      : [];

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
        {result.notice && (
          <p role="status" className={styles.small}>
            {result.notice}
          </p>
        )}
        <div aria-live="polite">
          {result.error ? (
            <p role="alert" className={styles.notice}>
              {result.error} Use Refresh to try again.
            </p>
          ) : !result.data ? (
            <p className={styles.empty}>Checking MBTA predictions…</p>
          ) : result.data.predictionsError ? (
            <p role="alert" className={styles.notice}>
              {result.data.predictionsError}
              {retrying &&
                ` Refresh available after ${clockTime(result.data.retryAt)} ET.`}
            </p>
          ) : stale ? (
            <p className={styles.notice}>
              Predictions are out of date. Refresh before travelling.
            </p>
          ) : trains.length === 0 ? (
            <div className={styles.empty}>
              <strong>No timed departure predictions in saved data</strong>
              <p>
                This B-branch route exists, but the saved MBTA data has no timed
                departures from {journey.stops[0].name} in this direction. Refresh to
                check again; this does not confirm that service has stopped.
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
            trains.map((train, index) => (
              <article className={styles.trainCard} key={train.id}>
                <div className={styles.trainTop}>
                  <span className={styles.trainLabel}>
                    {index === 0 ? "NEXT TRAIN" : "FOLLOWING TRAIN"}
                  </span>
                  <span className={styles.liveLabel}>MBTA prediction</span>
                </div>
                <div className={styles.trainDeparture}>
                  <strong>
                    {minutesUntil(train.departure, now)}
                    <small> min</small>
                  </strong>
                  <span>
                    Toward {train.headsign}
                    <small>Departs {clockTime(train.departure)} ET</small>
                  </span>
                </div>
                {train.originArrival && (
                  <p className={styles.small}>
                    At your stop:{" "}
                    {Date.parse(train.originArrival) <= now
                      ? "arriving / boarding"
                      : `~${minutesUntil(train.originArrival, now)} min`}
                    {train.status ? ` · ${train.status}` : ""}
                  </p>
                )}
                <div className={styles.destinationEstimate}>
                  {train.destinationStatus === "predicted" ? (
                    <>
                      <span>Arrive at destination</span>
                      <strong>~{clockTime(train.destinationArrival)} ET</strong>
                      <small>Same train · ~{train.rideMinutes} min on board</small>
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
            ))
          )}
        </div>
        {trains.length === 0 &&
          vehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className={styles.notice}
              data-testid="observed-vehicle"
            >
              <strong>Vehicle reported at {journey.stops[0].name}</strong>
              <p>
                Headsign: {vehicle.headsign}. Last reported{" "}
                {clockTime(vehicle.updatedAt)} ET.
              </p>
              <p>No departure time supplied. Boarding is not confirmed.</p>
            </div>
          ))}
        {trains.length === 0 && result.data?.vehiclesError && (
          <p className={styles.small}>Vehicle positions could not be checked.</p>
        )}
        {predictionsChecked && !result.data?.predictionsError && (
          <p className={styles.timestamp}>
            Checked {clockTime(predictionsChecked)} ET · Refresh to update MBTA data.
          </p>
        )}
        <p className={styles.small}>
          Countdowns use saved prediction times. Refresh for new MBTA data. Times are
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
            {retrying && ` Next retry after ${clockTime(result.data.retryAt)} ET.`}
          </p>
        ) : alertsStale ? (
          <p className={styles.notice}>
            Alert information is out of date. Refresh to check service.
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
