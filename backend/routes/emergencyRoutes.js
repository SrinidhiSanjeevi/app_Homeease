const express = require("express");
const router = express.Router();
const {
  dispatchEmergency,
  cancelEmergency,
  getActiveEmergencies,
  getAllEmergencies
} = require("../controllers/emergencyController");
const { protect } = require("../middleware/authMiddleware");
const { emergencyLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validate");
const { dispatchEmergencyRules, cancelEmergencyRules } = require("../validators/emergencyValidators");

router.use(protect);

router.post("/dispatch", emergencyLimiter, validate(dispatchEmergencyRules), dispatchEmergency);
router.get("/active", getActiveEmergencies);
router.get("/history", getAllEmergencies);
router.put("/:id/cancel", validate(cancelEmergencyRules), cancelEmergency);

module.exports = router;
