const { body, param } = require("express-validator");

const createBookingRules = [
  body("address").trim().notEmpty().withMessage("Service address is required"),
  body("contactNumber").trim().notEmpty().withMessage("Contact number is required"),
  body("timeSlot").optional().trim().notEmpty().withMessage("Time slot cannot be empty"),
  body("totalPrice").optional().isNumeric().withMessage("Total price must be a number")
];

const cancelBookingRules = [
  param("id").isMongoId().withMessage("Valid booking ID is required")
];

const rateBookingRules = [
  param("id").isMongoId().withMessage("Valid booking ID is required"),
  body("rating")
    .notEmpty()
    .withMessage("Rating is required")
    .isFloat({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),
  body("review").optional().trim().isLength({ max: 1000 }).withMessage("Review cannot exceed 1000 characters")
];

module.exports = {
  createBookingRules,
  cancelBookingRules,
  rateBookingRules
};
