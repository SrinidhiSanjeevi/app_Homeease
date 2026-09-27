const express = require("express");
const router = express.Router();
const { requireInternalToken } = require("../../middleware/internalAuth");
const { getBookingById, settleBookingPayment } = require("../../controllers/internal/bookingInternalController");

// Internal-only: every route here is gated solely by requireInternalToken
// (X-Internal-Token), never an end-user JWT — the caller (payment-service)
// already validated the payment itself (checkout signature or webhook).
router.use(requireInternalToken);

router.get("/:id", getBookingById);
router.post("/:id/settle-payment", settleBookingPayment);

module.exports = router;
