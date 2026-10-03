const mongoose = require("mongoose");

const professionalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    category: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
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

    experience: {
      type: Number,
      required: true,
      min: 0
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

    // Contact address for job notifications. Optional: providers without one are mailed at the admin mailbox.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address"]
    },

    status: {
      type: String,
      enum: ["Available", "Busy"],
      default: "Available",
      index: true
    },

    active: {
      type: Boolean,
      default: true,
      index: true
    },

    completedJobs: {
      type: Number,
      default: 0,
      min: 0
    },

    locality: { type: String, trim: true, default: null },
    serviceAreas: { type: [{ type: String, trim: true }], default: [] },
    location: {
      type: {
        type: String,
        enum: ["Point"]
      },
      coordinates: {
        type: [Number] // [longitude, latitude]
      }
    }
  },
  {
    timestamps: true
  }
);

professionalSchema.index({
  category: 1,
  status: 1,
  active: 1
});

professionalSchema.index({
  rating: -1,
  ratingCount: -1
});

professionalSchema.index({ location: "2dsphere" }, { sparse: true });

module.exports =
  mongoose.models.Professional ||
  mongoose.model("Professional", professionalSchema);