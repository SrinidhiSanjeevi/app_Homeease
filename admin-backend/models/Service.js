const mongoose = require("mongoose");

const serviceProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  brand: { type: String, required: true },
  extraPrice: { type: Number, default: 0 }
});

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    image: { type: String, required: true },
    duration: { type: String, required: true },
    rating: { type: Number, default: 4.5 },
    numRatings: { type: Number, default: 1 },
    products: [serviceProductSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.models.Service || mongoose.model("Service", serviceSchema);
