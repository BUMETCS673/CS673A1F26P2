
/*
 * AI-ASSISTED
 * Tool: ChatGPT (OpenAI)
 * Model: GPT-6
 * Purpose: Support multi-stop favorite routes, recent searches,
 * and default routes while preserving legacy two-stop routes.
 */

"use client";

import { useEffect, useState } from "react";

import {
  getFavoriteRoutes,
  addFavoriteRoute,
  removeFavoriteRoute,
  clearFavoriteRoutes,
  getRecentRoutes,
  addRecentRoute,
  removeRecentRoute,
  clearRecentRoutes,
  getDefaultRoute,
  setDefaultRoute,
  clearDefaultRoute,
} from "@/lib/route-cookies.mjs";

import styles from "../page.module.css";

function routeStops(route) {
  if (!route) return [];

  if (Array.isArray(route.stops)) {
    return route.stops;
  }

  return [route.origin, route.destination];
}

function sameRoute(first, second) {
  const a = routeStops(first);
  const b = routeStops(second);

  return (
    a.length >= 2 &&
    a.length === b.length &&
    a.every(
      (stop, index) =>
        typeof stop === "string" &&
        typeof b[index] === "string" &&
        stop.trim().toLowerCase() ===
          b[index].trim().toLowerCase()
    )
  );
}

export default function RouteHistory({
  origin,
  destination,
  stops,
  valid,
  stations = [],
  onChoose,
}) {
  const [favorites, setFavorites] = useState([]);
  const [recents, setRecents] = useState([]);
  const [defaultRoute, setDefault] = useState(null);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("favorites");
  const [confirmClear, setConfirmClear] = useState(null);

  const currentStops = Array.isArray(stops)
    ? stops
    : [origin, destination];

  const current = {
    origin: currentStops[0],
    destination: currentStops[currentStops.length - 1],
    stops: currentStops,
  };

  const currentKey = JSON.stringify(currentStops);

  useEffect(() => {
    let active = true;

    Promise.resolve().then(() => {
      if (!active) return;

      setFavorites(getFavoriteRoutes());
      setRecents(getRecentRoutes());
      setDefault(getDefaultRoute());
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!valid) return;

    let selectedStops;

    try {
      selectedStops = JSON.parse(currentKey);
    } catch {
      return;
    }

    if (
      !Array.isArray(selectedStops) ||
      selectedStops.length < 2 ||
      selectedStops.length > 5
    ) {
      return;
    }

    const timer = setTimeout(() => {
      setRecents(
        addRecentRoute(
          selectedStops[0],
          selectedStops[selectedStops.length - 1],
          selectedStops
        )
      );
    }, 500);

    return () => clearTimeout(timer);
  }, [currentKey, valid]);

  const stopName = (id) =>
    stations.find((station) => station.id === id)?.name ?? id;

  const known = (route) => {
    const savedStops = routeStops(route);

    return (
      savedStops.length >= 2 &&
      savedStops.every((id) =>
        stations.some((station) => station.id === id)
      )
    );
  };

  const validFavorites = favorites.filter(known);
  const validRecents = recents.filter(known);

  const activeRoutes =
    tab === "favorites" ? validFavorites : validRecents;

  const selectedIsFavorite = validFavorites.some((route) =>
    sameRoute(route, current)
  );

  const clearCount =
    confirmClear === "favorites"
      ? validFavorites.length
      : validRecents.length;

  const routeLabel = (route) =>
    routeStops(route).map(stopName).join(" → ");

  function removeFavorite(route) {
    setFavorites(
      removeFavoriteRoute(
        route.origin,
        route.destination,
        routeStops(route)
      )
    );

    setDefault(getDefaultRoute());
  }

  function toggleFavorite(route) {
    if (favorites.some((item) => sameRoute(item, route))) {
      removeFavorite(route);
      return;
    }

    const result = addFavoriteRoute(
      route.origin,
      route.destination,
      routeStops(route)
    );

    if (result.success) {
      setFavorites(result.routes);
      return;
    }

    if (result.reason === "limit") {
      window.alert("You can save up to 10 favorite routes.");
    } else if (result.reason === "duplicate") {
      setFavorites(getFavoriteRoutes());
    } else {
      window.alert("This route could not be saved.");
    }
  }

  function chooseDefault(route) {
    if (sameRoute(defaultRoute, route)) {
      clearDefaultRoute();
      setDefault(null);
      return;
    }

    const result = setDefaultRoute(
      route.origin,
      route.destination,
      routeStops(route)
    );

    if (result.success) {
      setDefault(result.route);
    }
  }

  function handleCancelDefault() {
    clearDefaultRoute();
    setDefault(null);
  }

  function runSearch(route) {
    if (typeof onChoose !== "function") return;

    onChoose({
      origin: route.origin,
      destination: route.destination,
      stops: routeStops(route),
    });
  }

  function clearSelectedList() {
    if (confirmClear === "favorites") {
      setFavorites(clearFavoriteRoutes());
      setDefault(null);
    } else if (confirmClear === "recent") {
      setRecents(clearRecentRoutes());
    }

    setConfirmClear(null);
  }

  return (
    <>
      <div className={styles.searchActions}>
        <button
          type="button"
          className={`${styles.favoriteAction} ${
            selectedIsFavorite ? styles.favoriteActionActive : ""
          }`}
          disabled={!valid}
          onClick={() => toggleFavorite(current)}
          aria-label={
            selectedIsFavorite
              ? "Remove from favorites"
              : "Add to favorites"
          }
          title={
            selectedIsFavorite
              ? "Remove from favorites"
              : "Add to favorites"
          }
        >
          {selectedIsFavorite ? "★" : "☆"}
        </button>
      </div>

      <section
        className={styles.historyPanel}
        aria-label="Saved Routes and History"
      >
        <button
          type="button"
          className={styles.historyToggle}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span
            className={styles.bookmarkIcon}
            aria-hidden="true"
          >
            ♧
          </span>

          <span className={styles.historyTitle}>
            <strong>Saved Routes &amp; History</strong>
            <small>
              {validFavorites.length} favorites ·{" "}
              {validRecents.length} recent searches
            </small>
          </span>

          <span
            className={styles.chevron}
            aria-hidden="true"
          >
            {open ? "⌃" : "⌄"}
          </span>
        </button>

        {open && (
          <div className={styles.historyBody}>
            <div
              className={styles.historyTabs}
              role="tablist"
              aria-label="Route history category"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "favorites"}
                className={
                  tab === "favorites"
                    ? styles.historyTabActive
                    : ""
                }
                onClick={() => setTab("favorites")}
              >
                ★ Favorites ({validFavorites.length})
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={tab === "recent"}
                className={
                  tab === "recent"
                    ? styles.historyTabActive
                    : ""
                }
                onClick={() => setTab("recent")}
              >
                ◷ Recent Searches ({validRecents.length})
              </button>
            </div>

            <div
              className={styles.historyList}
              role="tabpanel"
            >
              {activeRoutes.length === 0 ? (
                <p className={styles.historyEmpty}>
                  {tab === "favorites"
                    ? "No favorite routes saved yet."
                    : "No recent searches yet."}
                </p>
              ) : (
                activeRoutes.map((route) => {
                  const saved = validFavorites.some((item) =>
                    sameRoute(item, route)
                  );

                  const isDefault = sameRoute(
                    defaultRoute,
                    route
                  );

                  const label = routeLabel(route);

                  return (
                    <div
                      className={styles.historyRow}
                      key={JSON.stringify(routeStops(route))}
                    >
                      <button
                        type="button"
                        className={`${styles.rowStar} ${
                          saved ? styles.rowStarSaved : ""
                        }`}
                        aria-label={
                          saved
                            ? `Remove ${label} from favorites`
                            : `Favorite ${label}`
                        }
                        onClick={() => toggleFavorite(route)}
                      >
                        {saved ? "★" : "☆"}
                      </button>

                      <button
                        type="button"
                        className={styles.routeChoice}
                        onClick={() => runSearch(route)}
                        title="Use this route"
                      >
                        <span>{label}</span>

                        <span
                          className={styles.rowChevron}
                          aria-hidden="true"
                        >
                          ›
                        </span>
                      </button>

                      {tab === "favorites" && (
                        <button
                          type="button"
                          className={`${styles.defaultButton} ${
                            isDefault
                              ? styles.defaultButtonActive
                              : ""
                          }`}
                          aria-pressed={isDefault}
                          aria-label={
                            isDefault
                              ? `Cancel default route ${label}`
                              : `Set ${label} as default route`
                          }
                          onClick={() => {
                            if (isDefault) {
                              handleCancelDefault();
                            } else {
                              chooseDefault(route);
                            }
                          }}
                        >
                          {isDefault
                            ? "📌 Default"
                            : "Set Default"}
                        </button>
                      )}

                      <button
                        type="button"
                        className={styles.rowDelete}
                        aria-label={`Delete ${label} from ${tab}`}
                        onClick={() => {
                          if (tab === "favorites") {
                            removeFavorite(route);
                          } else {
                            setRecents(
                              removeRecentRoute(
                                route.origin,
                                route.destination,
                                routeStops(route)
                              )
                            );
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              className={styles.clearHistory}
              disabled={activeRoutes.length === 0}
              onClick={() => setConfirmClear(tab)}
            >
              <span aria-hidden="true">♜</span>{" "}
              Clear{" "}
              {tab === "favorites"
                ? "Favorites"
                : "Recent Searches"}
            </button>
          </div>
        )}
      </section>

      {confirmClear && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setConfirmClear(null);
            }
          }}
        >
          <div
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-title"
            aria-describedby="clear-description"
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setConfirmClear(null)}
              aria-label="Close"
            >
              ×
            </button>

            <div
              className={styles.modalDeleteIcon}
              aria-hidden="true"
            >
              ▤
            </div>

            <h2 id="clear-title">
              Clear{" "}
              {confirmClear === "favorites"
                ? "Favorites"
                : "Recent Searches"}
              ?
            </h2>

            <p id="clear-description">
              {confirmClear === "favorites"
                ? `This will remove all ${clearCount} saved favorite routes and cancel your default route, if one is set. Your recent searches will be kept.`
                : `This will remove all recent search history (${clearCount} routes). Your favorite routes will be kept.`}
            </p>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setConfirmClear(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className={styles.confirmButton}
                onClick={clearSelectedList}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
