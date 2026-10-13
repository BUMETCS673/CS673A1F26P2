// All labels share horizontal typography and the same collision rules.
// Width estimates deliberately exceed Arial's typical advance at 12px, including
// bold endpoint prefixes. Browser regression tests verify actual rendered bounds.
export function placeStationLabels(candidates, stationPoints, view, unit) {
  const placements = new Map(),
    occupied = [];

  const margin = 8 * unit,
    height = 18 * unit,
    gap = 6 * unit;

  const visiblePoints = stationPoints.filter(
    ([x, y]) =>
      x >= view.x &&
      x <= view.x + view.width &&
      y >= view.y &&
      y <= view.y + view.height,
  );

  for (const candidate of candidates) {
    const {
      id,
      point: [x, y],
      text,
      important,
    } = candidate;

    if (x < view.x || x > view.x + view.width || y < view.y || y > view.y + view.height)
      continue;

    const width = (candidate.width ?? text.length * 7.5) * unit;

    if (width > view.width - 2 * margin) continue;

    const offsets = important
      ? [
          10, -28, 34, -52, 58, -76, 82, -100, 106, -124, 130, -148, 154, -172, 178,
          -196, 202, -220, 226, -244, 250, -268,
        ]
      : [10, -28, 34, -52];

    const positions = offsets.flatMap((offset) =>
      [x + 9 * unit, x - width - 9 * unit, x - width / 2].map((left) => [
        Math.max(view.x + margin, Math.min(view.x + view.width - margin - width, left)),
        y + offset * unit,
      ]),
    );

    for (const [left, top] of positions) {
      const box = { left, top, right: left + width, bottom: top + height };

      if (top < view.y + margin || box.bottom > view.y + view.height - margin) continue;

      if (
        occupied.some(
          (other) =>
            box.left < other.right + gap &&
            box.right > other.left - gap &&
            box.top < other.bottom + gap &&
            box.bottom > other.top - gap,
        )
      )
        continue;

      if (
        visiblePoints.some(
          ([sx, sy]) =>
            sx > box.left - gap &&
            sx < box.right + gap &&
            sy > box.top - gap &&
            sy < box.bottom + gap,
        )
      )
        continue;

      occupied.push(box);

      const anchor = [
        Math.max(box.left, Math.min(box.right, x)),
        Math.max(box.top, Math.min(box.bottom, y)),
      ];

      placements.set(id, {
        x: left,
        y: top + 13 * unit,
        box,
        leader: Math.hypot(anchor[0] - x, anchor[1] - y) > 16 * unit ? anchor : null,
      });
      break;
    }
  }

  return placements;
}
