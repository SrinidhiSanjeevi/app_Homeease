const express = require("express");
const router = express.Router();
const { requireInternalToken } = require("../middleware/internalAuth");
const { createCodPayment, settleCodPayment, getPaymentsForBooking } = require("../controllers/internalController");

router.use(requireInternalToken);

router.post("/cod", createCodPayment);
router.put("/cod/:bookingId/settle", settleCodPayment);
router.get("/booking/:bookingId", getPaymentsForBooking);

module.exports = router;
