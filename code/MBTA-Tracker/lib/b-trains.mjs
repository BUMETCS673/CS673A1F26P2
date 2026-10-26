/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Match same-trip predictions and recent vehicle observations without inventing departure times or destination ETAs.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

// Pure JSON:API transforms: no network or React, so edge cases are easy to test.
const unavailable = new Set(["CANCELED", "CANCELLED", "SKIPPED", "NO_DATA"]);
const relation = (item, name) => item.relationships?.[name]?.data?.id;
const timestamp = (value) => (typeof value === "string" ? Date.parse(value) : NaN);

function atStop(item, stop) {
  return [stop.id, ...stop.platforms].includes(relation(item, "stop"));
}

function usable(item, direction) {
  return (
    relation(item, "route") === "Green-B" &&
    item.attributes.direction_id === direction &&
    item.attributes.revenue !== "NON_REVENUE" &&
    item.attributes.revenue_status !== "NON_REVENUE" &&
    !unavailable.has(item.attributes.schedule_relationship)
  );
}

// The two stop predictions must belong to the SAME trip, never just the same
// vehicle. A vehicle may be assigned to several future trips.
export function journeyTrains(document, journey, now = Date.now()) {
  const records = document.data ?? [];
  const origin = journey.stops[0];
  const destination = journey.stops.at(-1);

  const trips = new Map(
    (document.included ?? [])
      .filter((item) => item.type === "trip")
      .map((item) => [item.id, item.attributes]),
  );

  const seen = new Set();

  return (
    records
      .filter((item) => usable(item, journey.direction) && atStop(item, origin))
      // A null departure is the last stop of a trip; it cannot be boarded here.
      .filter((item) => timestamp(item.attributes.departure_time) >= now)
      .sort(
        (a, b) =>
          timestamp(a.attributes.departure_time) -
          timestamp(b.attributes.departure_time),
      )
      .filter((item) => {
        const trip = relation(item, "trip");

        if (!trip || seen.has(trip)) return false;

        seen.add(trip);

        return true;
      })
      .map((item) => {
        const trip = relation(item, "trip");
        const departure = item.attributes.departure_time;

        const destinationRecords = records.filter(
          (other) =>
            relation(other, "trip") === trip &&
            atStop(other, destination) &&
            relation(other, "route") === "Green-B" &&
            other.attributes.direction_id === journey.direction &&
            Number.isInteger(item.attributes.stop_sequence) &&
            Number.isInteger(other.attributes.stop_sequence) &&
            other.attributes.stop_sequence > item.attributes.stop_sequence,
        );

        const target = destinationRecords.find(
          (other) =>
            usable(other, journey.direction) &&
            timestamp(other.attributes.arrival_time) >= timestamp(departure),
        );

        const skipped = destinationRecords.some((other) =>
          ["SKIPPED", "CANCELED", "CANCELLED"].includes(
            other.attributes.schedule_relationship,
          ),
        );

        const arrival = target?.attributes.arrival_time ?? null;

        return {
          id: item.id,
          trip,
          headsign:
            item.attributes.trip_headsign ||
            trips.get(trip)?.headsign ||
            "Destination not supplied",
          departure,
          originArrival: item.attributes.arrival_time ?? null,
          destinationArrival: arrival,
          rideMinutes: arrival
            ? Math.round((timestamp(arrival) - timestamp(departure)) / 60000)
            : null,
          destinationStatus: arrival
            ? "predicted"
            : skipped
              ? "not-served"
              : "unavailable",
          status: item.attributes.status || null,
          // MBTA light-rail uncertainty values are seconds, including 360 for
          // reverse trips. Do not apply bus-only uncertainty rules to Green-B.
          arrivalUncertainty: target?.attributes.arrival_uncertainty ?? null,
        };
      })
      .slice(0, 3)
  );
}

// Presence is an observation, never a departure estimate or boarding promise.
export function journeyVehicles(document, journey, now = Date.now()) {
  const trips = new Map(
    (document.included ?? [])
      .filter((item) => item.type === "trip")
      .map((item) => [item.id, item.attributes]),
  );
  return (document.data ?? [])
    .filter((item) => {
      const updated = timestamp(item.attributes.updated_at);
      const trip = trips.get(relation(item, "trip"));
      return (
        relation(item, "route") === "Green-B" &&
        item.attributes.direction_id === journey.direction &&
        item.attributes.current_status === "STOPPED_AT" &&
        item.attributes.revenue_status !== "NON_REVENUE" &&
        trip?.revenue !== "NON_REVENUE" &&
        (trip?.direction_id == null || trip.direction_id === journey.direction) &&
        atStop(item, journey.stops[0]) &&
        Number.isFinite(updated) &&
        now - updated <= 90000 &&
        updated <= now + 30000
      );
    })
    .map((item) => ({
      id: item.id,
      updatedAt: item.attributes.updated_at,
      headsign: trips.get(relation(item, "trip"))?.headsign || "Headsign unavailable",
    }))
    .slice(0, 3);
}
