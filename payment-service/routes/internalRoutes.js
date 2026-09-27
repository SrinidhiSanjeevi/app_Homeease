const express = require("express");
const router = express.Router();
const { requireInternalToken } = require("../middleware/internalAuth");
const { createCodPayment, settleCodPayment, getPaymentsForBooking } = require("../controllers/internalController");

// Internal-only: every route here is gated solely by requireInternalToken
// (X-Internal-Token), never an end-user JWT — the caller (backend) already
// did human-level auth before reaching us.
router.use(requireInternalToken);

router.post("/cod", createCodPayment);
router.put("/cod/:bookingId/settle", settleCodPayment);
router.get("/booking/:bookingId", getPaymentsForBooking);

module.exports = router;
