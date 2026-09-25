const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");
const logger = require("../utils/logger");
const metrics = require("../metrics");
const {
  SEVERITY_CONFIG,
  CATEGORY_DEFAULT_SEVERITY,
  DISPATCHABLE_CATEGORIES,
  PUBLIC_EMERGENCY_NUMBERS,
  SAFETY_HINTS
} = require("../services/customerCore/emergencyConfig");
const { claimProfessional, reassignWaitingWork } = require("../services/customerCore");

const ACTIVE_EMERGENCY_STATUSES = ["Dispatched", "OnTheWay", "Arrived"];

// DISPATCH EMERGENCY SERVICE
const dispatchEmergency = async (req, res) => {
  try {
    const { category, severity, description, contactNumber, address, area } = req.body;
    const userId = req.user._id;

    // Fire / medical: HomeEase is not an emergency service — send the
    // customer to the real one instead of dispatching a handyman.
    if (PUBLIC_EMERGENCY_NUMBERS[category]) {
      const { number, service } = PUBLIC_EMERGENCY_NUMBERS[category];
      return res.status(422).json({
        success: false,
        callNumber: number,
        message: `For a ${category.toLowerCase()} emergency, call ${number} (${service}) or 112 right away. HomeEase specialists can't respond to ${category.toLowerCase()} emergencies.`
      });
    }

    if (!DISPATCHABLE_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid emergency category. Must be one of: ${DISPATCHABLE_CATEGORIES.join(", ")}.`
      });
    }

    // One live emergency per customer — stops one account from tying up
    // every nearby specialist.
    const existing = await EmergencyRequest.findOne({ user: userId, status: { $in: ACTIVE_EMERGENCY_STATUSES } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "You already have an active emergency request. Cancel it or wait until it's resolved before raising another."
      });
    }

    const resolvedSeverity = SEVERITY_CONFIG[severity] ? severity : (CATEGORY_DEFAULT_SEVERITY[category] || "Medium");
    const severityConfig = SEVERITY_CONFIG[resolvedSeverity];

    // Nearest (by area) on-duty specialist who isn't mid-way through a
    // scheduled job.
    // No match → the emergency waits and the scheduler retries every minute.
    const { professional, distanceKm } = await claimProfessional(category, area);

    const emergency = await EmergencyRequest.create({
      user: userId,
      category,
      severity: resolvedSeverity,
      description,
      contactNumber,
      address,
      status: "Dispatched",
      assignedProfessional: professional ? professional._id : null,
      fireEngineDispatched: false,
      fireEngineNumber: null,
      emergencyServiceNumber: null,
      estimatedArrivalMinutes: severityConfig.estimatedArrivalMinutes,
      area,
      assignedDistanceKm: distanceKm
    });

    const populatedEmergency = await EmergencyRequest.findById(emergency._id).populate("assignedProfessional");

    let message = professional
      ? `Emergency dispatched! ${professional.name}${professional.locality ? ` from ${professional.locality}` : ""} is on the way.`
      : "Emergency received. No specialist is free right now — we'll assign one the moment someone is available.";
    message += ` ${SAFETY_HINTS[category]}`;

    if (metrics && metrics.emergencyRequestsTotal) {
      metrics.emergencyRequestsTotal.labels(category, resolvedSeverity).inc();
    }

    return res.status(201).json({
      success: true,
      message,
      severity: resolvedSeverity,
      severityLabel: severityConfig.label,
      estimatedArrivalMinutes: severityConfig.estimatedArrivalMinutes,
      safetyHint: SAFETY_HINTS[category],
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

    // Atomic, so cancelling twice can't free the specialist twice.
    const cancelled = await EmergencyRequest.findOneAndUpdate(
      { _id: emergency._id, status: emergency.status },
      { $set: { status: "Cancelled", resolvedAt: new Date() } },
      { new: true }
    );
    if (!cancelled) {
      return res.status(409).json({ success: false, message: "This request was just updated. Please refresh." });
    }

    if (cancelled.assignedProfessional) {
      await Professional.updateOne({ _id: cancelled.assignedProfessional, status: "Busy" }, { $set: { status: "Available" } });
      reassignWaitingWork().catch((err) =>
        logger.error({ err: err.message }, "Auto-reassignment error")
      );
    }

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