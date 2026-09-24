const mongoose = require("mongoose");
const Service = require("../models/Service");
const Professional = require("../models/Professional");
const Booking = require("../models/Booking");
const { attachImageUrls } = require("../services/blobStorage");
const logger = require("../utils/logger");

// GET ALL ACTIVE SERVICES
const getServices = async (req, res) => {
  try {
    const rawServices = await Service.find({ active: true })
      .select("-image -numRatings")
      .sort({ category: 1, name: 1 })
      .lean();

    const services = await attachImageUrls(rawServices);

    return res.status(200).json({
      success: true,
      services
    });
  } catch (error) {
    logger.error({ err: error.message }, "Error fetching services");

    return res.status(500).json({
      success: false,
      message: "Something went wrong, please try again"
    });
  }
};

// GET ALL ACTIVE PROFESSIONALS
const getProfessionals = async (req, res) => {
  try {
    const { category } = req.query;

    const filter = {
      active: true,
      ...(category ? { category: category.trim() } : {})
    };

    const rawProfessionals = await Professional.find(filter)
      .select("-image")
      .sort({ rating: -1, name: 1 })
      .lean();

    const professionals = await attachImageUrls(rawProfessionals);

    return res.status(200).json({
      success: true,
      professionals
    });
  } catch (error) {
    logger.error({ err: error.message }, "Error fetching professionals");

    return res.status(500).json({
      success: false,
      message: "Something went wrong, please try again"
    });
  }
};

// GET ONE ACTIVE SERVICE
const getServiceById = async (req, res) => {
  try {
    const rawService = await Service.findOne({ _id: req.params.id, active: true })
      .select("-image -numRatings")
      .lean();

    if (!rawService) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    const [service] = await attachImageUrls([rawService]);

    return res.status(200).json({
      success: true,
      service
    });
  } catch (error) {
    logger.error({ err: error.message }, "Error fetching service");

    return res.status(500).json({
      success: false,
      message: "Something went wrong, please try again"
    });
  }
};

// Public reviews show only "First L." — never full names or contact data.
const toDisplayName = (name) => {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  const first = parts[0][0].toUpperCase() + parts[0].slice(1);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1][0].toUpperCase()}.` : first;
};

// GET RECENT REVIEWS + RATING BREAKDOWN FOR A SERVICE
const getServiceReviews = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const serviceId = new mongoose.Types.ObjectId(req.params.id);
    const ratedFilter = {
      service: serviceId,
      status: "Completed",
      userRating: { $gte: 1 }
    };

    const [rawReviews, breakdownRows] = await Promise.all([
      Booking.find(ratedFilter)
        .select("userRating userReview selectedProduct updatedAt user")
        .populate("user", "name")
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean(),
      Booking.aggregate([
        { $match: ratedFilter },
        { $group: { _id: { $round: ["$userRating", 0] }, count: { $sum: 1 } } }
      ])
    ]);

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    breakdownRows.forEach((row) => {
      if (breakdown[row._id] !== undefined) breakdown[row._id] = row.count;
    });

    const reviews = rawReviews.map((r) => ({
      _id: r._id,
      rating: r.userRating,
      review: r.userReview || "",
      product: r.selectedProduct?.name || null,
      author: toDisplayName(r.user?.name),
      date: r.updatedAt
    }));

    return res.status(200).json({
      success: true,
      reviews,
      breakdown,
      total: Object.values(breakdown).reduce((a, b) => a + b, 0)
    });
  } catch (error) {
    logger.error({ err: error.message }, "Error fetching service reviews");

    return res.status(500).json({
      success: false,
      message: "Something went wrong, please try again"
    });
  }
};

module.exports = {
  getServices,
  getProfessionals,
  getServiceById,
  getServiceReviews
};