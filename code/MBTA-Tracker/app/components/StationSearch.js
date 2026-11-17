/*
 * AI-ASSISTED
 * Tool: GitHub Copilot
 * Model: Exact model not recorded
 * Prompt Summary: Provide a ranked station autocomplete with line-colored branch badges for choosing journey stops across all lines.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchStations } from "@/lib/transit-network.mjs";
import styles from "../page.module.css";

export function RouteBadge({ route }) {
  const letter = route.id.startsWith("Green-") ? route.id.slice(-1)
    : route.label.startsWith("SL") ? route.label : route.name[0];
  return <span className={styles.routeBadge} style={{ "--line-color": route.color }} title={route.name} aria-label={route.name}>{letter}</span>;
}

export default function StationSearch({ label, stops, routes, value, onChange, onFocus, active, autoFocus = false }) {
  const id = useId();
  const input = useRef(null);
  const options = useRef(null);
  const selected = stops.find((stop) => stop.id === value);
  const [query, setQuery] = useState({ value, text: selected?.name ?? "" });
  const text = query.value === value ? query.text : selected?.name ?? "";
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const matches = searchStations(stops, text);
  useEffect(() => {
    if (open) options.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, highlight, text]);
  function pick(stop) {
    setQuery({ value: stop.id, text: stop.name });
    setOpen(false);
    onChange(stop.id);
  }
  return (
    <div className={`${styles.stationField} ${active ? styles.activeField : ""}`}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <label htmlFor={id} className={styles.srOnly}>{label}</label>
      <div className={styles.searchInput}>
        {selected && <RouteBadge route={routes.find((route) => route.id === selected.routes[0])} />}
        <input ref={input} id={id} role="combobox" autoComplete="off" autoFocus={autoFocus}
          aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`}
          aria-activedescendant={open && matches[highlight] ? `${id}-option-${highlight}` : undefined}
          value={text} placeholder="Search station name"
          onFocus={(event) => { event.target.select(); onFocus(); setOpen(true); setHighlight(0); }}
          onChange={(event) => {
            setQuery({ value: "", text: event.target.value }); setOpen(true); setHighlight(0);
            if (value) onChange("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { setOpen(false); return; }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(); setOpen(true);
              setHighlight((index) => Math.max(0, Math.min(matches.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
            }
            if (event.key === "Enter" && open && matches[highlight]) {
              event.preventDefault(); pick(matches[highlight]);
            }
          }} />
        <button type="button" className={styles.searchToggle} aria-label={`Show stations for ${label}`}
          onClick={() => { setQuery({ value, text: "" }); setHighlight(0); input.current.focus(); setOpen(true); }}>▾</button>
      </div>
      {open && (
        <div ref={options} id={`${id}-options`} role="listbox" aria-label={`${label} stations`} className={styles.stationOptions}>
          {matches.length === 0 && <p className={styles.small} role="status">No matching stations.</p>}
          {matches.map((stop, index) => (
            <div key={stop.id} id={`${id}-option-${index}`} data-station-option={stop.id} role="option" aria-selected={index === highlight}
              className={`${styles.stationOption} ${index === highlight ? styles.highlightedOption : ""}`}
              onPointerDown={(event) => event.preventDefault()} onClick={() => pick(stop)}>
              <span className={styles.stationBadges}>{stop.routes.map((route) => <RouteBadge key={route} route={routes.find((item) => item.id === route)} />)}</span>
              <span>{stop.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
