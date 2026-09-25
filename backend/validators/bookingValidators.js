const { body, param } = require("express-validator");
const { mobileNumber, serviceAddress, serviceArea } = require("./common");
const { TIME_SLOTS } = require("../services/booking/bookingSchedule");

const createBookingRules = [
  serviceAddress("address"),
  mobileNumber("contactNumber"),
  serviceArea("area"),
  body("date").isString().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("Please pick a valid date"),
  body("timeSlot").isIn(TIME_SLOTS).withMessage("Please pick an available time slot"),
  body("serviceId").optional({ nullable: true }).isMongoId().withMessage("Invalid service"),
  body("professionalId").optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage("Invalid professional"),
  body("notes").optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage("Notes cannot exceed 500 characters"),
  body("customDescription").optional({ nullable: true }).isString().isLength({ max: 1000 }).withMessage("Description cannot exceed 1000 characters"),
  body("paymentMethod").optional().isIn(["Razorpay", "Cash on Delivery", "Cash"]).withMessage("Invalid payment method")
];

const cancelBookingRules = [
  param("id").isMongoId().withMessage("Valid booking ID is required")
];

const rateBookingRules = [
  param("id").isMongoId().withMessage("Valid booking ID is required"),
  body("rating")
    .notEmpty()
    .withMessage("Rating is required")
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be a whole number from 1 to 5"),
  body("review").optional().trim().isLength({ max: 1000 }).withMessage("Review cannot exceed 1000 characters")
];

module.exports = {
  createBookingRules,
  cancelBookingRules,
  rateBookingRules
};
