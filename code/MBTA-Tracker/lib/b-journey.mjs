export function findJourney(patterns, origin, destination) {
  if (!origin || !destination || origin === destination) return null;
  for (const pattern of patterns) {
    const from = pattern.stops.findIndex((stop) => stop.id === origin);
    const to = pattern.stops.findIndex((stop) => stop.id === destination);
    if (from >= 0 && to > from) return { direction: pattern.direction, destination: pattern.destination, stops: pattern.stops.slice(from, to + 1) };
  }
  return null;
}
export function upcomingTrains(document, direction, now) {
  const trips = new Map((document.included ?? []).filter((item) => item.type === "trip").map((item) => [item.id, item.attributes]));
  const seen = new Set();
  return (document.data ?? []).filter((item) => item.relationships?.route?.data?.id === "Green-B" && item.attributes.direction_id === direction)
    .filter((item) => !["CANCELED", "SKIPPED"].includes(item.attributes.schedule_relationship))
    .map((item) => ({ id: item.id, trip: item.relationships?.trip?.data?.id, time: item.attributes.departure_time ?? item.attributes.arrival_time,
      status: item.attributes.status, destination: item.attributes.trip_headsign || trips.get(item.relationships?.trip?.data?.id)?.headsign || "Destination unavailable" }))
    .filter((item) => item.time ? Number.isFinite(Date.parse(item.time)) && Date.parse(item.time) >= now : Boolean(item.status))
    .sort((a, b) => (a.time ? Date.parse(a.time) : Infinity) - (b.time ? Date.parse(b.time) : Infinity))
    .filter((item) => { const key = item.trip || item.id; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3);
}
export function journeyAlerts(document, journey) {
  const ids = new Set(journey.stops.flatMap((stop) => [stop.id, ...stop.platforms]));
  return (document.data ?? []).filter((alert) => (alert.attributes.informed_entity ?? []).some((entity) =>
    (!entity.route || (journey.routes ?? [journey.route ?? "Green-B"]).includes(entity.route)) && (entity.direction_id == null || entity.direction_id === journey.direction) && (!entity.stop || ids.has(entity.stop))
  ));
}

const NO_TRAINS = new Set(["SUSPENSION", "NO_SERVICE", "SHUTTLE"]);
const activePeriod = ({ attributes }, now) => {
  const periods = attributes.active_period ?? [];
  return periods.length ? periods.find(({ start, end }) => (!start || Date.parse(start) <= now) && (!end || Date.parse(end) > now)) : {};
};
// A suspension only blocks a leg when it covers two consecutive stops of every route that could serve it,
// so a leg that ends where the suspended section begins (Boston College to Babcock St) stays usable.
export function suspensionAlerts(alerts, journey, now = Date.now()) {
  const routes = journey.routes ?? [journey.route ?? "Green-B"];
  const stopIds = journey.stops.map((stop) => new Set([stop.id, ...stop.platforms]));
  return alerts.filter((alert) => {
    if (!NO_TRAINS.has(alert.attributes.effect) || !activePeriod(alert, now)) return false;
    return routes.every((route) => {
      const entities = (alert.attributes.informed_entity ?? []).filter((entity) =>
        entity.route === route && entity.trip == null && (entity.direction_id == null || entity.direction_id === journey.direction));
      if (entities.some((entity) => !entity.stop)) return true;
      const covered = stopIds.map((ids) => entities.some((entity) => ids.has(entity.stop)));
      return covered.some((hit, index) => hit && covered[index + 1]);
    });
  });
}
export const suspensionEnd = (alert, now = Date.now()) => activePeriod(alert, now)?.end ?? null;
