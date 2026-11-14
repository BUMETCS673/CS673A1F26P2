/*
 * AI-ASSISTED
 * Tool: GitHub Copilot
 * Model: Exact model not recorded
 * Prompt Summary: Build the all-lines station network, rank station search results and plan direct or transfer train journeys with per-leg filters.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

export function plannerNetwork(source) {
  const stops = Object.values(source.stations).map((stop) => ({ ...stop, platforms: stop.platforms ?? [] }));
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  return {
    routes: source.routes,
    stops,
    patterns: source.patterns.map((pattern) => ({
      ...pattern,
      destination: byId.get(pattern.stops.at(-1)).name,
      stops: pattern.stops.map((id) => byId.get(id)),
    })),
  };
}

const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// These street-level Silver stops are not MBTA parent stations. A change here
// requires leaving the subway and walking to the named bus stop (or vice versa).
const walkingTransfers = [
  ["6538", "place-sstat"],
  ["8279", "place-boyls"],
];

export function searchStations(stops, query) {
  const text = normalize(query);
  const rank = (stop) => {
    const name = normalize(stop.name);
    if (!text) return 0;
    if (name === text) return 0;
    if (name.startsWith(text)) return 1;
    if (name.split(" ").some((word) => word.startsWith(text))) return 2;
    if (name.includes(text)) return 3;
    if (text.split(" ").every((word) => name.includes(word))) return 4;
    return Infinity;
  };
  return stops.map((stop) => ({ stop, rank: rank(stop) }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((a, b) => a.rank - b.rank || a.stop.name.localeCompare(b.stop.name) || a.stop.id.localeCompare(b.stop.id))
    .map((entry) => entry.stop);
}

// Stay on one directed pattern until a transfer: sharing a route ID does not
// make the Red Line's two southern branches a single through service.
export function findTransitJourney(network, origin, destination) {
  if (!origin || !destination || origin === destination) return null;
  const atStation = new Map();
  const states = new Map();
  for (const pattern of network.patterns) {
    pattern.stops.forEach((stop, index) => {
      const key = `${pattern.id}:${index}`;
      const state = { key, pattern, index, stop };
      states.set(key, state);
      if (!atStation.has(stop.id)) atStation.set(stop.id, []);
      atStation.get(stop.id).push(state);
    });
  }
  if (!atStation.has(origin) || !atStation.has(destination)) return null;
  const costs = new Map(), previous = new Map(), queue = new Set();
  const walking = new Map();
  for (const [a, b] of walkingTransfers) {
    if (!atStation.has(a) || !atStation.has(b)) continue;
    if (!walking.has(a)) walking.set(a, []);
    if (!walking.has(b)) walking.set(b, []);
    walking.get(a).push(b);
    walking.get(b).push(a);
  }
  for (const state of atStation.get(origin)) {
    costs.set(state.key, 0);
    queue.add(state.key);
  }
  let target;
  while (queue.size) {
    const key = [...queue].reduce((best, next) => costs.get(next) < costs.get(best) ? next : best);
    queue.delete(key);
    const state = states.get(key);
    if (state.stop.id === destination) { target = key; break; }
    const next = states.get(`${state.pattern.id}:${state.index + 1}`);
    const neighbors = [
      ...(next ? [{ state: next, cost: 1 }] : []),
      ...atStation.get(state.stop.id).filter((other) => other.pattern.id !== state.pattern.id)
        .map((other) => ({ state: other, cost: 10000 })),
      ...(walking.get(state.stop.id) ?? []).flatMap((id) => atStation.get(id))
        .map((other) => ({ state: other, cost: 10001 })),
    ];
    for (const neighbor of neighbors) {
      const cost = costs.get(key) + neighbor.cost;
      if (cost >= (costs.get(neighbor.state.key) ?? Infinity)) continue;
      costs.set(neighbor.state.key, cost);
      previous.set(neighbor.state.key, key);
      queue.add(neighbor.state.key);
    }
  }
  if (!target) return null;
  const path = [];
  for (let key = target; key; key = previous.get(key)) path.unshift(states.get(key));
  const legs = [];
  for (const state of path) {
    const last = legs.at(-1);
    if (last?.pattern === state.pattern.id) last.stops.push(state.stop);
    else legs.push({
      pattern: state.pattern.id, route: state.pattern.route,
      direction: state.pattern.direction, destination: state.pattern.destination,
      stops: [state.stop],
    });
  }
  const riding = legs.filter((leg) => leg.stops.length > 1);
  if (!riding.length) return null;
  for (const leg of riding) {
    leg.routes = [...new Set(network.patterns.filter((pattern) => {
      if (pattern.direction !== leg.direction) return false;
      const from = pattern.stops.findIndex((stop) => stop.id === leg.stops[0].id);
      const segment = pattern.stops.slice(from, from + leg.stops.length);
      return from >= 0 && segment.length === leg.stops.length && segment.every((stop, index) => stop.id === leg.stops[index].id);
    }).map((pattern) => pattern.route))];
  }
  return {
    origin,
    destinationId: destination,
    legs: riding,
    stops: riding.flatMap((leg, index) => index && riding[index - 1].stops.at(-1).id === leg.stops[0].id ? leg.stops.slice(1) : leg.stops),
    destination: network.stops.find((stop) => stop.id === destination).name,
    stopCount: riding.reduce((sum, leg) => sum + leg.stops.length - 1, 0),
    walks: path.slice(1).flatMap((state, index) => {
      const from = path[index];
      return from.pattern.id !== state.pattern.id && from.stop.id !== state.stop.id ? [{ from: from.stop, to: state.stop }] : [];
    }),
  };
}

// MBTA predictions and schedules use platform IDs; search and routing use
// parent stations. Included platform metadata remains available for diagnostics.
export function parentStationRecords(document) {
  const parents = new Map((document.included ?? []).filter((item) => item.type === "stop")
    .map((item) => [item.id, item.relationships?.parent_station?.data?.id ?? item.id]));
  return {
    ...document,
    data: (document.data ?? []).map((item) => {
      const id = item.relationships?.stop?.data?.id;
      if (!parents.has(id)) return item;
      return {
        ...item,
        relationships: { ...item.relationships, stop: { data: { type: "stop", id: parents.get(id) } } },
      };
    }),
  };
}

export function journeyFilters(journey) {
  return {
    route: [...new Set(journey.legs.flatMap((leg) => leg.routes))].sort().join(","),
    stop: [...new Set(journey.legs.flatMap((leg) => [leg.stops[0].id, leg.stops.at(-1).id]))].sort().join(","),
  };
}
