/*
 * AI-ASSISTED
 * Tool: GitHub Copilot
 * Model: Exact model not recorded
 * Prompt Summary: Test station search ranking and direct, branch and transfer journey planning across all subway, Mattapan and Silver lines.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { plannerNetwork, searchStations, findTransitJourney, parentStationRecords, journeyFilters } from "../lib/transit-network.mjs";
import { journeyTrains } from "../lib/b-trains.mjs";
import { journeyScheduledTrains } from "../lib/b-schedules.mjs";
import { journeyAlerts } from "../lib/b-journey.mjs";

const source = JSON.parse(await readFile(new URL("../app/data/subway-network.json", import.meta.url), "utf8"));
const network = plannerNetwork(source);
const id = (name) => network.stops.find((stop) => stop.name === name).id;
const journey = (a, b) => findTransitJourney(network, id(a), id(b));

test("search ranks exact, prefix, word-prefix and substring matches, with punctuation ignored", () => {
  const stops = ["North Park", "Park Street", "Park", "Spark", "Zoo"].map((name) => ({ name, id: name }));
  assert.deepEqual(searchStations(stops, "park").map((stop) => stop.name), ["Park", "Park Street", "North Park", "Spark"]);
  assert.equal(searchStations(network.stops, "jfk umass")[0].name, "JFK/UMass");
  assert.equal(searchStations(network.stops, "zzzz").length, 0);
  assert.equal(searchStations(network.stops, "").length, network.stops.length);
});

test("every mapped line has direct directed journeys in both directions", () => {
  for (const route of network.routes) {
    for (const direction of [0, 1]) {
      const pattern = network.patterns.find((item) => item.route === route.id && item.direction === direction);
      assert.ok(pattern, `${route.id} direction ${direction}`);
      const trip = findTransitJourney(network, pattern.stops[0].id, pattern.stops.at(-1).id);
      assert.equal(trip.legs.length, 1, route.id);
      assert.ok(trip.legs[0].routes.includes(route.id), route.id);
      assert.equal(trip.legs[0].direction, direction);
    }
  }
});

test("shared segments include every eligible branch without including branches beyond their split", () => {
  assert.deepEqual(journey("Park Street", "Government Center").legs[0].routes, ["Green-B", "Green-C", "Green-D", "Green-E"]);
  assert.deepEqual(journey("South Station", "Courthouse").legs[0].routes, ["741", "742", "743", "746"]);
  assert.deepEqual(journey("Park Street", "Boston College").legs[0].routes, ["Green-B"]);
  assert.deepEqual(journey("JFK/UMass", "Braintree").legs[0].routes, ["Red"]);
});

test("resource keys reuse reverse journeys but isolate different branches and transfer stations", () => {
  assert.deepEqual(journeyFilters(journey("Boston College", "Harvard")), journeyFilters(journey("Harvard", "Boston College")));
  assert.notDeepEqual(journeyFilters(journey("Boston College", "Harvard")), journeyFilters(journey("Cleveland Circle", "Harvard")));
  assert.equal(journeyFilters(journey("Boston College", "Harvard")).stop, ["place-lake", "place-pktrm", "place-harsq"].sort().join(","));
});

test("Green to Red transfers at Park Street and retains the correct directions", () => {
  const trip = journey("Boston College", "Harvard");
  assert.deepEqual(trip.legs.map((leg) => [leg.route, leg.direction]), [["Green-B", 1], ["Red", 1]]);
  assert.equal(trip.legs[0].stops.at(-1).name, "Park Street");
  assert.equal(trip.legs[1].stops[0].name, "Park Street");
  assert.equal(trip.stops.length, trip.stopCount + 1);
});

test("Red southern branches and Green branches require a change of train", () => {
  const red = journey("Ashmont", "Braintree");
  assert.equal(red.legs.length, 2);
  assert.equal(red.legs[0].stops.at(-1).name, "JFK/UMass");
  assert.deepEqual(red.legs.map((leg) => leg.direction), [1, 0]);
  const green = journey("Boston College", "Cleveland Circle");
  assert.deepEqual(green.legs.map((leg) => leg.route), ["Green-B", "Green-C"]);
});

test("Mattapan, Silver and three-line itineraries connect to the rail network", () => {
  assert.deepEqual(journey("Mattapan", "Alewife").legs.map((leg) => leg.route), ["Mattapan", "Red"]);
  assert.deepEqual(journey("Chelsea", "Harvard").legs.map((leg) => leg.route), ["743", "Red"]);
  assert.equal(journey("Wonderland", "Mattapan").legs.length, 4);
  const silver = journey("Nubian", "Chelsea");
  assert.equal(silver.walks.length, 1);
  assert.deepEqual(silver.walks.map((walk) => [walk.from.id, walk.to.id]), [["6538", "place-sstat"]]);
  assert.deepEqual(silver.legs.map((leg) => leg.route), ["751", "743"]);
  assert.ok(silver.stops.some((stop) => stop.id === "place-sstat"));
});

test("invalid, identical, disconnected and walking-only endpoints have no train itinerary", () => {
  assert.equal(findTransitJourney(network, "unknown", id("Harvard")), null);
  assert.equal(journey("Harvard", "Harvard"), null);
  assert.equal(findTransitJourney(network, "6538", "place-sstat"), null);
  const isolated = { ...network, stops: [...network.stops, { id: "isolated", name: "Isolated" }] };
  assert.equal(findTransitJourney(isolated, "isolated", id("Harvard")), null);
});

const now = Date.parse("2026-11-14T15:00:00Z");
const time = (minutes) => new Date(now + minutes * 60000).toISOString();
const record = (route, stop, trip, minutes, sequence, extra = {}) => ({
  id: `${route}-${stop}-${trip}`, serviceDate: "2026-11-14",
  attributes: { direction_id: 1, departure_time: time(minutes), arrival_time: time(minutes), stop_sequence: sequence, ...extra },
  relationships: { route: { data: { id: route } }, stop: { data: { id: stop } }, trip: { data: { id: trip } } },
});

test("platform predictions, same-trip arrivals, schedules and alerts are scoped to each leg's route", () => {
  const trip = journey("Park Street", "Harvard").legs[0];
  const originPlatform = trip.stops[0].platforms[0];
  const destinationPlatform = trip.stops.at(-1).platforms[0];
  const data = [
    record("Red", originPlatform, "red-trip", 3, 1),
    record("Red", destinationPlatform, "red-trip", 13, 6),
    record("Green-B", originPlatform, "green-trip", 1, 1),
    record("Green-B", destinationPlatform, "green-trip", 9, 6),
    record("Red", destinationPlatform, "other-trip", 8, 6),
  ];
  const document = { data, departureBefore: now + 7200000, included: [
    { type: "stop", id: originPlatform, relationships: { parent_station: { data: { id: trip.stops[0].id } } } },
    { type: "stop", id: destinationPlatform, relationships: { parent_station: { data: { id: trip.stops.at(-1).id } } } },
  ] };
  const normalized = parentStationRecords(document);
  const trains = journeyTrains(normalized, trip, now);
  assert.equal(trains.length, 1);
  assert.equal(trains[0].trip, "red-trip");
  assert.equal(trains[0].destinationArrival, time(13));
  assert.equal(journeyScheduledTrains(normalized, trip, now)[0].destinationArrival, time(13));
  const alert = (id, entity) => ({ id, attributes: { informed_entity: [entity] } });
  assert.deepEqual(journeyAlerts({ data: [
    alert("red", { route: "Red" }), alert("platform", { stop: originPlatform, route: "Red" }),
    alert("green", { route: "Green-B" }), alert("opposite", { route: "Red", direction_id: 0 }),
  ] }, trip).map((item) => item.id), ["red", "platform"]);
});
