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

    // Legacy fields from the removed location feature. No longer read or
    // written; kept so existing documents stay valid.
    locality: { type: String, trim: true, default: null },
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

// Sparse: only professionals with a `location` set are indexed, so this
// is cheap even though most existing seed data predates this feature.
professionalSchema.index({ location: "2dsphere" }, { sparse: true });

module.exports =
  mongoose.models.Professional ||
  mongoose.model("Professional", professionalSchema);