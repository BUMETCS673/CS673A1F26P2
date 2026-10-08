const MBTA_API_BASE_URL = "https://api-v3.mbta.com";
const GREEN_LINE_ROUTE_IDS = ["Green-B", "Green-C", "Green-D", "Green-E"];
const DEFAULT_GREEN_LINE_ROUTES = GREEN_LINE_ROUTE_IDS.join(",");
const REQUEST_TIMEOUT_MS = 10000;

const CACHE_SECONDS = {
  vehicles: 10,
  predictions: 15,
  alerts: 60,
  schedules: 300,
};

class MbtaApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "MbtaApiError";
    this.status = status;
  }
}

/**
 * Fetch Green Line vehicle data from MBTA V3.
 *
 * @param {{ route?: string|string[], direction_id?: string|number, include?: string }} [params]
 * @returns {Promise<object>} Original MBTA JSON:API response.
 */
async function getVehicles(params = {}) {
  const query = buildMbtaQuery(params, {
    filters: ["route", "direction_id"],
    passthrough: ["include"],
    defaultRoute: DEFAULT_GREEN_LINE_ROUTES,
  });

  return fetchMbtaJson("/vehicles", query, CACHE_SECONDS.vehicles);
}

/**
 * Fetch prediction data from MBTA V3.
 *
 * @param {{ route?: string|string[], stop?: string, trip?: string, direction_id?: string|number, include?: string }} [params]
 * @returns {Promise<object>} Original MBTA JSON:API response.
 */
async function getPredictions(params = {}) {
  requireAtLeastOneFilter(params, ["route", "stop", "trip"]);

  const query = buildMbtaQuery(params, {
    filters: ["route", "stop", "trip", "direction_id"],
    passthrough: ["include"],
  });

  return fetchMbtaJson("/predictions", query, CACHE_SECONDS.predictions);
}

/**
 * Fetch active Green Line alert data from MBTA V3.
 *
 * @param {{ route?: string|string[], stop?: string, datetime?: string, direction_id?: string|number }} [params]
 * @returns {Promise<object>} Original MBTA JSON:API response.
 */
async function getAlerts(params = {}) {
  const query = buildMbtaQuery(
    {
      ...params,
      datetime: params.datetime ?? "NOW",
    },
    {
      filters: ["route", "stop", "datetime", "direction_id"],
      defaultRoute: DEFAULT_GREEN_LINE_ROUTES,
    },
  );

  return fetchMbtaJson("/alerts", query, CACHE_SECONDS.alerts);
}

/**
 * Fetch planned schedule data from MBTA V3.
 *
 * @param {{ route?: string|string[], stop?: string, trip?: string, direction_id?: string|number, date?: string, min_time?: string, max_time?: string, stop_sequence?: string|number, include?: string, limit?: string|number, offset?: string|number, page_limit?: string|number, page_offset?: string|number }} [params]
 * @returns {Promise<object>} Original MBTA JSON:API response.
 */
async function getSchedules(params = {}) {
  requireAtLeastOneFilter(params, ["route", "stop", "trip"]);

  const query = buildMbtaQuery(params, {
    filters: ["route", "stop", "trip", "direction_id", "date", "min_time", "max_time", "stop_sequence"],
    passthrough: ["include"],
    pagination: true,
  });

  return fetchMbtaJson("/schedules", query, CACHE_SECONDS.schedules);
}

function buildMbtaQuery(params, options) {
  const query = new URLSearchParams();
  const route = params.route ?? options.defaultRoute;

  if (route) {
    const routeFilter = normalizeRouteFilter(route);
    query.set("filter[route]", routeFilter);
  }

  for (const filter of options.filters) {
    if (filter === "route") {
      continue;
    }

    appendQueryValue(query, `filter[${filter}]`, params[filter]);
  }

  for (const param of options.passthrough ?? []) {
    appendQueryValue(query, param, params[param]);
  }

  if (options.pagination) {
    appendQueryValue(query, "page[limit]", params.page_limit ?? params.limit);
    appendQueryValue(query, "page[offset]", params.page_offset ?? params.offset);
  }

  return query;
}

function appendQueryValue(query, key, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (Array.isArray(value)) {
    query.set(key, value.join(","));
    return;
  }

  query.set(key, String(value));
}

function normalizeRouteFilter(route) {
  const routes = Array.isArray(route) ? route : String(route).split(",");
  const normalizedRoutes = routes.map((value) => value.trim()).filter(Boolean);
  const invalidRoutes = normalizedRoutes.filter((value) => !GREEN_LINE_ROUTE_IDS.includes(value));

  if (normalizedRoutes.length === 0) {
    throw new MbtaApiError("At least one route must be provided.", 400);
  }

  if (invalidRoutes.length > 0) {
    throw new MbtaApiError("Route filter is limited to Green-B, Green-C, Green-D, and Green-E.", 400);
  }

  return normalizedRoutes.join(",");
}

function requireAtLeastOneFilter(params, filters) {
  const hasRequiredFilter = filters.some((filter) => {
    const value = params[filter];
    return value !== undefined && value !== null && value !== "";
  });

  if (!hasRequiredFilter) {
    throw new MbtaApiError(`One of these filters is required: ${filters.join(", ")}.`, 400);
  }
}

async function fetchMbtaJson(path, query, revalidate) {
  const url = buildMbtaUrl(path, query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: buildMbtaHeaders(),
      next: { revalidate },
      signal: controller.signal,
    });

    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throw new MbtaApiError(getMbtaErrorMessage(response.status, payload), mapMbtaStatus(response.status));
    }

    return payload;
  } catch (error) {
    if (error instanceof MbtaApiError) {
      throw error;
    }

    if (error.name === "AbortError") {
      throw new MbtaApiError("MBTA API request timed out.", 504);
    }

    throw new MbtaApiError("Unable to reach MBTA API.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function buildMbtaUrl(path, query) {
  const url = new URL(path, MBTA_API_BASE_URL);
  url.search = query.toString();
  return url.toString();
}

function buildMbtaHeaders() {
  const headers = {
    Accept: "application/vnd.api+json",
  };

  if (process.env.MBTA_API_KEY) {
    headers["x-api-key"] = process.env.MBTA_API_KEY;
  }

  return headers;
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    throw new MbtaApiError("MBTA API returned an invalid JSON response.", 502);
  }
}

function getMbtaErrorMessage(status, payload) {
  if (status === 429) {
    return "MBTA API rate limit exceeded.";
  }

  if (Array.isArray(payload?.errors) && payload.errors[0]?.detail) {
    return `MBTA API request failed: ${payload.errors[0].detail}`;
  }

  return "MBTA API request failed.";
}

function mapMbtaStatus(status) {
  if (status === 400) {
    return 400;
  }

  if (status === 401 || status === 403) {
    return 502;
  }

  if (status === 429) {
    return 429;
  }

  return 502;
}

export {
  CACHE_SECONDS,
  GREEN_LINE_ROUTE_IDS,
  MbtaApiError,
  getAlerts,
  getPredictions,
  getSchedules,
  getVehicles,
};

// Canonical stop patterns give platform order for each travel direction.
export async function getBNetwork() {
  const query = new URLSearchParams({ "filter[route]": "Green-B", include: "representative_trip.stops,representative_trip.stops.parent_station" });
  const document = await fetchMbtaJson("/route_patterns", query, 3600);
  const included = new Map((document.included ?? []).map((item) => [`${item.type}:${item.id}`, item]));
  const patterns = document.data.filter((item) => item.attributes.canonical).map((pattern) => {
    const trip = included.get(`trip:${pattern.relationships.representative_trip.data.id}`);
    const stops = [];
    for (const ref of trip?.relationships.stops?.data ?? []) {
      const platform = included.get(`stop:${ref.id}`);
      if (!platform) continue;
      const id = platform.relationships?.parent_station?.data?.id ?? platform.id;
      const station = included.get(`stop:${id}`) ?? platform;
      const previous = stops[stops.length - 1];
      if (previous?.id === id) previous.platforms.push(platform.id);
      else stops.push({ id, name: station.attributes.name, platforms: [platform.id] });
    }
    return { direction: pattern.attributes.direction_id, destination: trip?.attributes.headsign, stops };
  });
  if (patterns.length < 2 || patterns.some((pattern) => !pattern.stops.length)) throw new MbtaApiError("B-branch stop patterns are unavailable.", 502);
  return { patterns, stops: patterns.find((pattern) => pattern.direction === 0).stops };
}
