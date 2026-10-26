/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Match scheduled Green B journeys and retain labeled last-known timetables without presenting them as live predictions.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

const relation = (item, name) => item.relationships?.[name]?.data?.id;
const timestamp = (value) => typeof value === "string" ? Date.parse(value) : NaN;

export function journeyScheduledTrains(document, journey, now = Date.now()) {
  const origin = journey.stops[0], destination = journey.stops.at(-1);
  const atStop = (record, stop) => [stop.id, ...stop.platforms].includes(relation(record, "stop"));
  const records = document.data ?? [];
  const trips = new Map((document.included ?? [])
    .filter((item) => item.type === "trip").map((item) => [item.id, item.attributes]));
  const seen = new Set();
  return records.filter((item) =>
    relation(item, "route") === "Green-B" &&
    item.attributes.direction_id === journey.direction && atStop(item, origin) &&
    item.attributes.pickup_type !== 1 &&
    timestamp(item.attributes.departure_time) >= now &&
    timestamp(item.attributes.departure_time) <= document.departureBefore,
  ).sort((a, b) => timestamp(a.attributes.departure_time) - timestamp(b.attributes.departure_time))
    .flatMap((item) => {
      const trip = relation(item, "trip"), key = `${item.serviceDate}:${trip}`;
      if (!trip || !item.serviceDate || seen.has(key)) return [];
      const target = records.find((other) =>
        other.serviceDate === item.serviceDate && relation(other, "trip") === trip &&
        relation(other, "route") === "Green-B" &&
        other.attributes.direction_id === journey.direction && atStop(other, destination) &&
        other.attributes.drop_off_type !== 1 &&
        Number.isInteger(item.attributes.stop_sequence) &&
        Number.isInteger(other.attributes.stop_sequence) &&
        other.attributes.stop_sequence > item.attributes.stop_sequence &&
        timestamp(other.attributes.arrival_time) >= timestamp(item.attributes.departure_time),
      );
      if (!target) return [];
      seen.add(key);
      return [{
        id: key, trip, serviceDate: item.serviceDate, source: "scheduled",
        headsign: item.attributes.stop_headsign || trips.get(trip)?.headsign || journey.destination,
        departure: item.attributes.departure_time,
        destinationArrival: target.attributes.arrival_time,
        destinationStatus: "scheduled",
        rideMinutes: Math.round((timestamp(target.attributes.arrival_time) - timestamp(item.attributes.departure_time)) / 60000),
      }];
    }).slice(0, 3);
}

export function scheduledFallback(snapshot, journey, liveTrains, now = Date.now(), allowLastKnown = false) {
  if (liveTrains.length || !snapshot?.predictions ||
      !Number.isFinite(snapshot.predictionsCheckedAt) ||
      !snapshot.schedules ||
      !Number.isFinite(snapshot.schedulesCheckedAt) ||
      (!allowLastKnown && (snapshot.predictionsError || snapshot.schedulesError ||
        now - snapshot.predictionsCheckedAt > 90000 ||
        now - snapshot.schedulesCheckedAt > 300000))) return [];
  const stops = new Set([journey.stops[0], journey.stops.at(-1)].flatMap(stop => [stop.id, ...stop.platforms]));
  const unavailable = new Set(snapshot.predictions.data.filter(item =>
    relation(item, "route") === "Green-B" && item.attributes.direction_id === journey.direction &&
    stops.has(relation(item, "stop")) &&
    (["CANCELED", "CANCELLED", "SKIPPED"].includes(item.attributes.schedule_relationship) ||
      item.attributes.revenue === "NON_REVENUE" || item.attributes.revenue_status === "NON_REVENUE"),
  ).map(item => relation(item, "trip")));
  return journeyScheduledTrains({
    ...snapshot.schedules,
    data: snapshot.schedules.data.filter(item => !unavailable.has(relation(item, "trip"))),
  }, journey, now);
}
