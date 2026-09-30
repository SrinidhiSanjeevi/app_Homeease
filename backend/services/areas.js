const AREAS = Object.freeze([
  { name: "Gachibowli", latitude: 17.4401, longitude: 78.3489 },
  { name: "Khajaguda", latitude: 17.4185, longitude: 78.3710 },
  { name: "Raidurg", latitude: 17.4270, longitude: 78.3830 },
  { name: "Manikonda", latitude: 17.4034, longitude: 78.3871 },
  { name: "Kondapur", latitude: 17.4695, longitude: 78.3576 },
  { name: "HITEC City", latitude: 17.4435, longitude: 78.3772 },
  { name: "Madhapur", latitude: 17.4483, longitude: 78.3915 },
  { name: "Nanakramguda", latitude: 17.4178, longitude: 78.3475 },
  { name: "Financial District", latitude: 17.4146, longitude: 78.3399 },
  { name: "Kothaguda", latitude: 17.4620, longitude: 78.3700 }
].map(Object.freeze));

const AREA_NAMES = Object.freeze(AREAS.map((a) => a.name));

function findArea(name) {
  if (typeof name !== "string") return null;
  const wanted = name.trim().toLowerCase();
  return AREAS.find((a) => a.name.toLowerCase() === wanted) || null;
}

function distanceKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function areaDistanceKm(fromName, toName) {
  const from = findArea(fromName);
  const to = findArea(toName);
  if (!from || !to) return Infinity;
  return Math.round(distanceKm(from, to) * 10) / 10;
}

const MAX_SERVICE_AREAS = 5;

function normalizeServiceAreas(input, homeArea) {
  const list = Array.isArray(input) ? input : [];
  const names = [];
  const home = findArea(homeArea);
  if (home) names.push(home.name);
  for (const raw of list) {
    const area = findArea(raw);
    if (!area) return { error: `Unknown service area: ${String(raw).slice(0, 40)}` };
    if (!names.includes(area.name)) names.push(area.name);
  }
  if (names.length > MAX_SERVICE_AREAS) {
    return { error: `A professional can serve at most ${MAX_SERVICE_AREAS} areas (home area included)` };
  }
  return { areas: names };
}

module.exports = { AREAS, AREA_NAMES, MAX_SERVICE_AREAS, findArea, areaDistanceKm, normalizeServiceAreas };
