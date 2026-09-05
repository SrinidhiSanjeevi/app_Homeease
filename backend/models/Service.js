const mongoose = require("mongoose");

const serviceProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  brand: {
    type: String,
    required: true,
    trim: true
  },

  extraPrice: {
    type: Number,
    default: 0,
    min: 0
  }
});

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    category: {
      type: String,
      required: true,
      enum: [
        "Spa",
        "Electrician",
        "Carpentry",
        "Plumbing",
        "Security",
        "Repair"
      ],
      index: true
    },

    price: {
      type: Number,
      required: true,
      min: 0
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },

    imageKey: {
      type: String,
      required: true,
      trim: true
    },

    imageAlt: {
      type: String,
      required: true,
      trim: true
    },

    duration: {
      type: String,
      required: true,
      trim: true
    },

    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },

    ratingCount: {
      type: Number,
      default: 0,
      min: 0
    },

    bookingCount: {
      type: Number,
      default: 0,
      min: 0
    },

    completedBookingCount: {
      type: Number,
      default: 0,
      min: 0
    },

    active: {
      type: Boolean,
      default: true,
      index: true
    },

    products: [serviceProductSchema]
  },
  {
    timestamps: true
  }
);

serviceSchema.index({
  category: 1,
  active: 1
});

serviceSchema.index({
  rating: -1,
  ratingCount: -1
});

serviceSchema.index({
  bookingCount: -1,
  rating: -1
});

module.exports =
  mongoose.models.Service ||
  mongoose.model("Service", serviceSchema);