/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Load a bounded branch-wide timetable using Boston service dates and complete schedule pagination.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

const localTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function serviceTime(time) {
  const parts = Object.fromEntries(localTime.formatToParts(time).map(({ type, value }) => [type, value]));
  let date = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  if (hour < 3) date = new Date(Date.parse(date + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
  return { date, minute: (hour < 3 ? hour + 24 : hour) * 60 + Number(parts.minute) };
}

const clock = (minute) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function scheduleWindows(now) {
  const start = serviceTime(now), end = serviceTime(now + 3 * 3600000);
  // Include the preceding wall-clock hour for the repeated hour at DST fall-back.
  const min = clock(Math.max(180, start.minute - 60));
  return start.date === end.date
    ? [{ date: start.date, min_time: min, max_time: clock(end.minute) }]
    : [
        { date: start.date, min_time: min, max_time: "27:00" },
        { date: end.date, min_time: "03:00", max_time: clock(end.minute) },
      ];
}

export async function loadBSchedules(getSchedules, now = Date.now()) {
  const data = [], included = new Map();
  for (const window of scheduleWindows(now)) {
    let offset = 0;
    for (let page = 0; ; page++) {
      if (page >= 10) throw new Error("Schedule response exceeded the supported window.");
      const result = await getSchedules({
        route: "Green-B", ...window, include: "trip", page_limit: 1000, page_offset: offset,
      });
      if (!Array.isArray(result.data)) throw new Error("Invalid MBTA schedule response.");
      data.push(...result.data.map((record) => ({ ...record, serviceDate: window.date })));
      for (const record of result.included ?? []) included.set(`${record.type}:${record.id}`, record);
      if (!result.links?.next) break;
      const next = Number(new URL(result.links.next, "https://api-v3.mbta.com").searchParams.get("page[offset]"));
      if (!Number.isInteger(next) || next <= offset) throw new Error("Invalid MBTA schedule pagination.");
      offset = next;
    }
  }
  return { data, included: [...included.values()], departureBefore: now + 2 * 3600000 };
}
