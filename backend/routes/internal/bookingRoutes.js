const express = require("express");
const router = express.Router();
const { requireInternalToken } = require("../../middleware/internalAuth");
const { getBookingById, settleBookingPayment } = require("../../controllers/internal/bookingInternalController");

router.use(requireInternalToken);

router.get("/:id", getBookingById);
router.post("/:id/settle-payment", settleBookingPayment);

module.exports = router;
