/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Test prediction matching, offline estimates, vehicle observations and departure queue replenishment.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { journeyTrains, journeyVehicles, offlineJourneyTrains, estimateMinutes } from "../lib/b-trains.mjs";

const now = Date.parse("2026-10-13T12:00:00Z");
const time = (minutes) => new Date(now + minutes * 60000).toISOString();

const journey = {
  direction: 0,
  stops: [
    { id: "start", platforms: ["start-platform"] },
    { id: "end", platforms: ["end-platform"] },
  ],
};

function prediction(id, stop, trip, sequence, minutes, attributes = {}) {
  return {
    id,
    attributes: {
      direction_id: 0,
      arrival_time: time(minutes),
      departure_time: time(minutes),
      stop_sequence: sequence,
      ...attributes,
    },
    relationships: {
      route: { data: { id: "Green-B" } },
      stop: { data: { id: stop } },
      trip: { data: { id: trip } },
      vehicle: { data: { id: "same-vehicle" } },
    },
  };
}

test("matches same trip at direction-specific platforms, including terminal arrival", () => {
  const data = [
    prediction("a", "start-platform", "trip-a", 2, 3),
    prediction("b", "end-platform", "trip-b", 10, 6),
    prediction("c", "end-platform", "trip-a", 10, 20, { departure_time: null }),
  ];

  const [train] = journeyTrains({ data }, journey, now);

  assert.equal(train.destinationArrival, time(20));
  assert.equal(train.rideMinutes, 17);
  assert.equal(train.destinationStatus, "predicted");
});

test("does not match a different trip on the same vehicle or invent a destination ETA", () => {
  const data = [
    prediction("a", "start", "a", 1, 1),
    prediction("b", "end", "b", 3, 15),
  ];

  const [train] = journeyTrains({ data }, journey, now);

  assert.equal(train.destinationArrival, null);
  assert.equal(train.rideMinutes, null);
  assert.equal(train.destinationStatus, "unavailable");
});

test("rejects canceled, skipped, no-data, non-revenue, terminating and past origin predictions", () => {
  const data = ["CANCELED", "CANCELLED", "SKIPPED", "NO_DATA"].map((value) =>
    prediction(value, "start", value, 1, 1, { schedule_relationship: value }),
  );

  data.push(
    prediction("non-revenue", "start", "nr", 1, 2, { revenue_status: "NON_REVENUE" }),
    prediction("api-non-revenue", "start", "nr-api", 1, 2, { revenue: "NON_REVENUE" }),
    prediction("terminal", "start", "terminal", 1, 2, { departure_time: null }),
    prediction("past", "start", "past", 1, -1),
    prediction("wrong", "start", "wrong", 1, 2, { direction_id: 1 }),
  );
  assert.deepEqual(journeyTrains({ data }, journey, now), []);
});

test("skipped destination is explicit; missing or backwards sequences do not create predictions", () => {
  const origin = prediction("a", "start", "a", 4, 2);

  for (const attributes of [
    { stop_sequence: 3 },
    { stop_sequence: null },
    { arrival_time: time(1) },
    { schedule_relationship: "NO_DATA" },
  ]) {
    const data = [origin, prediction("b", "end", "a", 8, 10, attributes)];

    assert.equal(journeyTrains({ data }, journey, now)[0].destinationArrival, null);
  }

  const data = [
    origin,
    prediction("b", "end", "a", 8, 10, { schedule_relationship: "SKIPPED" }),
  ];

  assert.equal(
    journeyTrains({ data }, journey, now)[0].destinationStatus,
    "not-served",
  );
});

test("deduplicates trips and returns the first three in time order", () => {
  const data = [9, 3, 1, 5, 1].map((minutes, index) =>
    prediction(String(index), "start", String(minutes), 1, minutes),
  );

  assert.deepEqual(
    journeyTrains({ data }, journey, now).map((train) => train.trip),
    ["1", "3", "5"],
  );
});

test("supports inbound journeys and preserves light-rail uncertainty", () => {
  const data = [
    prediction("a", "end", "a", 1, 2, { direction_id: 1 }),
    prediction("b", "start", "a", 6, 15, { direction_id: 1, arrival_uncertainty: 360 }),
  ];

  const inbound = { direction: 1, stops: [...journey.stops].reverse() };
  const [train] = journeyTrains({ data }, inbound, now);

  assert.equal(train.destinationArrival, time(15));
  assert.equal(train.arrivalUncertainty, 360);
});

test("unknown origin sequence cannot establish same-trip order", () => {
  const data = [
    prediction("a", "start", "a", null, 2),
    prediction("b", "end", "a", 4, 10),
  ];

  assert.equal(journeyTrains({ data }, journey, now)[0].destinationArrival, null);
});

for (const [direction, start, end] of [
  [0, "70202", "70107"],
  [1, "70106", "70201"],
]) {
  test("terminal departures and same-trip arrivals in direction " + direction, () => {
    const route = {
      direction,
      stops: [
        { id: direction ? "place-lake" : "place-gover", platforms: [start] },
        { id: direction ? "place-gover" : "place-lake", platforms: [end] },
      ],
    };
    const origin = prediction("origin", start, "through", 1, 3, {
      direction_id: direction,
      arrival_time: null,
    });
    const terminal = prediction("terminal", end, "through", 23, 45, {
      direction_id: direction,
      departure_time: null,
    });
    const wrongTrip = prediction("wrong-trip", end, "different", 23, 10, {
      direction_id: direction,
    });
    const [train] = journeyTrains({ data: [origin, wrongTrip, terminal] }, route, now);
    assert.equal(train.destinationArrival, time(45));
    assert.equal(train.rideMinutes, 42);
    assert.deepEqual(journeyTrains({ data: [terminal] }, route, now), []);
  });
}

function observedVehicle(attributes = {}, stop = "start-platform") {
  return {
    id: "vehicle",
    attributes: {
      direction_id: 0,
      current_status: "STOPPED_AT",
      updated_at: time(-0.5),
      ...attributes,
    },
    relationships: {
      route: { data: { id: "Green-B" } },
      stop: { data: { id: stop } },
      trip: { data: { id: "trip" } },
    },
  };
}
const vehicleTrips = [
  {
    type: "trip",
    id: "trip",
    attributes: { direction_id: 0, headsign: "Boston College", revenue: "REVENUE" },
  },
];
test("an observed vehicle without predictions supplies presence, never an ETA", () => {
  const [vehicle] = journeyVehicles(
    { data: [observedVehicle()], included: vehicleTrips },
    journey,
    now,
  );
  assert.deepEqual(vehicle, {
    id: "vehicle",
    updatedAt: time(-0.5),
    headsign: "Boston College",
  });
  assert.deepEqual(journeyTrains({ data: [] }, journey, now), []);
});
test("vehicle presence rejects wrong direction, station, movement, stale time and non-revenue", () => {
  for (const attributes of [
    { direction_id: 1 },
    { current_status: "IN_TRANSIT_TO" },
    { updated_at: time(-2) },
    { updated_at: time(1) },
    { updated_at: null },
    { revenue_status: "NON_REVENUE" },
  ]) {
    assert.deepEqual(
      journeyVehicles(
        { data: [observedVehicle(attributes)], included: vehicleTrips },
        journey,
        now,
      ),
      [],
    );
  }
  assert.deepEqual(
    journeyVehicles({ data: [observedVehicle({}, "end-platform")] }, journey, now),
    [],
  );
  for (const attributes of [{ direction_id: 1 }, { revenue: "NON_REVENUE" }]) {
    assert.deepEqual(
      journeyVehicles(
        { data: [observedVehicle()], included: [{ ...vehicleTrips[0], attributes }] },
        journey,
        now,
      ),
      [],
    );
  }
  assert.equal(
    journeyVehicles({ data: [observedVehicle()] }, journey, now + 60000).length,
    1,
  );
  assert.equal(
    journeyVehicles({ data: [observedVehicle()] }, journey, now + 60001).length,
    0,
  );
});

 test("offline estimates count down from absolute times and expire without asserting departure", () => {
 const doc={data:[prediction("a","start","a",1,8),prediction("b","end","a",3,30)]};
 const saved=offlineJourneyTrains(doc,journey,now,now)[0];
 assert.equal(estimateMinutes(saved.departure,now),8);
 assert.equal(estimateMinutes(saved.departure,now+120000),6);
 assert.equal(offlineJourneyTrains(doc,journey,now,now+8*60000).length,1);
 assert.equal(estimateMinutes(saved.departure,now+9*60000),0);
 assert.equal(offlineJourneyTrains(doc,journey,now,now+10*60000+1).length,0);
 assert.equal(offlineJourneyTrains(doc,journey,now,now-1).length,0);
 assert.equal(estimateMinutes(null,now),null);
 assert.equal(saved.destinationArrival,time(30));
 });
 test("offline retention is bounded and successful empty or cancelled data clears estimates", () => {
 const doc={data:[prediction("a","start","a",1,30)]};
 assert.equal(offlineJourneyTrains(doc,journey,now,now+15*60000+1).length,0);
 assert.deepEqual(offlineJourneyTrains({data:[]},journey,now,now),[]);
 doc.data[0].attributes.schedule_relationship="CANCELED";
 assert.deepEqual(offlineJourneyTrains(doc,journey,now,now),[]);
 });

test("full saved pool promotes fourth and fifth trips as earlier departures expire", () => {
  const data = [1, 4, 7, 10, 13].flatMap((minute, i) => [
    prediction('o' + i, 'start', 'trip' + i, 1, minute),
    prediction('d' + i, 'end', 'trip' + i, 23, minute + 40),
  ]);
  data.push(data[2]); // duplicate upstream record cannot occupy another card
  const doc = { data };
  const ids = rows => rows.map(row => row.trip);
  assert.deepEqual(ids(journeyTrains(doc, journey, now)), ['trip0', 'trip1', 'trip2']);
  assert.deepEqual(ids(journeyTrains(doc, journey, now + 60001)), ['trip1', 'trip2', 'trip3']);
  assert.deepEqual(ids(journeyTrains(doc, journey, now + 240001)), ['trip2', 'trip3', 'trip4']);
  assert.deepEqual(ids(offlineJourneyTrains(doc, journey, now, now + 360001)), ['trip2', 'trip3', 'trip4']);
  assert.equal(journeyTrains(doc, journey, now + 600001).length, 1);
  assert.equal(journeyTrains(doc, journey, now + 780001).length, 0);
  const recovered = { data: data.filter(row => row.relationships.trip.data.id !== 'trip2') };
  assert.deepEqual(ids(journeyTrains(recovered, journey, now + 240001)), ['trip3', 'trip4']);
  assert.equal(doc.data.length, 11); // display never truncates the underlying pool
});
