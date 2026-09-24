const express = require("express");
const router = express.Router();
const { getServiceArea, search, reverse } = require("../controllers/locationController");
const { protect } = require("../middleware/authMiddleware");
const { geocodeLimiter } = require("../middleware/rateLimiter");

router.get("/service-area", getServiceArea);
router.get("/search", protect, geocodeLimiter, search);
router.get("/reverse", protect, geocodeLimiter, reverse);

module.exports = router;
