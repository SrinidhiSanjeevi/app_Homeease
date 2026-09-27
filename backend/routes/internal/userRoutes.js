const express = require("express");
const router = express.Router();
const { requireInternalToken } = require("../../middleware/internalAuth");
const { getUserById } = require("../../controllers/internal/userInternalController");

// Internal-only: every route here is gated solely by requireInternalToken
// (X-Internal-Token), never an end-user JWT — the caller (notification-service)
// already did human-level auth before reaching us.
router.use(requireInternalToken);

router.get("/:id", getUserById);

module.exports = router;
