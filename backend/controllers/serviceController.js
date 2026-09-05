const Service = require("../models/Service");
const Professional = require("../models/Professional");
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

module.exports = {
  getServices,
  getProfessionals
};