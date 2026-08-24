const mongoose = require("mongoose");

const serviceProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  brand: { type: String, required: true },
  extraPrice: { type: Number, default: 0 }
});

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    category: {
      type: String,
      required: true,
      enum: ["Spa", "Electrician", "Carpentry", "Plumbing", "Security", "Repair"]
    },
    price: {
      type: Number,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    image: {
      type: String,
      required: true
    },
    duration: {
      type: String,
      required: true // e.g., "1 hour", "1.5 hours"
    },
    rating: {
      type: Number,
      default: 4.5
    },
    numRatings: {
      type: Number,
      default: 1
    },
    products: [serviceProductSchema] // Custom product/brand selections available for this service
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Service", serviceSchema);
