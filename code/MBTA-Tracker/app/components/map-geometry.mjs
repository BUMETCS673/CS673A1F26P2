/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Define schematic station coordinates, route paths and journey fitting for the subway map.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

// Presentation coordinates only: connections and station names come from MBTA.
// Edit the anchors/branch bends here without changing the network topology.
export function subwayLayout(network) {
  const points = {
    "place-gover": [1700, 650],
    "place-pktrm": [1640, 710],
    "place-boyls": [1570, 780],
    "place-armnl": [1490, 780],
    "place-coecl": [1390, 780],
    "place-hymnl": [1290, 780],
    "place-kencl": [1190, 780],
    "place-lech": [1530, 470],
    "place-spmnl": [1610, 490],
    "place-north": [1700, 490],
    "place-haecl": [1740, 570],
    "place-state": [1810, 650],
    "place-dwnxg": [1760, 770],
    "place-sstat": [1860, 870],
    "place-chncl": [1760, 860],
    "place-tumnl": [1680, 940],
    "place-bbsta": [1530, 940],
    "place-knncl": [1330, 510],
    "place-chmnl": [1460, 550],
    "place-brdwy": [1860, 990],
    "place-andrw": [1860, 1100],
    "place-jfk": [1940, 1180],
    "place-aport": [2100, 480],
    "place-mvbcl": [2020, 560],
    "place-aqucl": [1930, 650],
    "place-bomnl": [1580, 570],
    "place-crtst": [2000, 870],
    "place-wtcst": [2140, 870],
    "place-conrd": [2280, 870],
    "place-estav": [2150, 380],
    "place-boxdt": [2200, 280],
    "place-belsq": [2200, 190],
    "place-chels": [2200, 100],
    "place-nubn": [1730, 1520],
    "17091": [2380, 640],
    "27092": [2460, 640],
    "17093": [2540, 640],
    "17094": [2540, 560],
    "17095": [2460, 480],
    "17096": [2200, 930],
    "247": [2350, 940],
    "30249": [2420, 1010],
    "30250": [2490, 1080],
    "30251": [2490, 1160],
    "31259": [2410, 1160],
    "31255": [2340, 1090],
    "31257": [2330, 1010],
    "31256": [2290, 970],
    "6538": [1840, 910],
    "6555": [1790, 910],
    "49002": [1730, 980],
    "49003": [1730, 1040],
    "5098": [1730, 1100],
    "5100": [1730, 1160],
    "19402": [1730, 1220],
    "15176": [1730, 1280],
    "55": [1730, 1340],
    "60": [1730, 1400],
    "61": [1730, 1460],
    "3": [1760, 1460],
    "4": [1760, 1400],
    "5": [1760, 1340],
    "1787": [1760, 1280],
    "1788": [1760, 1220],
    "5093": [1760, 1175],
    "5095": [1760, 1100],
    "15095": [1760, 1040],
    "6565": [1760, 980],
    "6537": [1810, 940],
    "49001": [1680, 820],
    "8279": [1620, 850],
    "6567": [1750, 880],
  };

  function section(route, from, to, bends) {
    const pattern = network.patterns.find(
      (item) =>
        item.route === route &&
        item.stops.indexOf(from) >= 0 &&
        item.stops.indexOf(to) > item.stops.indexOf(from),
    );

    if (!pattern)
      throw new Error(`Update schematic section: ${route} ${from} to ${to}`);

    const ids = pattern.stops.slice(
      pattern.stops.indexOf(from),
      pattern.stops.indexOf(to) + 1,
    );

    const lengths = bends
      .slice(1)
      .map((point, index) =>
        Math.hypot(point[0] - bends[index][0], point[1] - bends[index][1]),
      );

    const total = lengths.reduce((a, b) => a + b, 0);

    ids.forEach((id, index) => {
      if (points[id]) return;

      let distance = (total * index) / (ids.length - 1),
        segment = 0;

      while (segment < lengths.length - 1 && distance > lengths[segment])
        distance -= lengths[segment++];

      const ratio = distance / lengths[segment];

      points[id] = bends[segment].map((value, axis) =>
        Math.round(value + (bends[segment + 1][axis] - value) * ratio),
      );
    });
  }

  section("Green-B", "place-kencl", "place-lake", [
    [1190, 780],
    [420, 780],
    [70, 1130],
  ]);
  section("Green-C", "place-kencl", "place-clmnl", [
    [1190, 780],
    [1060, 940],
    [560, 940],
    [280, 1220],
  ]);
  section("Green-D", "place-unsqu", "place-lech", [
    [1400, 500],
    [1530, 470],
  ]);
  section("Green-D", "place-kencl", "place-river", [
    [1190, 780],
    [1190, 970],
    [740, 1420],
    [180, 1420],
  ]);
  section("Green-E", "place-mdftf", "place-lech", [
    [1130, 70],
    [1530, 470],
  ]);
  section("Green-E", "place-coecl", "place-hsmnl", [
    [1390, 780],
    [1390, 950],
    [850, 1490],
  ]);
  section("Orange", "place-ogmnl", "place-north", [
    [2000, 100],
    [1700, 400],
    [1700, 490],
  ]);
  section("Orange", "place-bbsta", "place-forhl", [
    [1530, 940],
    [1130, 1340],
  ]);
  section("Red", "place-alfcl", "place-knncl", [
    [880, 170],
    [1220, 510],
    [1330, 510],
  ]);
  section("Red", "place-jfk", "place-brntn", [
    [1940, 1180],
    [2440, 1680],
  ]);
  section("Red", "place-jfk", "place-asmnl", [
    [1940, 1180],
    [1940, 1560],
  ]);
  section("Mattapan", "place-asmnl", "place-matt", [
    [1940, 1560],
    [1820, 1680],
    [1520, 1680],
  ]);
  section("Blue", "place-wondl", "place-aport", [
    [2460, 120],
    [2100, 480],
  ]);

  const missing = Object.keys(network.stations).filter((id) => !points[id]);

  // New stations stay on the map at a geographic fallback until coordinates are updated.
  for (const id of missing) {
    const station = network.stations[id];

    points[id] = [
      1700 + (station.longitude + 71.06) * 9000,
      650 - (station.latitude - 42.36) * 9000,
    ];
  }

  return { points, missing };
}

export function roundedPath(coordinates) {
  if (!coordinates.length) return "";

  let path = `M ${coordinates[0].join(" ")}`;

  for (let i = 1; i < coordinates.length - 1; i++) {
    const previous = coordinates[i - 1],
      current = coordinates[i],
      next = coordinates[i + 1];

    const before = current.map(
      (value, axis) => value + (previous[axis] - value) * 0.18,
    );

    const after = current.map((value, axis) => value + (next[axis] - value) * 0.18);

    path += ` L ${before.join(" ")} Q ${current.join(" ")} ${after.join(" ")}`;
  }

  if (coordinates.length > 1) path += ` L ${coordinates.at(-1).join(" ")}`;

  return path;
}

export function fitPoints(points, aspect, padding = 170) {
  if (!points.length) throw new Error("Cannot fit an empty set of stations");

  if (!(aspect > 0) || !Number.isFinite(aspect))
    throw new Error("Invalid viewport aspect");

  const xs = points.map((point) => point[0]),
    ys = points.map((point) => point[1]);

  let width = Math.max(...xs) - Math.min(...xs) + padding * 2;
  let height = Math.max(...ys) - Math.min(...ys) + padding * 2;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;

  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;

  return { x: cx - width / 2, y: cy - height / 2, width, height };
}
