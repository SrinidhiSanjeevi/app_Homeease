const express = require("express");
const router = express.Router();
const { requireInternalToken } = require("../../middleware/internalAuth");
const { getUserById } = require("../../controllers/internal/userInternalController");

router.use(requireInternalToken);

router.get("/:id", getUserById);

module.exports = router;
