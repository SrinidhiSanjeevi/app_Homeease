const express = require("express");
const router = express.Router();
const { requireInternalToken } = require("../middleware/internalAuth");
const { dispatch, getNotificationsForBooking } = require("../controllers/notificationController");

// Internal-only: every route here is gated solely by requireInternalToken
// (X-Internal-Token), never an end-user JWT — the caller (backend) already
// did human-level auth before reaching us.
router.use(requireInternalToken);

router.post("/dispatch", dispatch);
router.get("/booking/:bookingId", getNotificationsForBooking);

module.exports = router;
