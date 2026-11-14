/*
 * AI-ASSISTED
 * Tool: OpenAI Codex; GitHub Copilot
 * Model: Exact model not recorded
 * Prompt Summary: Keep multi-stop journeys across all subway lines updated automatically, with station search, leave times, tabbed per-leg results, labeled schedules and bounded approximate countdowns during outages.
 * AI Contribution: (~90%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { journeyTrains, journeyVehicles, offlineJourneyTrains, estimateMinutes } from "@/lib/b-trains.mjs";
import { journeyScheduledTrains, scheduledFallback } from "@/lib/b-schedules.mjs";
import { journeyAlerts, suspensionAlerts, suspensionEnd } from "@/lib/b-journey.mjs";
import { createSnapshotClient } from "./components/b-snapshot-client.mjs";
import { findTransitJourney, plannerNetwork, journeyFilters } from "@/lib/transit-network.mjs";
import { MAX_STOPS, STOP_LETTERS, LIVE_WINDOW_MS, leaveTimes, sortStopsByTime } from "@/lib/itinerary.mjs";
import source from "./data/subway-network.json";
import StationSearch, { RouteBadge } from "./components/StationSearch";
import SubwayMap from "./components/SubwayMap";
import styles from "./page.module.css";

const transitNetwork = plannerNetwork(source);
const routeById = Object.fromEntries(transitNetwork.routes.map((route) => [route.id, route]));
const snapshotClients = new Map();

// Line colours too light for text on white get a darker shade of the same hue.
const readableLineColors = { "#ED8B00": "#AD5C00", "#7C878E": "#5F6A71" };
const lineTextColor = (routeId) => {
  const color = routeById[routeId]?.color?.toUpperCase();
  return color ? readableLineColors[color] ?? color : undefined;
};

// `plannedAt` (epoch ms) loads the timetable from that leave time instead of live data.
function useSnapshot(journey, plannedAt = null) {
  const [client] = useState(() => {
    const filters = journeyFilters(journey);
    const key = `${filters.route}:${filters.stop}${plannedAt == null ? "" : `@${plannedAt}`}`;
    if (snapshotClients.has(key)) return snapshotClients.get(key);
    if (snapshotClients.size >= 64) snapshotClients.delete(snapshotClients.keys().next().value);
    const client = createSnapshotClient(async () => {
      const params = new URLSearchParams({ origin: journey.origin, destination: journey.destinationId });
      if (plannedAt != null) params.set("time", String(plannedAt));
      const response = await fetch(`/api/journey-snapshot?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw Object.assign(
          new Error(data.error?.message || "Unable to load MBTA data."),
          { retryAt: data.error?.retryAt },
        );
      return data;
    });
    snapshotClients.set(key, client);
    return client;
  });
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

const clockDateTime = (time) =>
  new Date(time).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const legSuspensions = (data, leg, now) =>
  !data || data.alertsError
    ? []
    : suspensionAlerts(journeyAlerts(data.alerts ?? { data: [] }, leg), leg, now);

function useNow(interval) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, interval);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [interval]);
  return now;
}

function AlertsSection({ snapshot, journey, now, index, heading = "Along your route" }) {
  const data = snapshot.data;
  const alerts = data?.alerts ? journeyAlerts(data.alerts, journey) : [];
  const alertsChecked = data?.alertsCheckedAt ?? data?.checkedAt ?? snapshot.checked;
  const alertsStale = alertsChecked && now - alertsChecked > 90000;
  const retryAt = Math.max(snapshot.retryAt ?? 0, data?.retryAt ?? 0);
  return (
    <section className={styles.alerts} aria-labelledby={`alerts-heading-${index}`}>
      <div className={styles.sectionHeading}>
        <h2 id={`alerts-heading-${index}`}>{heading}</h2>
        <span className={styles.alertCount}>
          {data && !data.alertsError && !alertsStale ? alerts.length : "—"}
        </span>
      </div>
      {snapshot.error ? (
        <p className={styles.notice}>Alerts could not be checked.</p>
      ) : !data ? (
        <p className={styles.small}>Checking service alerts…</p>
      ) : data.alertsError ? (
        <p role="alert" className={styles.notice}>
          {data.alertsError}
          {retryAt > now && ` Next retry after ${clockTime(retryAt)} ET.`}
        </p>
      ) : alertsStale ? (
        <p className={styles.notice}>
          Alert information is out of date. Automatic updates will retry; check service before travelling.
        </p>
      ) : alerts.length === 0 ? (
        <p className={styles.allClear}>
          <span>✓</span> No matching {data.planned ? "alerts at your leave time" : "active alerts"} returned.
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
  );
}

function JourneyResults({ journey, snapshot, index, leaveAt = null }) {
  const vehicleType = /^\d/.test(journey.route) ? "bus" : "train";
  const result = snapshot;
  const now = useNow(1000);
  // Departures are listed from the stop's leave time once it is in the future.
  const from = Math.max(now, leaveAt ?? now);
  const waiting = from > now;

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
      .filter((train) => Date.parse(train.departure) >= (leaveAt ?? 0))
    : journeyTrains(predictions, journey, from);

  const suspension = alertsStale ? undefined : legSuspensions(snapshot.data, journey, from)[0];
  const suspensionUntil = suspension ? suspensionEnd(suspension, from) : null;
  const scheduled = scheduledFallback(snapshot.data, journey, trains, from, true);
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
      <section className={styles.results} aria-labelledby={`arrivals-heading-${index}`}>
        <div className={styles.sectionHeading}>
          <h2 id={`arrivals-heading-${index}`}>{waiting ? `Departures after ${clockTime(from)}` : "Next departures"}</h2>
          <button
            className={styles.textButton}
            onClick={result.refresh}
            disabled={result.busy}
          >
            Refresh ↻
          </button>
        </div>
        <p className={styles.small}>From {journey.stops[0].name}</p>
        {leaveAt != null && leaveAt < now && (
          <p className={styles.small}>Your {clockTime(leaveAt)} leave time has passed; showing the next departures.</p>
        )}
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
          ) : departures.length === 0 && suspension ? (
            <div className={styles.suspension} role="alert">
              <strong>Service suspended on this route</strong>
              <p>
                {suspensionUntil ? `MBTA lists this suspension until ${clockDateTime(suspensionUntil)} ET` : "MBTA lists this suspension as active"}, so there are no departures to show.
              </p>
              <p>{suspension.attributes.header}</p>
              <a
                href={`https://www.mbta.com/schedules/${journey.route}/line`}
                target="_blank"
                rel="noreferrer"
              >
                Check the MBTA schedule ↗
              </a>
            </div>
          ) : departures.length === 0 ? (
            <div className={styles.empty}>
              <strong>No timed departure predictions in saved data</strong>
              <p>
                This route exists, but the saved MBTA data has no timed
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
                href={`https://www.mbta.com/schedules/${journey.route}/line`}
                target="_blank"
                rel="noreferrer"
              >
                Check the MBTA schedule ↗
              </a>
            </div>
          ) : (
            <>
            {suspension && <p role="alert" className={styles.notice}><strong>Service suspended.</strong> {suspension.attributes.header} Times below may not reach {journey.stops.at(-1).name}.</p>}
            {isScheduled && <p className={styles.small}>{predictionsOld ? "Live departure predictions could not be updated." : "No live departure predictions for this journey."} Times below are scheduled, not live. Check service alerts before travelling.</p>}
            {isScheduled && (result.data.schedulesError || schedulesStale) && <p role="alert" className={styles.notice}>Timetable could not be updated. Showing the last saved schedule checked {clockTime(result.data.schedulesCheckedAt)} ET.</p>}
            {departures.map((train, index) => (
              <article className={styles.trainCard} key={train.id} style={{ "--line-text": lineTextColor(train.route ?? journey.route) }}>
                <div className={styles.trainTop}>
                  <span className={styles.trainLabel}>
                    {train.route && <RouteBadge route={transitNetwork.routes.find((route) => route.id === train.route)} />}{" "}
                    {isScheduled ? `SCHEDULED ${vehicleType.toUpperCase()}` : index === 0 ? `NEXT ${vehicleType.toUpperCase()}` : `FOLLOWING ${vehicleType.toUpperCase()}`}
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
                      <span>{isScheduled ? "Scheduled arrival" : cardsOld ? "Last predicted arrival" : "Arrive at"} {journey.stops.at(-1).name}</span>
                      <strong>~{clockTime(train.destinationArrival)} ET</strong>
                      <small>{isScheduled ? "Scheduled ride" : `Same ${vehicleType}`} · ~{train.rideMinutes} min on board</small>
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
                          ? `MBTA marks this ${vehicleType}'s destination stop as skipped or canceled. Check alerts before boarding.`
                          : `Check the ${vehicleType}'s headsign and alerts. A departure prediction alone does not confirm it reaches your destination.`}
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
        {trains.length === 0 && !suspension && !waiting &&
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
      <AlertsSection snapshot={snapshot} journey={journey} now={now} index={index} />
    </>
  );
}

function PlannedResults({ journey, snapshot, index, start, trains, chained }) {
  const now = useNow(15000);
  const data = snapshot.data;
  const vehicleType = /^\d/.test(journey.route) ? "bus" : "train";
  const retryAt = Math.max(snapshot.retryAt ?? 0, data?.retryAt ?? 0);
  const suspension = legSuspensions(data, journey, start)[0];
  const suspensionUntil = suspension ? suspensionEnd(suspension, start) : null;
  const scheduleLink = (
    <a href={`https://www.mbta.com/schedules/${journey.route}/line`} target="_blank" rel="noreferrer">
      Check the MBTA schedule ↗
    </a>
  );
  return (
    <>
      <section className={styles.results} aria-labelledby={`arrivals-heading-${index}`}>
        <div className={styles.sectionHeading}>
          <h2 id={`arrivals-heading-${index}`}>Scheduled departures</h2>
          <button className={styles.textButton} onClick={snapshot.refresh} disabled={snapshot.busy}>
            Refresh ↻
          </button>
        </div>
        <p className={styles.small}>
          From {journey.stops[0].name} after {clockDateTime(start)} ET{chained ? ", once the previous leg's first train arrives" : ""}.
        </p>
        {snapshot.notice && <p role="status" className={styles.small}>{snapshot.notice}</p>}
        <div aria-live="polite">
          {snapshot.error && (
            <p role="alert" className={styles.notice}>
              {snapshot.error}{retryAt > now ? ` Retrying after ${clockTime(retryAt)} ET.` : ""}
            </p>
          )}
          {!data ? (
            <p className={styles.empty}>Checking the MBTA timetable…</p>
          ) : data.schedulesError ? (
            <p role="alert" className={styles.notice}>Scheduled departures could not be loaded. Use Refresh to try again.</p>
          ) : trains.length === 0 && suspension ? (
            <div className={styles.suspension} role="alert">
              <strong>Service suspended at your leave time</strong>
              <p>
                {suspensionUntil ? `MBTA lists this suspension until ${clockDateTime(suspensionUntil)} ET` : "MBTA lists this suspension as active then"}, so there are no departures to show.
              </p>
              <p>{suspension.attributes.header}</p>
              {scheduleLink}
            </div>
          ) : trains.length === 0 ? (
            <div className={styles.empty}>
              <strong>No scheduled departures found</strong>
              <p>The MBTA timetable has no departures from {journey.stops[0].name} in this direction within two hours after {clockTime(start)}.</p>
              {scheduleLink}
            </div>
          ) : (
            <>
              {suspension && <p role="alert" className={styles.notice}><strong>Service suspended at this time.</strong> {suspension.attributes.header} Scheduled trips below may not run.</p>}
              {trains.map((train, order) => {
                const [time, meridiem] = clockTime(train.departure).split(/\s+/);
                const wait = Math.max(0, Math.round((Date.parse(train.departure) - start) / 60000));
                return (
                  <article className={styles.trainCard} key={train.id} style={{ "--line-text": lineTextColor(train.route ?? journey.route) }}>
                    <div className={styles.trainTop}>
                      <span className={styles.trainLabel}>
                        {train.route && <RouteBadge route={routeById[train.route]} />}{" "}
                        {order === 0 ? `FIRST ${vehicleType.toUpperCase()}` : `LATER ${vehicleType.toUpperCase()}`}
                      </span>
                      <span className={styles.liveLabel}>Scheduled · MBTA timetable</span>
                    </div>
                    <div className={styles.trainDeparture}>
                      <strong>{time}<small> {meridiem}</small></strong>
                      <span>
                        Toward {train.headsign}
                        <small>{wait === 0 ? "Departs at your time" : `${wait} min after ${chained ? "you arrive" : "your leave time"}`}</small>
                      </span>
                    </div>
                    <div className={styles.destinationEstimate}>
                      <span>Scheduled arrival at {journey.stops.at(-1).name}</span>
                      <strong>~{clockTime(train.destinationArrival)} ET</strong>
                      <small>Scheduled ride · ~{train.rideMinutes} min on board</small>
                    </div>
                  </article>
                );
              })}
            </>
          )}
        </div>
        <p className={styles.small}>
          Timetable times, not live predictions. Live countdowns replace them within 30 minutes of your leave time.
        </p>
      </section>
      <AlertsSection snapshot={snapshot} journey={journey} now={now} index={index} heading="Alerts at your time" />
    </>
  );
}

// Planned legs chain: each leg starts when the previous leg's first scheduled train arrives.
function plannedLegs(journey, data, leaveAt) {
  let start = leaveAt;
  return journey.legs.map((leg) => {
    const trains = data?.schedules ? journeyScheduledTrains(data.schedules, leg, start) : [];
    const plan = { start, trains };
    const arrival = Date.parse(trains[0]?.destinationArrival);
    if (Number.isFinite(arrival)) start = arrival;
    return plan;
  });
}

function ItineraryResults({ journey, leave, planned }) {
  const snapshot = useSnapshot(journey, planned ? leave.at : null);
  const transferCount = journey.legs.length - 1;
  const plans = planned ? plannedLegs(journey, snapshot.data, leave.at) : null;
  return (
    <>
      <div className={styles.journeySummary}>
        <span className={styles.directionArrow}>↗</span>
        <div>
          <strong>To {journey.destination}</strong>
          <p>{journey.stopCount} stop{journey.stopCount === 1 ? "" : "s"} · {transferCount ? `${transferCount} transfer${transferCount > 1 ? "s" : ""}` : "Direct"}{planned ? ` · Timetable for ${clockDateTime(leave.at)}` : ""}</p>
        </div>
      </div>
      {(transferCount > 0 || journey.walks.length > 0) && <p className={styles.small}>{journey.legs.slice(1).flatMap((leg, index) => {
        const previous = journey.legs[index].stops.at(-1);
        return previous.id === leg.stops[0].id ? [`Transfer at ${previous.name}`] : [];
      }).concat(journey.walks.map((walk) => `Walk from ${walk.from.name} to ${walk.to.name} (street-level transfer)`)).join(". ")}. {planned
        ? "Later panels use the timetable from the previous leg's first arrival; walking time is not included."
        : "Each panel shows upcoming departures at its boarding station, not a guaranteed connection."}</p>}
      <div className={`${styles.arrivalPanels} ${transferCount ? styles.splitPanels : ""}`} style={{ "--leg-count": journey.legs.length }}>
        {journey.legs.map((leg, index) => {
          const route = transitNetwork.routes.find((item) => item.id === leg.route);
          const alertsChecked = snapshot.data?.alertsCheckedAt ?? snapshot.data?.checkedAt;
          const suspended = !snapshot.error && alertsChecked &&
            legSuspensions(snapshot.data, leg, planned ? plans[index].start : alertsChecked).length > 0;
          return (
            <section key={`${leg.pattern}-${index}`} className={styles.legPanel} aria-label={`${leg.routes.length > 1 ? "Shared-line" : route.name} arrivals`}>
              <div className={styles.legHeading}>
                <span className={styles.stationBadges}>{leg.routes.map((id) => <RouteBadge key={id} route={transitNetwork.routes.find((item) => item.id === id)} />)}</span>
                <div><strong>{leg.routes.length > 1 ? "Shared-line service" : route.label.startsWith("SL") ? `${route.label} Silver Line` : route.name}</strong>
                  <p>{leg.stops[0].name} → {leg.stops.at(-1).name}</p>
                </div>
                {suspended && <span className={styles.suspendedPill}>Suspended</span>}
              </div>
              <div className={styles.legScroll} tabIndex={0} role="region" aria-label={`${route.name} departures and alerts`}>
                {planned ? (
                  <PlannedResults journey={leg} snapshot={snapshot} index={index}
                    start={plans[index].start} trains={plans[index].trains} chained={index > 0} />
                ) : (
                  <JourneyResults journey={leg} snapshot={snapshot} index={index} leaveAt={leave.at} />
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

let nextStopKey = 3;

function segmentMessage(segment, single) {
  const from = STOP_LETTERS[segment.index], to = STOP_LETTERS[segment.index + 1];
  if (single && !segment.from && !segment.to) return "Search or select two stations to see departures and service alerts.";
  if (!segment.from) return `Search or select stop ${from} to see this part of your trip.`;
  if (!segment.to) return `Search or select stop ${to} to see this part of your trip.`;
  if (segment.from === segment.to) return `Stops ${from} and ${to} are the same station. Choose a different stop.`;
  return "No connected journey was found in the mapped network.";
}

function TimeField({ stop, index, leave, onChange, onCommit }) {
  const letter = STOP_LETTERS[index];
  const previous = STOP_LETTERS[index - 1];
  return (
    <div className={styles.timeControl} data-empty={stop.time ? undefined : ""}>
      <input type="time" value={stop.time}
        aria-label={`Leave time for stop ${letter} (empty means ${index === 0 ? "now" : `after stop ${previous}`})`}
        onChange={(event) => onChange(event.target.value)} onBlur={onCommit}
        onKeyDown={(event) => { if (event.key === "Enter") onCommit(); }} />
      {!stop.time && <span className={styles.timePlaceholder} aria-hidden="true">{index === 0 ? "Now" : `After ${previous}`}</span>}
      {stop.time && leave?.tomorrow && (
        <span className={styles.tomorrowTag} title="Tomorrow"><span aria-hidden="true">+1</span><span className={styles.srOnly}>tomorrow</span></span>
      )}
      {stop.time && (
        <button type="button" className={styles.clearTime} aria-label={`Clear leave time for stop ${letter}`}
          onClick={() => onChange("", true)}>×</button>
      )}
    </div>
  );
}

export default function Home() {
  const [stops, setStops] = useState(() => [
    { key: 1, station: "", time: "" },
    { key: 2, station: "", time: "" },
  ]);
  const [activeStop, setActiveStop] = useState(0);
  const [activeTab, setActiveTab] = useState(0);
  const [focusKey, setFocusKey] = useState(null);
  const [reorder, setReorder] = useState(null);
  const now = useNow(15000);

  useEffect(() => {
    if (!reorder) return;
    const timer = setTimeout(() => setReorder(null), 5000);
    return () => clearTimeout(timer);
  }, [reorder]);

  const last = stops.length - 1;
  const current = Math.min(activeStop, last);
  const times = leaveTimes(stops, now);
  const segments = stops.slice(0, -1).map((stop, index) => {
    const to = stops[index + 1].station;
    const journey = stop.station && to ? findTransitJourney(transitNetwork, stop.station, to) : null;
    const leave = times[index];
    const planned = Boolean(journey && leave.at != null && leave.at > now + LIVE_WINDOW_MS);
    return { index, from: stop.station, to, journey, leave, planned };
  });
  const tab = Math.min(activeTab, segments.length - 1);
  const segment = segments[tab];

  const markers = {};
  stops.forEach((stop, index) => {
    if (stop.station) markers[stop.station] = [markers[stop.station], STOP_LETTERS[index]].filter(Boolean).join("/");
  });
  const journeys = segments.map((item) => item.journey).filter(Boolean);
  const mapJourney = journeys.length
    ? { legs: journeys.flatMap((journey) => journey.legs), stops: journeys.flatMap((journey) => journey.stops) }
    : null;

  function chooseStation(index, station) {
    setStops(stops.map((stop, i) => (i === index ? { ...stop, station } : stop)));
    if (!station) return;
    setActiveTab(Math.max(0, index - 1));
    if (index < last) setActiveStop(index + 1);
  }

  function pickFromMap(station) {
    chooseStation(current, station);
    setActiveStop((current + 1) % stops.length);
  }

  // Sorting waits until the time is committed so rows don't jump while typing.
  function changeTime(index, time, sort = false) {
    const edited = { ...stops[index], time };
    const next = stops.map((stop, i) => (i === index ? edited : stop));
    const sorted = sort ? sortStopsByTime(next, now) : next;
    setStops(sorted);
    setActiveTab(Math.min(sorted.indexOf(edited), sorted.length - 2));
    if (sorted !== next) setReorder({ moved: sorted.filter((stop, i) => stop !== next[i]).map((stop) => stop.key) });
  }

  function addStop() {
    if (stops.length >= MAX_STOPS) return;
    const stop = { key: nextStopKey++, station: "", time: "" };
    setStops([...stops, stop]);
    setFocusKey(stop.key);
    setActiveStop(stops.length);
    setActiveTab(stops.length - 1);
  }

  function removeStop(index) {
    const next = stops.filter((_, i) => i !== index);
    // The new final stop has no leave time.
    if (index === last) next[next.length - 1] = { ...next.at(-1), time: "" };
    setStops(next);
    setActiveStop(Math.min(current > index ? current - 1 : current, next.length - 1));
    setActiveTab(Math.max(0, Math.min(tab >= index && tab > 0 ? tab - 1 : tab, next.length - 2)));
    document.getElementById("add-stop")?.focus();
  }

  function reverseStops() {
    // Stations reverse; leave times stay with their position in the trip.
    const reversed = [...stops].reverse();
    setStops(stops.map((stop, i) => ({ key: reversed[i].key, station: reversed[i].station, time: stop.time })));
    setActiveTab(0);
  }

  function tabKeys(event) {
    const moves = { ArrowRight: tab + 1, ArrowLeft: tab - 1, Home: 0, End: segments.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (moves[event.key] + segments.length) % segments.length;
    setActiveTab(next);
    document.getElementById(`segment-tab-${next}`)?.focus();
  }

  const tabTime = (item) =>
    !item.journey ? "—"
      : item.leave.at == null || item.leave.at <= now ? "Now"
        : `${item.leave.inherited ? "After " : ""}${clockTime(item.leave.at)}${item.leave.tomorrow ? " +1" : ""}`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>T</span> MBTA journey planner
        </Link>
        <a
          className={styles.mbtaLink}
          href="https://www.mbta.com/schedules"
          target="_blank"
          rel="noreferrer"
        >
          MBTA service information
        </a>
      </header>
      <main className={styles.workspace}>
        <SubwayMap
          network={transitNetwork}
          journey={mapJourney}
          markers={markers}
          activeLetter={STOP_LETTERS[current]}
          onPick={pickFromMap}
        />
        <aside
          id="journey-planner"
          className={styles.sidebar}
          aria-label="Journey planner"
        >
          <div className={styles.plannerHeading}>
            <h2>Plan your journey</h2>
            <p>All subway branches, Mattapan &amp; Silver Line · up to {MAX_STOPS} stops</p>
          </div>
          <ol className={styles.stopList} aria-label="Itinerary stops">
            {stops.map((stop, index) => {
              const letter = STOP_LETTERS[index];
              const final = index === last;
              return (
                <li key={stop.key} className={`${styles.stopRow} ${reorder?.moved.includes(stop.key) ? styles.movedRow : ""}`}>
                  <span className={`${styles.stopMarker} ${index === current ? styles.activeMarker : ""}`} aria-hidden="true">{letter}</span>
                  <StationSearch
                    label={`Stop ${letter}${index === 0 ? " (start)" : final ? " (final stop)" : ""}`}
                    stops={transitNetwork.stops} routes={transitNetwork.routes} value={stop.station}
                    active={index === current} autoFocus={stop.key === focusKey}
                    onFocus={() => setActiveStop(index)} onChange={(id) => chooseStation(index, id)} />
                  {final ? (
                    <span className={styles.finalStop}>Final stop</span>
                  ) : (
                    <TimeField stop={stop} index={index} leave={times[index]}
                      onChange={(time, sort) => changeTime(index, time, sort)}
                      onCommit={() => changeTime(index, stop.time, true)} />
                  )}
                  {stops.length > 2 && (
                    <button type="button" className={styles.removeStop} aria-label={`Remove stop ${letter}`}
                      onClick={() => removeStop(index)}>✕</button>
                  )}
                </li>
              );
            })}
          </ol>
          <div className={styles.stopActions}>
            <button id="add-stop" type="button" className={styles.addStop} onClick={addStop} disabled={stops.length >= MAX_STOPS}>
              + Add stop
            </button>
            <span className={styles.stopCount}>{stops.length} of {MAX_STOPS} stops</span>
            <button type="button" className={styles.reverseStops} aria-label="Reverse stop order"
              onClick={reverseStops} disabled={!stops.some((stop) => stop.station)}>
              ⇅ Reverse
            </button>
          </div>
          <p role="status" className={styles.sortNotice}>{reorder ? "Stops re-ordered to follow your leave times." : ""}</p>
          <div className={styles.resultsArea}>
            {segments.length > 1 && (
              <div role="tablist" aria-label="Trip segments" className={styles.segmentTabs} onKeyDown={tabKeys}>
                {segments.map((item) => (
                  <button key={item.index} type="button" role="tab" id={`segment-tab-${item.index}`}
                    aria-selected={item.index === tab} aria-controls="segment-panel" tabIndex={item.index === tab ? 0 : -1}
                    className={`${styles.segmentTab} ${item.journey ? "" : styles.incompleteTab}`}
                    style={{ "--tab-color": routeById[item.journey?.legs[0].route]?.color }}
                    onClick={() => setActiveTab(item.index)}>
                    <strong>{STOP_LETTERS[item.index]} → {STOP_LETTERS[item.index + 1]}</strong>
                    <small>{tabTime(item)}</small>
                  </button>
                ))}
              </div>
            )}
            <div id="segment-panel" className={styles.segmentResults}
              role={segments.length > 1 ? "tabpanel" : undefined}
              aria-labelledby={segments.length > 1 ? `segment-tab-${tab}` : undefined}>
              {segment.journey ? (
                <ItineraryResults
                  key={`${tab}:${segment.from}:${segment.to}:${segment.planned ? segment.leave.at : "live"}`}
                  journey={segment.journey}
                  leave={segment.leave}
                  planned={segment.planned}
                />
              ) : (
                <p role="status" className={styles.notice}>{segmentMessage(segment, segments.length === 1)}</p>
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
