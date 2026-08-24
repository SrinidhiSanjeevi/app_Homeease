const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");

const SEVERITY_CONFIG = {
  Low: {
    fireEngineDispatched: false,
    fireEngineNumber: null,
    emergencyServiceNumber: null,
    estimatedArrivalMinutes: 30,
    label: "Standard Response"
  },
  Medium: {
    fireEngineDispatched: false,
    fireEngineNumber: null,
    emergencyServiceNumber: "1800-SERV-HELP",
    estimatedArrivalMinutes: 20,
    label: "Priority Response"
  },
  High: {
    fireEngineDispatched: true,
    fireEngineNumber: "FE-2024",
    emergencyServiceNumber: "101",
    estimatedArrivalMinutes: 10,
    label: "High Priority — Fire/Emergency Services Alerted"
  },
  Critical: {
    fireEngineDispatched: true,
    fireEngineNumber: "FE-ALPHA-01",
    emergencyServiceNumber: "101",
    estimatedArrivalMinutes: 5,
    label: "CRITICAL — All Emergency Units Dispatched"
  }
};

const CATEGORY_DEFAULT_SEVERITY = {
  Electrical: "High",
  Fire: "Critical",
  Medical: "Critical",
  Plumbing: "Medium",
  Security: "High"
};

// DISPATCH EMERGENCY SERVICE
const dispatchEmergency = async (req, res) => {
  try {
    const { category, severity, description, contactNumber, address } = req.body;
    const userId = req.user._id;

    const validCategories = ["Electrical", "Plumbing", "Security", "Fire", "Medical"];
    if (!category || !validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid emergency category. Must be one of: ${validCategories.join(", ")}.`
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

    const professional = await Professional.findOne({
      category: category === "Fire" || category === "Medical" ? "Electrical" : category,
      status: "Available"
    }).sort({ rating: -1 });

    if (professional) {
      professional.status = "Busy";
      await professional.save();
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
      estimatedArrivalMinutes: severityConfig.estimatedArrivalMinutes
    });

    const populatedEmergency = await EmergencyRequest.findById(emergency._id).populate("assignedProfessional");

    let message = professional
      ? `Emergency dispatched! Assigned provider: ${professional.name}.`
      : "Emergency requested! Searching for an available nearby provider...";

    if (severityConfig.fireEngineDispatched) {
      message += ` Fire Engine ${severityConfig.fireEngineNumber} has been alerted. Call ${severityConfig.emergencyServiceNumber} for immediate fire/safety assistance.`;
    } else if (severityConfig.emergencyServiceNumber) {
      message += ` Helpline: ${severityConfig.emergencyServiceNumber}.`;
    }
    message += ` ETA: ~${severityConfig.estimatedArrivalMinutes} minutes.`;

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
    console.error("EMERGENCY DISPATCH ERROR:", error);
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// CANCEL EMERGENCY REQUEST
// FIX: replaces the old updateEmergencyStatus, which had NO
// ownership check — any authenticated user could change the status
// of any other user's emergency by ID. Customers may now only
// cancel their own, non-resolved/non-cancelled request. Full status
// control (OnTheWay/Arrived/Resolved) is admin-only — see
// admin-backend's adminController.updateEmergencyStatus.
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
      await Professional.findByIdAndUpdate(emergency.assignedProfessional, { status: "Available" });
    }
    await emergency.save();

    const populatedEmergency = await EmergencyRequest.findById(emergency._id).populate("assignedProfessional");

    return res.status(200).json({
      success: true,
      message: "Emergency request cancelled",
      emergency: populatedEmergency
    });
  } catch (error) {
    console.error("CANCEL EMERGENCY ERROR:", error);
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
    console.error("GET EMERGENCIES ERROR:", error);
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
    console.error("GET ALL EMERGENCIES ERROR:", error);
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

module.exports = {
  dispatchEmergency,
  cancelEmergency,
  getActiveEmergencies,
  getAllEmergencies
};