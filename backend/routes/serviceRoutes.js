const express = require("express");
const router = express.Router();
const { getServices, getProfessionals } = require("../controllers/serviceController");

// PUBLIC ROUTES
router.get("/", getServices);
router.get("/professionals", getProfessionals);

module.exports = router;
