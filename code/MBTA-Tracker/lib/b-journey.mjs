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
    (!entity.route || entity.route === "Green-B") && (entity.direction_id == null || entity.direction_id === journey.direction) && (!entity.stop || ids.has(entity.stop))
  ));
}
