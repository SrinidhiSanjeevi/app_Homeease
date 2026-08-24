const express = require("express");
const router = express.Router();
const {
  dispatchEmergency,
  cancelEmergency,
  getActiveEmergencies,
  getAllEmergencies
} = require("../controllers/emergencyController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.post("/dispatch", dispatchEmergency);
router.get("/active", getActiveEmergencies);
router.get("/history", getAllEmergencies);
router.put("/:id/cancel", cancelEmergency);

module.exports = router;