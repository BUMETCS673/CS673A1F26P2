import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });

  if (!response.ok) throw new Error(`MBTA returned ${response.status}`);

  return response.json();
}

// Use only official rail routes and Silver Line bus routes. No API key needed.
const saved = process.argv[2];

const routesDocument = saved
  ? JSON.parse(await fs.readFile(path.join(saved, "network-routes.json"), "utf8"))
  : {
      rail: await get("https://api-v3.mbta.com/routes?filter[type]=0,1"),
      bus: await get("https://api-v3.mbta.com/routes?filter[type]=3"),
    };

const routes = [
  ...routesDocument.rail.data,
  ...routesDocument.bus.data.filter((route) =>
    route.attributes.short_name.startsWith("SL"),
  ),
];

const sourceUrl =
  "https://api-v3.mbta.com/route_patterns?filter[route]=" +
  routes.map((route) => route.id).join(",") +
  "&include=representative_trip.stops,representative_trip.stops.parent_station";

const document = saved
  ? JSON.parse(await fs.readFile(path.join(saved, "network-patterns.json"), "utf8"))
  : await get(sourceUrl);

const included = new Map(
  document.included.map((item) => [item.type + ":" + item.id, item]),
);

const stations = {};

const patterns = document.data
  .filter(
    (pattern) =>
      pattern.attributes.canonical ||
      (/^\d/.test(pattern.relationships.route.data.id) &&
        pattern.attributes.typicality === 1),
  )
  .map((pattern) => {
    const route = pattern.relationships.route.data.id;

    const trip = included.get(
      "trip:" + pattern.relationships.representative_trip.data.id,
    );

    const stops = [];

    for (const ref of trip.relationships.stops.data) {
      const platform = included.get("stop:" + ref.id);
      const id = platform.relationships.parent_station.data?.id ?? platform.id;
      const station = included.get("stop:" + id) ?? platform;

      stations[id] ??= {
        id,
        name: station.attributes.name,
        latitude: station.attributes.latitude,
        longitude: station.attributes.longitude,
        routes: [],
      };

      if (!stations[id].routes.includes(route)) stations[id].routes.push(route);

      if (stops.at(-1) !== id) stops.push(id);
    }

    return { id: pattern.id, route, direction: pattern.attributes.direction_id, stops };
  });

const output = {
  generatedAt: new Date().toISOString(),
  source: "MBTA V3 canonical rail patterns and typical Silver Line patterns",
  sourceUrl,
  routes: routes.map((route) => ({
    id: route.id,
    name: route.attributes.long_name,
    label:
      route.attributes.short_name || route.attributes.long_name.replace(" Line", ""),
    color: "#" + route.attributes.color,
  })),
  stations,
  patterns,
};

await fs.mkdir(path.join(appRoot, "app/data"), { recursive: true });

await fs.writeFile(
  path.join(appRoot, "app/data/subway-network.json"),
  JSON.stringify(output, null, 2) + "\n",
);

console.log(
  JSON.stringify({
    routes: routes.length,
    stations: Object.keys(stations).length,
    patterns: patterns.length,
  }),
);
