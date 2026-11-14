/*
 * AI Tool Assist
 * Tool: Codex and ChatGPT
 * Prompt Summary: Load the reviewed station-to-weather-region mapping and validate its assignments.
 * AI Contribution: (~75%)
 *
 * Description:
 * Reads the local region mapping and verifies region coordinates and station coverage.
 *
 * loadRegions(): Returns validated regions and a station-to-region lookup.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WEATHER_CONFIG } from "./config.mjs";
import bundledRegions from "./data/regions.json" with { type: "json" };

/** Load the reviewed local mapping; errors indicate a deployment or data defect. */
export function loadRegions(url = WEATHER_CONFIG.REGION_MAPPING_URL) {
  // Bundlers turn the default JSON URL into a static asset URL, so use the imported data.
  const data = url === WEATHER_CONFIG.REGION_MAPPING_URL
    ? structuredClone(bundledRegions)
    : JSON.parse(readFileSync(typeof url === "string" ? url : fileURLToPath(url.href), "utf8"));
  if (data.gridSizeMeters !== 2500 || data.splitConfiguration !== "Logan Airport–Seaport" ||
      !Array.isArray(data.regions) || data.regions.length !== 34) throw new Error("Wrong or incomplete weather region mapping");
  const byStation = new Map();
  const ids = new Set();
  for (const region of data.regions) {
    if (!region.id || ids.has(region.id) || !Array.isArray(region.stationIds) || !region.stationIds.length) throw new Error("Invalid or duplicate weather region");
    ids.add(region.id);
    const { latitude, longitude } = region.requestedCoordinates ?? {};
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        !region.stationIds.includes(region.representativeStationId)) throw new Error(`Invalid representative for ${region.id}`);
    for (const stationId of region.stationIds) {
      if (typeof stationId !== "string" || !stationId || byStation.has(stationId)) throw new Error(`Duplicate station assignment ${stationId}`);
      byStation.set(stationId, region.id);
    }
  }
  if (byStation.size !== 164) throw new Error("Missing core station assignments");
  return { regions: data.regions, byStation };
}
