// AI-ASSISTED: Codex — adapt feature/cookies controls to dev's multi-stop planner.
'use client';
import { useEffect, useState } from 'react';
import { getFavoriteRoutes, addFavoriteRoute, removeFavoriteRoute, clearFavoriteRoutes,
  getRecentRoutes, addRecentRoute, removeRecentRoute, clearRecentRoutes,
  getDefaultRoute, setDefaultRoute, clearDefaultRoute } from '@/lib/route-cookies.mjs';
import styles from '../page.module.css';

const same = (a, b) => a?.origin === b?.origin && a?.destination === b?.destination;
export default function RouteHistory({ origin, destination, valid, stations, onChoose }) {
  const [favorites, setFavorites] = useState([]);
  const [recents, setRecents] = useState([]);
  const [defaultRoute, setDefault] = useState(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('favorites');
  const [confirmClear, setConfirmClear] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setFavorites(getFavoriteRoutes()); setRecents(getRecentRoutes()); setDefault(getDefaultRoute());
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!valid) return;
    // Record completed selections, not transient edits while choosing stations.
    const timer = setTimeout(() => setRecents(addRecentRoute(origin, destination)), 500);
    return () => clearTimeout(timer);
  }, [origin, destination, valid]);
  const name = id => stations.find(s => s.id === id)?.name ?? id;
  const known = route => route && stations.some(s => s.id === route.origin) && stations.some(s => s.id === route.destination);
  const current = { origin, destination };
  function remove(route) {
    setFavorites(removeFavoriteRoute(route.origin, route.destination));
    setDefault(getDefaultRoute());
  }
  function toggle(route) {
    if (favorites.some(item => same(item, route))) { remove(route); return; }
    const result = addFavoriteRoute(route.origin, route.destination);
    if (result.success) { setFavorites(result.routes); }
    else window.alert(result.reason === 'limit' ? 'You can save up to 10 favorite routes.' : 'This route could not be saved.');
  }
  function chooseDefault(route) {
    if (same(defaultRoute, route)) { clearDefaultRoute(); setDefault(null); }
    else { const result = setDefaultRoute(route.origin, route.destination); if (result.success) setDefault(result.route); }
  }
  // Preserve feature/cookies markup while adapting it to the selected segment.
  const validFavorites = favorites.filter(known), validRecents = recents.filter(known);
  const historyOpen = open, setHistoryOpen = setOpen;
  const historyTab = tab, setHistoryTab = setTab;
  const activeRoutes = tab === 'favorites' ? validFavorites : validRecents;
  const clearCount = confirmClear === 'favorites' ? validFavorites.length : validRecents.length;
  const stopName = name, toggleFavorite = toggle, setRecentRoutes = setRecents;
  const isDefaultRoute = route => same(defaultRoute, route);
  const handleSetDefault = chooseDefault;
  const handleCancelDefault = () => { clearDefaultRoute(); setDefault(null); };
  const removeFavorite = (origin, destination) => remove({ origin, destination });
  const runSearch = (origin, destination) => onChoose({ origin, destination });
  const selectedIsFavorite = validFavorites.some(route => same(route, current));
  function clearSelectedList() {
    if (confirmClear === 'favorites') { setFavorites(clearFavoriteRoutes()); setDefault(null); }
    else setRecents(clearRecentRoutes());
    setConfirmClear(null);
  }
  return <>
    <div className={styles.searchActions}>
      <button type="button" className={`${styles.favoriteAction} ${selectedIsFavorite ? styles.favoriteActionActive : ''}`}
        disabled={!valid} onClick={() => toggleFavorite(current)}
        aria-label={selectedIsFavorite ? 'Remove from favorites' : 'Add to favorites'}
        title={selectedIsFavorite ? 'Remove from favorites' : 'Add to favorites'}>
        {selectedIsFavorite ? '★' : '☆'}
      </button>
    </div>
              <section
                className={styles.historyPanel}
                aria-label="Saved Routes and History"
              >
                <button
                  type="button"
                  className={styles.historyToggle}
                  aria-expanded={historyOpen}
                  onClick={() =>
                    setHistoryOpen((value) => !value)
                  }
                >
                  <span
                    className={styles.bookmarkIcon}
                    aria-hidden="true"
                  >
                    ♧
                  </span>

                  <span className={styles.historyTitle}>
                    <strong>
                      Saved Routes &amp; History
                    </strong>
                    <small>
                      {validFavorites.length} favorites ·{" "}
                      {validRecents.length} recent searches
                    </small>
                  </span>

                  <span
                    className={styles.chevron}
                    aria-hidden="true"
                  >
                    {historyOpen ? "⌃" : "⌄"}
                  </span>
                </button>

                {historyOpen && (
                  <div className={styles.historyBody}>
                    <div
                      className={styles.historyTabs}
                      role="tablist"
                      aria-label="Route history category"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={
                          historyTab === "favorites"
                        }
                        className={
                          historyTab === "favorites"
                            ? styles.historyTabActive
                            : ""
                        }
                        onClick={() =>
                          setHistoryTab("favorites")
                        }
                      >
                        ★ Favorites ({validFavorites.length})
                      </button>

                      <button
                        type="button"
                        role="tab"
                        aria-selected={
                          historyTab === "recent"
                        }
                        className={
                          historyTab === "recent"
                            ? styles.historyTabActive
                            : ""
                        }
                        onClick={() =>
                          setHistoryTab("recent")
                        }
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
                          {historyTab === "favorites"
                            ? "No favorite routes saved yet."
                            : "No recent searches yet."}
                        </p>
                      ) : (
                        activeRoutes.map((route) => {
                          const saved = validFavorites.some(
                            (item) =>
                              item.origin === route.origin &&
                              item.destination === route.destination
                          );

                          const isDefault = isDefaultRoute(route);

                          return (
                            <div
                              className={styles.historyRow}
                              key={`${route.origin}-${route.destination}`}
                            >
                              <button
                                type="button"
                                className={`${styles.rowStar} ${
                                  saved ? styles.rowStarSaved : ""
                                }`}
                                aria-label={
                                  saved
                                    ? `Remove ${stopName(route.origin)} to ${stopName(route.destination)} from favorites`
                                    : `Favorite ${stopName(route.origin)} to ${stopName(route.destination)}`
                                }
                                onClick={() =>
                                  toggleFavorite(route)
                                }
                              >
                                {saved ? "★" : "☆"}
                              </button>

                              <button
                                type="button"
                                className={styles.routeChoice}
                                onClick={() =>
                                  runSearch(
                                    route.origin,
                                    route.destination
                                  )
                                }
                                title="Use this route"
                              >
                                <span>
                                  {stopName(route.origin)}{" "}
                                  →{" "}
                                  {stopName(route.destination)}
                                </span>

                                <span
                                  className={styles.rowChevron}
                                  aria-hidden="true"
                                >
                                  ›
                                </span>
                              </button>

                              {historyTab === "favorites" && (
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
                                      ? `Cancel default route ${stopName(route.origin)} to ${stopName(route.destination)}`
                                      : `Set ${stopName(route.origin)} to ${stopName(route.destination)} as default route`
                                  }
                                  onClick={() => {
                                    if (isDefault) {
                                      handleCancelDefault();
                                    } else {
                                      handleSetDefault(route);
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
                                aria-label={`Delete ${stopName(route.origin)} to ${stopName(route.destination)} from ${historyTab}`}
                                onClick={() => {
                                  if (historyTab === "favorites") {
                                    removeFavorite(
                                      route.origin,
                                      route.destination
                                    );
                                  } else {
                                    setRecentRoutes(
                                      removeRecentRoute(
                                        route.origin,
                                        route.destination
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
                      onClick={() =>
                        setConfirmClear(historyTab)
                      }
                    >
                      <span aria-hidden="true">♜</span>{" "}
                      Clear{" "}
                      {historyTab === "favorites"
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
                ? `This will remove all ${clearCount} saved favorite routes. Your recent searches will be kept.`
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

  </>;
}
