
/*
 * AI-ASSISTED
 * Tool: ChatGPT (OpenAI)
 * Model: GPT-6
 * Prompt Summary: Implement cookie-based favorite routes,
 * recent searches, persistent default routes, deletion,
 * and multi-stop route support with legacy compatibility.
 * AI Contribution: Used as a reference for code examples,
 * troubleshooting, and testing suggestions. Suggestions
 * were reviewed and adapted for the project.
 */

const FAVORITES_COOKIE = "mbta_favorite_routes";
const RECENTS_COOKIE = "mbta_recent_routes";
const DEFAULT_ROUTE_COOKIE = "mbta_default_route";

const MAX_FAVORITES = 10;
const MAX_RECENTS = 10;
const MAX_STOPS = 5;

const FAVORITES_DAYS = 90;
const RECENTS_DAYS = 30;
const DEFAULT_ROUTE_DAYS = 90;

// Cookie helpers

function readCookie(name) {
  if (typeof document === "undefined") return null;

  const prefix = `${name}=`;
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(prefix));

  if (!cookie) return null;

  try {
    return JSON.parse(
      decodeURIComponent(cookie.slice(prefix.length))
    );
  } catch {
    return null;
  }
}

function writeCookie(name, value, days) {
  if (typeof document === "undefined") return;

  const maxAge = Math.floor(days * 24 * 60 * 60);

  document.cookie =
    `${name}=${encodeURIComponent(JSON.stringify(value))}; ` +
    `Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

function deleteCookie(name) {
  if (typeof document === "undefined") return;

  document.cookie =
    `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

// Route helpers

function normalizeStops(origin, destination, stops) {
  let values;

  if (Array.isArray(origin)) {
    values = origin;
  } else if (Array.isArray(stops)) {
    values = stops;
  } else {
    values = [origin, destination];
  }

  if (
    values.length < 2 ||
    values.length > MAX_STOPS ||
    values.some(
      (stop) =>
        typeof stop !== "string" ||
        stop.trim().length === 0
    )
  ) {
    return null;
  }

  const normalized = values.map((stop) => stop.trim());

  if (
    new Set(normalized.map((stop) => stop.toLowerCase()))
      .size !== normalized.length
  ) {
    return null;
  }

  return normalized;
}

function makeRoute(origin, destination, stops) {
  const normalized = normalizeStops(
    origin,
    destination,
    stops
  );

  if (!normalized) return null;

  return {
    origin: normalized[0],
    destination: normalized[normalized.length - 1],
    stops: normalized,
  };
}

function normalizeStoredRoute(route) {
  if (!route || typeof route !== "object") return null;

  if (Array.isArray(route.stops)) {
    const normalized = makeRoute(route.stops);

    if (!normalized) return null;

    if (
      route.origin !== normalized.origin ||
      route.destination !== normalized.destination
    ) {
      return null;
    }

    return normalized;
  }

  return makeRoute(route.origin, route.destination);
}

function readRoutes(cookieName) {
  const stored = readCookie(cookieName);

  if (!Array.isArray(stored)) return [];

  return stored
    .map(normalizeStoredRoute)
    .filter(Boolean);
}

function sameRoute(first, second) {
  if (!first || !second) return false;

  return (
    first.stops.length === second.stops.length &&
    first.stops.every(
      (stop, index) =>
        stop.toLowerCase() ===
        second.stops[index].toLowerCase()
    )
  );
}

// Favorite Routes

export function getFavoriteRoutes() {
  return readRoutes(FAVORITES_COOKIE);
}

export function addFavoriteRoute(origin, destination, stops) {
  const route = makeRoute(origin, destination, stops);

  if (!route) {
    return { success: false, reason: "invalid" };
  }

  const routes = getFavoriteRoutes();

  if (routes.some((item) => sameRoute(item, route))) {
    return { success: false, reason: "duplicate" };
  }

  if (routes.length >= MAX_FAVORITES) {
    return { success: false, reason: "limit" };
  }

  const updated = [...routes, route];

  writeCookie(FAVORITES_COOKIE, updated, FAVORITES_DAYS);

  return { success: true, routes: updated };
}

export function removeFavoriteRoute(
  origin,
  destination,
  stops
) {
  const route = makeRoute(origin, destination, stops);

  if (!route) return getFavoriteRoutes();

  const updated = getFavoriteRoutes().filter(
    (item) => !sameRoute(item, route)
  );

  writeCookie(FAVORITES_COOKIE, updated, FAVORITES_DAYS);

  const currentDefault = getDefaultRoute();

  if (sameRoute(currentDefault, route)) {
    clearDefaultRoute();
  }

  return updated;
}

export function clearFavoriteRoutes() {
  writeCookie(FAVORITES_COOKIE, [], FAVORITES_DAYS);
  clearDefaultRoute();
  return [];
}

export function isFavoriteRoute(
  origin,
  destination,
  stops
) {
  const route = makeRoute(origin, destination, stops);

  if (!route) return false;

  return getFavoriteRoutes().some(
    (item) => sameRoute(item, route)
  );
}

// Recent Searches

export function getRecentRoutes() {
  return readRoutes(RECENTS_COOKIE);
}

export function addRecentRoute(
  origin,
  destination,
  stops
) {
  const route = makeRoute(origin, destination, stops);

  if (!route) return getRecentRoutes();

  const withoutDuplicate = getRecentRoutes().filter(
    (item) => !sameRoute(item, route)
  );

  const updated = [
    route,
    ...withoutDuplicate,
  ].slice(0, MAX_RECENTS);

  writeCookie(RECENTS_COOKIE, updated, RECENTS_DAYS);

  return updated;
}

export function removeRecentRoute(
  origin,
  destination,
  stops
) {
  const route = makeRoute(origin, destination, stops);

  if (!route) return getRecentRoutes();

  const updated = getRecentRoutes().filter(
    (item) => !sameRoute(item, route)
  );

  writeCookie(RECENTS_COOKIE, updated, RECENTS_DAYS);

  return updated;
}

export function clearRecentRoutes() {
  writeCookie(RECENTS_COOKIE, [], RECENTS_DAYS);
  return [];
}

// Default Route

export function getDefaultRoute() {
  const stored = readCookie(DEFAULT_ROUTE_COOKIE);
  const route = normalizeStoredRoute(stored);

  if (!route) return null;

  const favorite = getFavoriteRoutes().find(
    (item) => sameRoute(item, route)
  );

  if (!favorite) {
    clearDefaultRoute();
    return null;
  }

  return favorite;
}

export function renewDefaultRoute() {
  const route = getDefaultRoute();

  if (!route) return false;

  const favorites = getFavoriteRoutes();

  writeCookie(
    FAVORITES_COOKIE,
    favorites,
    FAVORITES_DAYS
  );

  writeCookie(
    DEFAULT_ROUTE_COOKIE,
    route,
    DEFAULT_ROUTE_DAYS
  );

  return true;
}

export function setDefaultRoute(
  origin,
  destination,
  stops
) {
  const route = makeRoute(origin, destination, stops);

  if (!route) {
    return { success: false, reason: "invalid" };
  }

  if (
    !getFavoriteRoutes().some(
      (item) => sameRoute(item, route)
    )
  ) {
    return { success: false, reason: "not-favorite" };
  }

  writeCookie(
    DEFAULT_ROUTE_COOKIE,
    route,
    DEFAULT_ROUTE_DAYS
  );

  return { success: true, route };
}

export function clearDefaultRoute() {
  deleteCookie(DEFAULT_ROUTE_COOKIE);
  return null;
}
