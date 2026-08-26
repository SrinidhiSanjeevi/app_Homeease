const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { createOrder, verifyPayment } = require("../controllers/paymentController");

router.use(protect);
router.post("/create-order", createOrder);
router.post("/verify", verifyPayment);

module.exports = router;