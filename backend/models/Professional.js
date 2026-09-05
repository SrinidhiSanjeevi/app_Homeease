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

module.exports =
  mongoose.models.Professional ||
  mongoose.model("Professional", professionalSchema);