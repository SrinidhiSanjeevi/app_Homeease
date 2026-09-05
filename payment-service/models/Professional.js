const mongoose = require("mongoose");

const professionalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["Available", "Busy"],
      default: "Available"
    },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.models.Professional || mongoose.model("Professional", professionalSchema);
