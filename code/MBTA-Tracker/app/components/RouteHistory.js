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
  const [message, setMessage] = useState('');
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
    if (result.success) { setFavorites(result.routes); setMessage('Route saved.'); }
    else setMessage(result.reason === 'limit' ? 'You can save up to 10 favorite routes.' : 'This route could not be saved.');
  }
  function chooseDefault(route) {
    if (same(defaultRoute, route)) { clearDefaultRoute(); setDefault(null); }
    else { const result = setDefaultRoute(route.origin, route.destination); if (result.success) setDefault(result.route); }
  }
  const routes = (tab === 'favorites' ? favorites : recents).filter(known);
  return <section className={styles.historyPanel} aria-label="Saved routes and history">
    <div className={styles.searchActions}>
      <button type="button" className={styles.favoriteAction} disabled={!valid} onClick={() => toggle(current)}
        aria-label={favorites.some(r => same(r, current)) ? 'Remove selected segment from favorites' : 'Save selected segment as favorite'}>
        {favorites.some(r => same(r, current)) ? '★' : '☆'}
      </button>
      <span className={styles.small}>Save the selected segment. Saved routes contain two stations, without leave times.</span>
    </div>
    <button type="button" className={styles.historyToggle} aria-expanded={open} onClick={() => setOpen(!open)}>
      Saved Routes &amp; History · {favorites.length} favorites · {recents.length} recent
    </button>
    {message && <p role="status" className={styles.small}>{message}</p>}
    {open && <div className={styles.historyBody}>
      <div className={styles.historyTabs}>
        {['favorites', 'recent'].map(value => <button key={value} type="button" aria-pressed={tab === value}
          className={tab === value ? styles.historyTabActive : ''} onClick={() => setTab(value)}>{value === 'favorites' ? 'Favorites' : 'Recent searches'}</button>)}
      </div>
      <p className={styles.small}>Choosing a saved route replaces the current itinerary with that station pair.</p>
      <div className={styles.historyList}>
        {!routes.length && <p className={styles.historyEmpty}>No saved routes yet.</p>}
        {routes.map(route => <div className={styles.historyRow} key={`${route.origin}:${route.destination}`}>
          <button type="button" className={styles.rowStar} onClick={() => toggle(route)} aria-label={`Toggle favorite ${name(route.origin)} to ${name(route.destination)}`}>{favorites.some(r => same(r, route)) ? '★' : '☆'}</button>
          <button type="button" className={styles.routeChoice} onClick={() => onChoose(route)}>{name(route.origin)} → {name(route.destination)}</button>
          <button type="button" className={styles.rowDelete} aria-label={`Delete ${name(route.origin)} to ${name(route.destination)}`}
            onClick={() => tab === 'favorites' ? remove(route) : setRecents(removeRecentRoute(route.origin, route.destination))}>×</button>
          {tab === 'favorites' && <button type="button" className={styles.defaultButton} aria-pressed={same(defaultRoute, route)} onClick={() => chooseDefault(route)}>{same(defaultRoute, route) ? 'Cancel default' : 'Set default'}</button>}
        </div>)}
      </div>
      <button type="button" className={styles.clearHistory} disabled={!routes.length} onClick={() => {
        if (!window.confirm(`Clear all ${tab === 'favorites' ? 'favorite routes and the default route' : 'recent searches'}?`)) return;
        if (tab === 'favorites') { setFavorites(clearFavoriteRoutes()); setDefault(null); }
        else setRecents(clearRecentRoutes());
      }}>Clear {tab === 'favorites' ? 'favorites' : 'recent searches'}</button>
    </div>}
  </section>;
}
