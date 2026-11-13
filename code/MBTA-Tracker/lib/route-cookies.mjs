
/*
 * AI-ASSISTED
 * Tool: ChatGPT (OpenAI)
 * Model: GPT-6
 * Prompt Summary: Implement cookie-based favorite routes,
 * recent searches, persistent default routes, and deletion.
 * AI Contribution: Used as a reference for code examples,
 * troubleshooting, and testing suggestions. Suggestions
 * were reviewed, adapted, and manually tested.
 */

const FAVORITES_COOKIE = "mbta_favorite_routes";
const RECENTS_COOKIE = "mbta_recent_routes";
const DEFAULT_ROUTE_COOKIE = "mbta_default_route";

const MAX_FAVORITES = 10;
const MAX_RECENTS = 10;

const FAVORITES_DAYS = 90;
const RECENTS_DAYS = 30;
const DEFAULT_ROUTE_DAYS = 365;

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

function isValidRoute(origin, destination) {
  return (
    typeof origin === "string" &&
    typeof destination === "string" &&
    origin.length > 0 &&
    destination.length > 0 &&
    origin !== destination
  );
}

// Favorite Routes

export function getFavoriteRoutes() {
  const routes = readCookie(FAVORITES_COOKIE);
  return Array.isArray(routes) ? routes : [];
}

export function addFavoriteRoute(origin, destination) {
  if (!isValidRoute(origin, destination)) {
    return { success: false, reason: "invalid" };
  }

  const routes = getFavoriteRoutes();

  if (
    routes.some(
      (route) =>
        route.origin === origin &&
        route.destination === destination
    )
  ) {
    return { success: false, reason: "duplicate" };
  }

  if (routes.length >= MAX_FAVORITES) {
    return { success: false, reason: "limit" };
  }

  const updated = [...routes, { origin, destination }];

  writeCookie(FAVORITES_COOKIE, updated, FAVORITES_DAYS);

  return { success: true, routes: updated };
}

export function removeFavoriteRoute(origin, destination) {
  const updated = getFavoriteRoutes().filter(
    (route) =>
      !(
        route.origin === origin &&
        route.destination === destination
      )
  );

  writeCookie(FAVORITES_COOKIE, updated, FAVORITES_DAYS);

  const currentDefault = getDefaultRoute();

  if (
    currentDefault &&
    currentDefault.origin === origin &&
    currentDefault.destination === destination
  ) {
    clearDefaultRoute();
  }

  return updated;
}

export function clearFavoriteRoutes() {
  writeCookie(FAVORITES_COOKIE, [], FAVORITES_DAYS);
  clearDefaultRoute();
  return [];
}

export function isFavoriteRoute(origin, destination) {
  return getFavoriteRoutes().some(
    (route) =>
      route.origin === origin &&
      route.destination === destination
  );
}

// Recent Searches

export function getRecentRoutes() {
  const routes = readCookie(RECENTS_COOKIE);
  return Array.isArray(routes) ? routes : [];
}

export function addRecentRoute(origin, destination) {
  if (!isValidRoute(origin, destination)) return [];

  const withoutDuplicate = getRecentRoutes().filter(
    (route) =>
      !(
        route.origin === origin &&
        route.destination === destination
      )
  );

  const updated = [
    { origin, destination },
    ...withoutDuplicate,
  ].slice(0, MAX_RECENTS);

  writeCookie(RECENTS_COOKIE, updated, RECENTS_DAYS);

  return updated;
}

export function removeRecentRoute(origin, destination) {
  const updated = getRecentRoutes().filter(
    (route) =>
      !(
        route.origin === origin &&
        route.destination === destination
      )
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
  const route = readCookie(DEFAULT_ROUTE_COOKIE);

  if (
    !route ||
    !isValidRoute(route.origin, route.destination)
  ) {
    return null;
  }

  if (!isFavoriteRoute(route.origin, route.destination)) {
    clearDefaultRoute();
    return null;
  }

  return {
    origin: route.origin,
    destination: route.destination,
  };
}

export function setDefaultRoute(origin, destination) {
  if (!isValidRoute(origin, destination)) {
    return { success: false, reason: "invalid" };
  }

  if (!isFavoriteRoute(origin, destination)) {
    return { success: false, reason: "not-favorite" };
  }

  const route = { origin, destination };

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
