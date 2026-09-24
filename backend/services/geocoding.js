/**
 * Free geocoding via OpenStreetMap Nominatim (https://nominatim.org).
 *
 * Nominatim's public usage policy (operations.osmfoundation.org/policies/nominatim):
 *   - max 1 request per second  → requests are serialised through a queue
 *   - identify the application   → custom User-Agent (+ optional contact email)
 *   - cache results               → in-memory TTL cache below
 *   - no keystroke autocomplete   → the UI searches only on explicit submit
 *   - attribution                 → "© OpenStreetMap contributors" shown in the UI
 *
 * All calls go through the backend, never directly from browsers.
 */

const { SERVICE_AREA, distanceFromCenterKm } = require("./serviceArea");

const BASE_URL = (process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org").replace(/\/+$/, "");
const CONTACT_EMAIL = process.env.NOMINATIM_EMAIL || "";
const USER_AGENT = `HomeEase/1.0 (home services demo${CONTACT_EMAIL ? `; ${CONTACT_EMAIL}` : ""})`;
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

// Bounding box around the service area (≈ radius in degrees), used to
// bias and restrict search results.
const DEG_PER_KM = 1 / 111;
const latSpan = SERVICE_AREA.radiusKm * DEG_PER_KM;
const lngSpan = latSpan / Math.cos((SERVICE_AREA.center.latitude * Math.PI) / 180);
const VIEWBOX = [
  SERVICE_AREA.center.longitude - lngSpan,
  SERVICE_AREA.center.latitude + latSpan,
  SERVICE_AREA.center.longitude + lngSpan,
  SERVICE_AREA.center.latitude - latSpan
].map((n) => n.toFixed(5)).join(",");

const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

// Serialise outbound calls so this process never exceeds 1 req/sec.
let queue = Promise.resolve();
let lastCallAt = 0;

function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

async function nominatim(path, params) {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries({ format: "jsonv2", "accept-language": "en", ...params }).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });
  if (CONTACT_EMAIL) url.searchParams.set("email", CONTACT_EMAIL);

  const key = url.toString();
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const data = await throttled(async () => {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new Error(`Nominatim responded ${response.status}`);
    }
    return response.json();
  });

  cacheSet(key, data);
  return data;
}

// "Flat 3, Road No. 2, Gachibowli, Serilingampally, Hyderabad, Telangana, 500032, India"
// → keep it readable: drop country, state and trailing noise.
function shortLabel(item) {
  const a = item.address || {};
  const parts = [
    item.name,
    a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road,
    a.neighbourhood,
    a.suburb,
    a.city || a.town || a.village,
    a.postcode
  ].filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length ? unique.join(", ") : item.display_name;
}

function toPlace(item) {
  const latitude = Number(item.lat);
  const longitude = Number(item.lon);
  const km = distanceFromCenterKm(latitude, longitude);
  return {
    label: shortLabel(item),
    fullAddress: item.display_name,
    latitude,
    longitude,
    distanceFromCenterKm: Math.round(km * 10) / 10,
    inServiceArea: km <= SERVICE_AREA.radiusKm
  };
}

/**
 * Address / place search restricted to the service area.
 */
async function searchPlaces(query) {
  const q = String(query || "").trim().slice(0, 200);
  if (q.length < 3) return [];

  const results = await nominatim("/search", {
    q,
    countrycodes: "in",
    viewbox: VIEWBOX,
    bounded: 1,
    addressdetails: 1,
    limit: 6
  });

  const seen = new Set();
  return (Array.isArray(results) ? results : [])
    .map(toPlace)
    .filter((place) => {
      if (!place.inServiceArea || seen.has(place.label)) return false;
      seen.add(place.label);
      return true;
    });
}

/**
 * Coordinates → readable address.
 */
async function reverseGeocode(latitude, longitude) {
  const result = await nominatim("/reverse", {
    lat: latitude,
    lon: longitude,
    zoom: 18,
    addressdetails: 1
  });
  if (!result || result.error) return null;
  return toPlace(result);
}

module.exports = { searchPlaces, reverseGeocode };
