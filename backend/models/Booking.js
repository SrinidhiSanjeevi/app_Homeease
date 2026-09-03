const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service"
    },
    isCustom: {
      type: Boolean,
      default: false
    },
    customCategory: {
      type: String
    },
    customDescription: {
      type: String
    },
    professional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Professional"
    },
    date: {
      type: Date,
      required: true
    },
    timeSlot: {
      type: String,
      required: true
    },
    address: {
      type: String,
      required: true
    },
    contactNumber: {
      type: String,
      required: true
    },
    notes: {
      type: String,
      default: ""
    },
    selectedProduct: {
      name: String,
      brand: String,
      extraPrice: Number
    },
    paymentMethod: {
      type: String,
      required: true,
      default: "Cash on Delivery"
    },
    paymentStatus: {
      type: String,
      required: true,
      default: "Pending"
    },
    status: {
      type: String,
      required: true,
      default: "Created"
    },
    totalPrice: {
      type: Number,
      required: true
    },
    userRating: {
      type: Number,
      min: 1,
      max: 5
    },
    userReview: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

bookingSchema.index({ user: 1, createdAt: -1 });        // user booking history
bookingSchema.index({ professional: 1, status: 1 });   // professional job queries
bookingSchema.index({ status: 1, createdAt: 1 });       // reassignment sweep queries

module.exports =
  mongoose.models.Booking ||
  mongoose.model("Booking", bookingSchema);