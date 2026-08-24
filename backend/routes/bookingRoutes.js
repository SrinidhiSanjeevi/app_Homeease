const express = require("express");
const router = express.Router();
const {
  createBooking,
  getUserBookings,
  getProfessionalBookings,
  acceptBooking,
  completeBooking,
  cancelBooking,
  rateBooking
} = require("../controllers/bookingController");
const { protect } = require("../middleware/authMiddleware");

// All booking routes require authentication
router.use(protect);

// Customer endpoints
router.post("/", createBooking);
router.get("/my-bookings", getUserBookings);
router.get("/", getUserBookings); // Fallback

// Professional endpoints
router.get("/professional", getProfessionalBookings);
router.put("/:id/accept", acceptBooking);
router.put("/:id/complete", completeBooking);

// Lifecycle actions
router.put("/:id/cancel", cancelBooking);
router.put("/:id/rate", rateBooking);

module.exports = router;
