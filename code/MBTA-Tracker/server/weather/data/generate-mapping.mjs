// Rebuild the checked-in runtime artifact from the reviewed analysis, without network access.
import { readFile, writeFile } from "node:fs/promises";

const source = new URL("../../../analysis/weather-regions/weather-station-mapping.json", import.meta.url);
const comparison = new URL("../../../analysis/weather-regions/special-split-comparison.json", import.meta.url);
const target = new URL("./regions.json", import.meta.url);
const mapping = JSON.parse(await readFile(source, "utf8"));
const reviewed = JSON.parse(await readFile(comparison, "utf8"));
if (mapping.generatedAt !== reviewed.sourceMappingGeneratedAt ||
    reviewed.recommendation.configuration !== "2.5 km plus one special split") {
  throw new Error("Reviewed split does not match the source mapping");
}
const split = reviewed.comparisons["2.5km"].appliedSplits;
if (split.length !== 1) throw new Error("Expected exactly one reviewed split");
const groups = split[0].groups;
const memberships = new Map(groups.flatMap(group => group.stationIds.map(id => [id, group.id])));
const regions = new Map();
for (const [stationId, station] of Object.entries(mapping.stations)) {
  const candidate = station.candidateRegions["2.5km"];
  if (!candidate || station.category !== "core") throw new Error(`Invalid source station ${stationId}`);
  const group = memberships.get(stationId);
  if ((candidate.weatherRegionId === split[0].regionId) !== Boolean(group)) {
    throw new Error(`Incomplete reviewed split: ${stationId}`);
  }
  const id = group ? `${candidate.weatherRegionId}--${group}` : candidate.weatherRegionId;
  if (!regions.has(id)) {
    const representativeStationId = group
      ? groups.find(item => item.id === group).representativeStationId
      : candidate.representativeStationId;
    const representative = mapping.stations[representativeStationId];
    if (!representative) throw new Error(`Missing representative ${representativeStationId}`);
    regions.set(id, { id, representativeStationId, requestedCoordinates: {
      latitude: representative.latitude, longitude: representative.longitude,
    }, stationIds: [] });
  }
  regions.get(id).stationIds.push(stationId);
}
const result = {
  gridSizeMeters: 2500,
  projection: "EPSG:32619",
  sourceMappingGeneratedAt: mapping.generatedAt,
  splitConfiguration: "Logan Airport–Seaport",
  regions: [...regions.values()].sort((a, b) => a.id.localeCompare(b.id)),
};
for (const region of result.regions) region.stationIds.sort();
if (result.regions.length !== 34 || result.regions.length !== reviewed.comparisons["2.5km"].afterSplits.regionCount) {
  throw new Error(`Unexpected region count: ${result.regions.length}`);
}
await writeFile(target, JSON.stringify(result, null, 2) + "\n");
console.log(`Wrote ${result.regions.length} regions to ${target.pathname}`);
