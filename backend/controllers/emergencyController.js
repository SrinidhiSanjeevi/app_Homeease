const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");
const logger = require("../utils/logger");
const metrics = require("../metrics");
const {
  SEVERITY_CONFIG,
  CATEGORY_DEFAULT_SEVERITY,
  VALID_EMERGENCY_CATEGORIES
} = require("../services/customerCore/emergencyConfig");
const { claimProfessional, claimNearestProfessional, reassignWaitingWork } = require("../services/customerCore");

// DISPATCH EMERGENCY SERVICE
const dispatchEmergency = async (req, res) => {
  try {
    const { category, severity, description, contactNumber, address, latitude, longitude, accuracy } = req.body;
    const userId = req.user._id;

    // Optional — only present when the customer explicitly shared their
    // location. Same validation/shape as bookingController.js.
    const lat = Number(latitude);
    const lng = Number(longitude);
    const hasCoordinates =
      Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
      Number.isFinite(lng) && lng >= -180 && lng <= 180;
    const coordinates = hasCoordinates ? [lng, lat] : null;

    if (!category || !VALID_EMERGENCY_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid emergency category. Must be one of: ${VALID_EMERGENCY_CATEGORIES.join(", ")}.`
      });
    }

    const resolvedSeverity = severity || CATEGORY_DEFAULT_SEVERITY[category] || "Medium";
    const validSeverities = ["Low", "Medium", "High", "Critical"];
    if (!validSeverities.includes(resolvedSeverity)) {
      return res.status(400).json({
        success: false,
        message: `Invalid severity. Must be one of: ${validSeverities.join(", ")}.`
      });
    }

    const severityConfig = SEVERITY_CONFIG[resolvedSeverity];

    // Nearest-provider matching when the customer shared their location;
    // falls back to the existing best-rated matching whenever no
    // registered responder has a location set (or none is available).
    let professional = null;
    let distanceKm = null;
    if (coordinates) {
      const nearest = await claimNearestProfessional(category, coordinates);
      professional = nearest.professional;
      distanceKm = nearest.distanceKm;
    }
    if (!professional) {
      professional = await claimProfessional(category);
    }

    const emergency = await EmergencyRequest.create({
      user: userId,
      category,
      severity: resolvedSeverity,
      description,
      contactNumber,
      address,
      status: "Dispatched",
      assignedProfessional: professional ? professional._id : null,
      fireEngineDispatched: severityConfig.fireEngineDispatched,
      fireEngineNumber: severityConfig.fireEngineNumber,
      emergencyServiceNumber: severityConfig.emergencyServiceNumber,
      estimatedArrivalMinutes: severityConfig.estimatedArrivalMinutes,
      location: coordinates
        ? { latitude: lat, longitude: lng, accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null }
        : undefined,
      assignedDistanceKm: distanceKm
    });

    const populatedEmergency = await EmergencyRequest.findById(emergency._id).populate("assignedProfessional");

    let message = professional
      ? `Emergency dispatched! Assigned provider: ${professional.name}.`
      : "Emergency requested! No specialist is currently available — you'll be assigned automatically the moment one is free.";

    if (severityConfig.fireEngineDispatched) {
      message += ` Fire Engine ${severityConfig.fireEngineNumber} has been alerted. Call ${severityConfig.emergencyServiceNumber} for immediate fire/safety assistance.`;
    } else if (severityConfig.emergencyServiceNumber) {
      message += ` Helpline: ${severityConfig.emergencyServiceNumber}.`;
    }
    message += ` ETA: ~${severityConfig.estimatedArrivalMinutes} minutes.`;

    if (metrics && metrics.emergencyRequestsTotal) {
      metrics.emergencyRequestsTotal.labels(category, resolvedSeverity).inc();
    }

    return res.status(201).json({
      success: true,
      message,
      severity: resolvedSeverity,
      severityLabel: severityConfig.label,
      fireEngineDispatched: severityConfig.fireEngineDispatched,
      fireEngineNumber: severityConfig.fireEngineNumber,
      emergencyServiceNumber: severityConfig.emergencyServiceNumber,
      estimatedArrivalMinutes: severityConfig.estimatedArrivalMinutes,
      emergency: populatedEmergency
    });
  } catch (error) {
    logger.error({ err: error.message }, "EMERGENCY DISPATCH ERROR");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// CANCEL EMERGENCY REQUEST
const cancelEmergency = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const { id } = req.params;
    const emergency = await EmergencyRequest.findOne({ _id: id, user: req.user._id });
    if (!emergency) {
      return res.status(404).json({ success: false, message: "Emergency request not found" });
    }

    if (emergency.status === "Resolved" || emergency.status === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel an emergency that is already ${emergency.status}.`
      });
    }

    emergency.status = "Cancelled";

    if (emergency.assignedProfessional) {
      const freedProfessional = await Professional.findByIdAndUpdate(
        emergency.assignedProfessional,
        { status: "Available" },
        { new: true }
      );
      // FIX: this was the missing piece — releasing a professional
      // previously never checked whether another customer (booking OR
      // emergency) in the same category was still waiting. That's why
      // "No specialist available" stayed stuck even after someone freed up.
      if (freedProfessional) {
        reassignWaitingWork(freedProfessional.category).catch((err) =>
          logger.error({ err: err.message }, "Auto-reassignment error")
        );
      }
    }

    await emergency.save();

    if (metrics && metrics.emergencyRequestsCancelledTotal) {
      metrics.emergencyRequestsCancelledTotal.inc();
    }

    const populatedEmergency = await EmergencyRequest.findById(emergency._id).populate("assignedProfessional");

    return res.status(200).json({
      success: true,
      message: "Emergency request cancelled",
      emergency: populatedEmergency
    });
  } catch (error) {
    logger.error({ err: error.message }, "CANCEL EMERGENCY ERROR");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// GET ACTIVE EMERGENCIES FOR USER
const getActiveEmergencies = async (req, res) => {
  try {
    const userId = req.user._id;
    const emergencies = await EmergencyRequest.find({
      user: userId,
      status: { $nin: ["Resolved", "Cancelled"] }
    })
      .populate("assignedProfessional")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, emergencies });
  } catch (error) {
    logger.error({ err: error.message }, "GET EMERGENCIES ERROR");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// GET ALL EMERGENCIES FOR USER
const getAllEmergencies = async (req, res) => {
  try {
    const userId = req.user._id;
    const emergencies = await EmergencyRequest.find({ user: userId })
      .populate("assignedProfessional")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, emergencies });
  } catch (error) {
    logger.error({ err: error.message }, "GET ALL EMERGENCIES ERROR");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

module.exports = {
  dispatchEmergency,
  cancelEmergency,
  getActiveEmergencies,
  getAllEmergencies
};