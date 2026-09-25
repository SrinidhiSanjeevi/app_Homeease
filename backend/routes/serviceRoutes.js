const express = require("express");
const router = express.Router();
const {
  getServices,
  getAreas,
  getProfessionals,
  getProfessionalAvailability,
  getServiceById,
  getServiceReviews,
  getRecentReviews
} = require("../controllers/serviceController");
const validate = require("../middleware/validate");
const { serviceIdRules, serviceReviewsRules, recentReviewsRules } = require("../validators/serviceValidators");

// PUBLIC ROUTES
router.get("/", getServices);
router.get("/areas", getAreas);
router.get("/professionals", getProfessionals);
router.get("/professionals/availability", getProfessionalAvailability);
router.get("/reviews/recent", validate(recentReviewsRules), getRecentReviews);
router.get("/:id", validate(serviceIdRules), getServiceById);
router.get("/:id/reviews", validate(serviceReviewsRules), getServiceReviews);

module.exports = router;
