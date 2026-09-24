const { param, query } = require("express-validator");

const serviceIdRules = [
  param("id").isMongoId().withMessage("Valid service ID is required")
];

const serviceReviewsRules = [
  ...serviceIdRules,
  query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50")
];

const recentReviewsRules = [
  query("limit").optional().isInt({ min: 1, max: 12 }).withMessage("Limit must be between 1 and 12")
];

module.exports = {
  serviceIdRules,
  serviceReviewsRules,
  recentReviewsRules
};
