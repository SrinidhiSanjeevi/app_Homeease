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
const validate = require("../middleware/validate");
const {
  createBookingRules,
  cancelBookingRules,
  rateBookingRules
} = require("../validators/bookingValidators");

// All booking routes require authentication
router.use(protect);

// Customer endpoints
router.post("/", validate(createBookingRules), createBooking);
router.get("/my-bookings", getUserBookings);
router.get("/", getUserBookings); // Fallback

// Professional endpoints
router.get("/professional", getProfessionalBookings);
router.put("/:id/accept", acceptBooking);
router.put("/:id/complete", completeBooking);

// Lifecycle actions
router.put("/:id/cancel", validate(cancelBookingRules), cancelBooking);
router.put("/:id/rate", validate(rateBookingRules), rateBooking);

module.exports = router;
