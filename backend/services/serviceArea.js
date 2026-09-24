/**
 * HomeEase service area — Gachibowli, Hyderabad and its surroundings.
 *
 * Every booking and emergency must carry coordinates inside this circle,
 * and professionals are only matched when they are within
 * MATCH_RADIUS_KM of the customer. All distance maths is plain Haversine
 * / MongoDB 2dsphere, so no paid map API is involved.
 *
 * Mirrored in admin-backend/services/serviceArea.js — keep both in sync.
 */

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const SERVICE_AREA = Object.freeze({
  name: "Gachibowli, Hyderabad",
  center: Object.freeze({ latitude: 17.4401, longitude: 78.3489 }),
  radiusKm: envNumber("SERVICE_AREA_RADIUS_KM", 12)
});

// Max customer ↔ professional distance for an assignment.
const MATCH_RADIUS_KM = envNumber("MATCH_RADIUS_KM", SERVICE_AREA.radiusKm);

// Well-known neighbourhoods inside the service area. Used for quick-pick
// on the customer side (works even when GPS / geocoding is unavailable)
// and as the base location admins assign to each professional.
const LOCALITIES = Object.freeze([
  { name: "Gachibowli", latitude: 17.4401, longitude: 78.3489 },
  { name: "HITEC City", latitude: 17.4435, longitude: 78.3772 },
  { name: "Madhapur", latitude: 17.4483, longitude: 78.3915 },
  { name: "Kondapur", latitude: 17.4695, longitude: 78.3576 },
  { name: "Kothaguda", latitude: 17.4620, longitude: 78.3700 },
  { name: "Financial District", latitude: 17.4146, longitude: 78.3399 },
  { name: "Nanakramguda", latitude: 17.4178, longitude: 78.3475 },
  { name: "Raidurg", latitude: 17.4270, longitude: 78.3830 },
  { name: "Nallagandla", latitude: 17.4710, longitude: 78.3130 },
  { name: "Manikonda", latitude: 17.4034, longitude: 78.3871 },
  { name: "Narsingi", latitude: 17.3907, longitude: 78.3576 },
  { name: "Miyapur", latitude: 17.4968, longitude: 78.3614 },
  { name: "Jubilee Hills", latitude: 17.4326, longitude: 78.4071 }
].map(Object.freeze));

const EARTH_RADIUS_KM = 6371;

function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceFromCenterKm(latitude, longitude) {
  return distanceKm(SERVICE_AREA.center.latitude, SERVICE_AREA.center.longitude, latitude, longitude);
}

/**
 * Parses raw lat/lng input. Returns { latitude, longitude } or null.
 */
function parseCoordinates(latitude, longitude) {
  if (latitude === null || latitude === undefined || latitude === "") return null;
  if (longitude === null || longitude === undefined || longitude === "") return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

function isWithinServiceArea(latitude, longitude) {
  return distanceFromCenterKm(latitude, longitude) <= SERVICE_AREA.radiusKm;
}

function findLocality(name) {
  if (typeof name !== "string") return null;
  const wanted = name.trim().toLowerCase();
  return LOCALITIES.find((l) => l.name.toLowerCase() === wanted) || null;
}

/**
 * Validates a customer location for a booking / emergency.
 * Returns { ok: true, latitude, longitude } or { ok: false, status, message }.
 */
function checkCustomerLocation(latitude, longitude) {
  const coords = parseCoordinates(latitude, longitude);
  if (!coords) {
    return {
      ok: false,
      status: 400,
      message: "Please set your location (current location, address search or a nearby locality) so we can send the nearest professional."
    };
  }
  const km = distanceFromCenterKm(coords.latitude, coords.longitude);
  if (km > SERVICE_AREA.radiusKm) {
    return {
      ok: false,
      status: 422,
      message: `Sorry, HomeEase currently serves only ${SERVICE_AREA.name} and areas within ${SERVICE_AREA.radiusKm} km. This location is about ${Math.round(km)} km away.`
    };
  }
  return { ok: true, ...coords };
}

function publicServiceArea() {
  return {
    name: SERVICE_AREA.name,
    center: SERVICE_AREA.center,
    radiusKm: SERVICE_AREA.radiusKm,
    matchRadiusKm: MATCH_RADIUS_KM,
    localities: LOCALITIES
  };
}

module.exports = {
  SERVICE_AREA,
  MATCH_RADIUS_KM,
  LOCALITIES,
  EARTH_RADIUS_KM,
  distanceKm,
  distanceFromCenterKm,
  parseCoordinates,
  isWithinServiceArea,
  findLocality,
  checkCustomerLocation,
  publicServiceArea
};
