/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Build an interactive subway map with Green B journeys between Government Center and Boston College.
 * AI Contribution: (~90%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import network from "../data/subway-network.json";
import { fitPoints, roundedPath, subwayLayout } from "./map-geometry.mjs";
import styles from "./SubwayMap.module.css";
import { placeStationLabels } from "./map-labels.mjs";

const { points } = subwayLayout(network);
const allPoints = Object.values(points);
const routeById = Object.fromEntries(network.routes.map((route) => [route.id, route]));

const family = (id) =>
  id.startsWith("Green-") ? "Green" : /^\d/.test(id) ? "Silver" : id;

const patterns = network.patterns.filter(
  (pattern) => pattern.direction === 0 || /^\d/.test(pattern.route),
);

const terminals = new Set(
  patterns.flatMap((pattern) => [pattern.stops[0], pattern.stops.at(-1)]),
);

const transfers = new Set(
  Object.values(network.stations)
    .filter((station) => new Set(station.routes.map(family)).size > 1)
    .map((station) => station.id),
);

const initialView = fitPoints(allPoints, 1.4, 100);

export default function SubwayMap({
  network: bNetwork,
  journey,
  origin,
  destination,
  activeField,
  onPick,
}) {
  const viewport = useRef(null),
    svg = useRef(null),
    frame = useRef(null);

  const camera = useRef(initialView),
    drag = useRef(null),
    suppressClick = useRef(false);

  const [view, setView] = useState(initialView);
  const [size, setSize] = useState({ width: 1000, height: 715 });
  const [overview, setOverview] = useState(true);
  const [labelWidths, setLabelWidths] = useState({});
  const bStops = new Set(bNetwork?.stops.map((stop) => stop.id) ?? []);
  const selected = new Set(journey?.stops.map((stop) => stop.id) ?? []);
  const journeyIds = journey?.stops.map((stop) => stop.id).join(",") ?? "";
  const focused = Boolean(journey && !overview);
  const unit = view.width / size.width;
  const full = fitPoints(allPoints, size.width / size.height, 110);

  const apply = useCallback((next) => {
    camera.current = next;
    setView(next);
  }, []);

  const animate = useCallback(
    (target) => {
      cancelAnimationFrame(frame.current);

      const from = camera.current,
        started = performance.now();

      const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450;

      function step(now) {
        const progress = duration ? Math.min(1, (now - started) / duration) : 1;
        const ease = 1 - Math.pow(1 - progress, 3);

        apply(
          Object.fromEntries(
            Object.keys(target).map((key) => [
              key,
              from[key] + (target[key] - from[key]) * ease,
            ]),
          ),
        );

        if (progress < 1) frame.current = requestAnimationFrame(step);
      }

      frame.current = requestAnimationFrame(step);
    },
    [apply],
  );

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height)
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });

    observer.observe(viewport.current);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, []);

  useEffect(() => {
    const ids = journeyIds.split(",").filter(Boolean);

    const nextFrame = requestAnimationFrame(() => {
      setOverview(!ids.length);

      const positions = ids.map((id) => points[id]).filter(Boolean);

      animate(
        fitPoints(
          positions.length ? positions : allPoints,
          size.width / size.height,
          ids.length ? 180 : 110,
        ),
      );
    });

    return () => cancelAnimationFrame(nextFrame);
  }, [journeyIds, size.width, size.height, animate]);

  const zoom = useCallback(
    (factor, anchor = [0.5, 0.5]) => {
      cancelAnimationFrame(frame.current);

      const current = camera.current;
      const maxWidth = fitPoints(allPoints, size.width / size.height, 110).width * 1.2;
      const width = Math.min(maxWidth, Math.max(380, current.width * factor));
      const height = (width * size.height) / size.width;

      apply({
        x: current.x + (current.width - width) * anchor[0],
        y: current.y + (current.height - height) * anchor[1],
        width,
        height,
      });
    },
    [apply, size],
  );

  useEffect(() => {
    const element = svg.current;

    function wheel(event) {
      event.preventDefault();

      const rect = element.getBoundingClientRect();

      zoom(Math.exp(Math.max(-150, Math.min(150, event.deltaY)) * 0.002), [
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
      ]);
    }

    element.addEventListener("wheel", wheel, { passive: false });

    return () => element.removeEventListener("wheel", wheel);
  }, [zoom]);

  useEffect(() => {
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");

    if (!context) return;

    const widths = {};

    for (const station of Object.values(network.stations))
      for (const prefix of ["", "A · ", "B · "]) {
        context.font = `${prefix ? 700 : 450} 12px Arial`;
        widths[prefix + station.name] =
          Math.ceil(context.measureText(prefix + station.name).width) + 4;
      }

    const pending = requestAnimationFrame(() => setLabelWidths(widths));

    return () => cancelAnimationFrame(pending);
  }, []);

  const labelText = (station) => {
    const prefix =
      station.id === origin ? "A · " : station.id === destination ? "B · " : "";

    return prefix + station.name;
  };

  const labelCandidates = Object.values(network.stations).filter(
    (station) =>
      selected.has(station.id) ||
      station.id === origin ||
      station.id === destination ||
      (!focused &&
        (unit < 1.3 || terminals.has(station.id) || transfers.has(station.id))),
  );

  const priority = (station) =>
    station.id === origin || station.id === destination
      ? 0
      : selected.has(station.id)
        ? 1
        : terminals.has(station.id)
          ? 2
          : 3;

  labelCandidates.sort((a, b) => priority(a) - priority(b));

  const labelPositions = placeStationLabels(
    labelCandidates.map((station) => ({
      id: station.id,
      point: points[station.id],
      text: labelText(station),
      width: labelWidths[labelText(station)],
      important: priority(station) <= 1,
    })),
    focused ? journey.stops.map((stop) => points[stop.id]).filter(Boolean) : allPoints,
    view,
    unit,
  );

  function reset() {
    setOverview(true);
    animate(full);
  }

  function fitJourney() {
    if (!journey) return;

    setOverview(false);

    const positions = journey.stops.map((stop) => points[stop.id]).filter(Boolean);

    animate(
      fitPoints(
        positions.length ? positions : allPoints,
        size.width / size.height,
        180,
      ),
    );
  }

  function pan(event) {
    const start = drag.current;

    if (!start || start.pointer !== event.pointerId) return;

    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;

    if (Math.hypot(dx, dy) > 4) {
      suppressClick.current = true;
      svg.current.setPointerCapture(event.pointerId);
      cancelAnimationFrame(frame.current);
      apply({
        ...start.view,
        x: start.view.x - (dx * start.view.width) / size.width,
        y: start.view.y - (dy * start.view.height) / size.height,
      });
    }
  }

  function keyboard(event) {
    if (event.target !== event.currentTarget) return;

    const current = camera.current,
      distance = current.width * 0.08;

    const offsets = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance],
    };

    if (offsets[event.key]) {
      event.preventDefault();
      cancelAnimationFrame(frame.current);
      apply({
        ...current,
        x: current.x + offsets[event.key][0],
        y: current.y + offsets[event.key][1],
      });
    } else if (["+", "=", "-"].includes(event.key)) {
      event.preventDefault();
      zoom(event.key === "-" ? 1.25 : 0.8);
    } else if (event.key === "0") {
      event.preventDefault();
      reset();
    }
  }

  return (
    <section className={styles.panel} aria-label="Boston subway map">
      <div className={styles.toolbar}>
        <div>
          <h1>Boston subway map</h1>
          <p>Select B-branch stops. Other lines are map context only.</p>
        </div>
        <div className={styles.controls}>
          <button onClick={reset}>Full map</button>
          <button onClick={fitJourney} disabled={!journey}>
            Fit journey
          </button>
          <button aria-label="Zoom out map" onClick={() => zoom(1.25)}>
            −
          </button>
          <button aria-label="Zoom in map" onClick={() => zoom(0.8)}>
            +
          </button>
        </div>
      </div>
      <div className={styles.viewport} ref={viewport}>
        <svg
          ref={svg}
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          className={styles.map}
          role="group"
          aria-label="Subway schematic. Only B-branch stations can be selected."
          tabIndex={0}
          aria-describedby="map-instructions"
          onKeyDown={keyboard}
          onPointerDown={(event) => {
            if (event.button !== 0) return;

            suppressClick.current = false;
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              view: camera.current,
            };
          }}
          onPointerMove={pan}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
            suppressClick.current = true;
          }}
        >
          {patterns.map((pattern) => (
            <path
              key={pattern.id}
              data-route={pattern.route}
              d={roundedPath(pattern.stops.map((id) => points[id]))}
              fill="none"
              stroke={focused ? "#b7bdc1" : routeById[pattern.route].color}
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={focused ? 0.7 : 1}
            />
          ))}
          {focused && (
            <path
              data-testid="selected-journey"
              d={roundedPath(
                journey.stops.map((stop) => points[stop.id]).filter(Boolean),
              )}
              fill="none"
              stroke="#00843d"
              strokeWidth={6}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
            />
          )}
          {Object.values(network.stations).map((station) => {
            const [x, y] = points[station.id],
              selectable = bStops.has(station.id);

            const endpoint = station.id === origin || station.id === destination;

            const active = selected.has(station.id),
              transfer = transfers.has(station.id);

            const label = labelPositions.get(station.id);

            return (
              <g
                key={station.id}
                data-station={station.id}
                role={selectable ? "button" : undefined}
                tabIndex={selectable ? 0 : undefined}
                aria-label={
                  selectable
                    ? `Set ${activeField === "origin" ? "starting stop" : "destination"} to ${station.name}`
                    : undefined
                }
                className={selectable ? styles.selectable : undefined}
                opacity={focused && !active && !endpoint ? 0.7 : 1}
                onClick={
                  selectable
                    ? () => {
                        if (!suppressClick.current) onPick(station.id);
                      }
                    : undefined
                }
                onKeyDown={
                  selectable
                    ? (event) => {
                        if (["Enter", " "].includes(event.key)) {
                          event.preventDefault();
                          onPick(station.id);
                        }
                      }
                    : undefined
                }
              >
                <title>
                  {station.name +
                    (selectable ? " — B-branch stop" : " — map context only")}
                </title>
                {label?.leader && (
                  <line
                    x1={x}
                    y1={y}
                    x2={label.leader[0]}
                    y2={label.leader[1]}
                    stroke="#738078"
                    strokeWidth={0.8}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )}
                {selectable && (
                  <circle
                    cx={x}
                    cy={y}
                    r={12 * unit}
                    fill="transparent"
                    className={styles.target}
                  />
                )}
                {endpoint && <circle cx={x} cy={y} r={10 * unit} fill="#00843d" />}
                <circle
                  cx={x}
                  cy={y}
                  r={(endpoint ? 5 : active || transfer ? 4 : 2.8) * unit}
                  fill={
                    endpoint || active || transfer
                      ? "#fff"
                      : focused
                        ? "#b7bdc1"
                        : routeById[station.routes[0]].color
                  }
                  stroke={
                    active
                      ? "#00843d"
                      : transfer
                        ? focused
                          ? "#92999e"
                          : "#40504b"
                        : "none"
                  }
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                />
                {label && (
                  <text
                    data-map-label={station.id}
                    x={label.x}
                    y={label.y}
                    fontSize={12 * unit}
                    className={styles.label}
                    style={{ strokeWidth: 3 * unit }}
                    fontWeight={endpoint ? 700 : 450}
                  >
                    {labelText(station)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className={styles.footer}>
        <p id="map-instructions" className={styles.srOnly}>
          Drag to pan · Zoom for station names · Arrow keys to pan · 0 resets
        </p>
        <p>
          Pick {activeField === "origin" ? "starting stop (A)" : "destination (B)"} on
          the B branch, or use the <a href="#journey-planner">planner</a>.
        </p>
        <div className={styles.legend}>
          {[
            ["Red / Mattapan", "#DA291C"],
            ["Orange", "#ED8B00"],
            ["Green B–E", "#00843D"],
            ["Blue", "#003DA5"],
            ["Silver", "#7C878E"],
          ].map(([label, color]) => (
            <span key={label}>
              <i style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
        {bNetwork?.stops.some((stop) => !points[stop.id]) && (
          <p role="status">
            New B stops are available in the planner; their map positions need updating.
          </p>
        )}
      </div>
    </section>
  );
}
