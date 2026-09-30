const express = require("express");
const router = express.Router();
const { requireInternalToken } = require("../middleware/internalAuth");
const { dispatch, getNotificationsForBooking } = require("../controllers/notificationController");

router.use(requireInternalToken);

router.post("/dispatch", dispatch);
router.get("/booking/:bookingId", getNotificationsForBooking);

module.exports = router;
