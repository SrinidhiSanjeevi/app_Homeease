const express = require("express");
const router = express.Router();
const {
  createOrder,
  verifyPayment,
  refundPayment,
  getStatus,
  handleWebhook
} = require("../controllers/paymentController");

// Public endpoints
router.post("/order", createOrder);
router.post("/create-order", createOrder); // Alias for compatibility
router.post("/verify", verifyPayment);
router.post("/refund", refundPayment);
router.get("/status", getStatus);
router.post("/webhook", handleWebhook);

module.exports = router;
