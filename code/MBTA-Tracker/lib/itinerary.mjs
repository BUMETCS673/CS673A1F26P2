/*
 * AI-ASSISTED
 * Tool: GitHub Copilot
 * Model: Exact model not recorded
 * Prompt Summary: Resolve per-stop leave times in Boston time, sort multi-stop itineraries chronologically and choose between live and timetable data.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

// Multi-stop itinerary helpers. Times are "HH:MM" wall-clock values in Boston.

export const MAX_STOPS = 5;
export const STOP_LETTERS = "ABCDE";
// Leave times further ahead than this use the timetable instead of live predictions.
export const LIVE_WINDOW_MS = 30 * 60000;
// A time this recently passed still means "today" (shown as passed) rather than tomorrow.
const PAST_GRACE_MS = 30 * 60000;

const bostonParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hourCycle: "h23",
  year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
});

function wallClock(epoch) {
  return Object.fromEntries(bostonParts.formatToParts(epoch)
    .filter(({ type }) => type !== "literal").map(({ type, value }) => [type, Number(value)]));
}

function bostonEpoch(year, month, day, hour, minute) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let epoch = target;
  // Converge on the UTC instant whose Boston wall clock matches the target.
  for (let attempt = 0; attempt < 2; attempt++) {
    const wall = wallClock(epoch);
    epoch += target - Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  }
  return epoch;
}

// Next occurrence of an "HH:MM" Boston time.
export function resolveLeaveTime(value, now) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  const today = wallClock(now);
  const at = (days) => bostonEpoch(today.year, today.month, today.day + days, Number(match[1]), Number(match[2]));
  const sameDay = at(0);
  if (sameDay >= now - PAST_GRACE_MS) return { at: sameDay, tomorrow: false, passed: sameDay < now };
  return { at: at(1), tomorrow: true, passed: false };
}

// Leave time for every stop except the final one. Empty stops inherit the
// previous stop's time; an empty first stop means "now" (at: null).
export function leaveTimes(stops, now) {
  let previous = { at: null, tomorrow: false, passed: false };
  return stops.map((stop, index) => {
    if (index === stops.length - 1) return null;
    const resolved = resolveLeaveTime(stop.time, now);
    previous = resolved ? { ...resolved, inherited: false } : { ...previous, inherited: index > 0 };
    return previous;
  });
}

// Reorders stops chronologically. Untimed stops stay attached to the stop
// before them and the final stop never moves. Returns the same array if unchanged.
export function sortStopsByTime(stops, now) {
  if (stops.length < 3) return stops;
  const groups = [];
  stops.slice(0, -1).forEach((stop, index) => {
    const resolved = resolveLeaveTime(stop.time, now);
    if (index === 0 || resolved) groups.push({ key: Math.max(resolved?.at ?? now, now), stops: [stop] });
    else groups.at(-1).stops.push(stop);
  });
  groups.sort((a, b) => a.key - b.key);
  const sorted = [...groups.flatMap((group) => group.stops), stops.at(-1)];
  return sorted.every((stop, index) => stop === stops[index]) ? stops : sorted;
}
