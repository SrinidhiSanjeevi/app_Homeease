const express = require("express");
const router = express.Router();
const {
  createOrder,
  verifyPayment,
  refundPayment,
  getStatus,
  handleWebhook
} = require("../controllers/paymentController");
const { requireInternalToken } = require("../middleware/internalAuth");

router.post("/webhook", handleWebhook);

router.use(requireInternalToken);
router.post("/order", createOrder);
router.post("/create-order", createOrder); // Alias for compatibility
router.post("/verify", verifyPayment);
router.post("/refund", refundPayment);
router.get("/status", getStatus);

module.exports = router;
