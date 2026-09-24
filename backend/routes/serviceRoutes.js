const express = require("express");
const router = express.Router();
const {
  getServices,
  getProfessionals,
  getServiceById,
  getServiceReviews
} = require("../controllers/serviceController");
const validate = require("../middleware/validate");
const { serviceIdRules, serviceReviewsRules } = require("../validators/serviceValidators");

// PUBLIC ROUTES
router.get("/", getServices);
router.get("/professionals", getProfessionals);
router.get("/:id", validate(serviceIdRules), getServiceById);
router.get("/:id/reviews", validate(serviceReviewsRules), getServiceReviews);

module.exports = router;
