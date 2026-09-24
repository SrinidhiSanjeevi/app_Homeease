const logger = require("../utils/logger");
const { publicServiceArea, parseCoordinates, distanceFromCenterKm, SERVICE_AREA } = require("../services/serviceArea");
const { searchPlaces, reverseGeocode } = require("../services/geocoding");

// GET /api/location/service-area — public, so the UI can show where
// HomeEase operates before the customer logs in.
const getServiceArea = (req, res) => {
  res.status(200).json({ success: true, serviceArea: publicServiceArea() });
};

// GET /api/location/search?q=...
const search = async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 3) {
    return res.status(400).json({ success: false, message: "Type at least 3 characters to search" });
  }

  try {
    const places = await searchPlaces(q);
    return res.status(200).json({ success: true, places });
  } catch (error) {
    logger.warn({ err: error.message }, "Address search failed");
    return res.status(503).json({
      success: false,
      message: "Address search is unavailable right now. Please pick a nearby locality instead."
    });
  }
};

// GET /api/location/reverse?lat=..&lng=..
const reverse = async (req, res) => {
  const coords = parseCoordinates(req.query.lat, req.query.lng);
  if (!coords) {
    return res.status(400).json({ success: false, message: "Valid lat and lng are required" });
  }

  const km = Math.round(distanceFromCenterKm(coords.latitude, coords.longitude) * 10) / 10;
  const base = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    distanceFromCenterKm: km,
    inServiceArea: km <= SERVICE_AREA.radiusKm
  };

  try {
    const place = await reverseGeocode(coords.latitude, coords.longitude);
    return res.status(200).json({ success: true, place: { ...base, label: place?.label || null, fullAddress: place?.fullAddress || null } });
  } catch (error) {
    // The coordinates are still usable without a readable address.
    logger.warn({ err: error.message }, "Reverse geocoding failed");
    return res.status(200).json({ success: true, place: { ...base, label: null, fullAddress: null } });
  }
};

module.exports = { getServiceArea, search, reverse };
