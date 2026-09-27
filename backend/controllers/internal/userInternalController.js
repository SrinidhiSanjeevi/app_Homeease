/**
 * Internal User Controller
 *
 * Backs GET /api/internal/users/:id, which notification-service calls
 * instead of holding its own copy of the User model. Deliberately a
 * separate, much narrower endpoint than admin-backend's
 * /api/internal/admin/users/:id (adminBookingController.js's getUserById,
 * which returns every field except password for the admin UI) — this one
 * returns only { _id, name, email }, never password/role/phone/address or
 * any other permissions/MFA-adjacent field, since notification-service only
 * needs a recipient name and email address for its templates.
 *
 * Sits behind requireInternalToken (middleware/internalAuth.js) — no
 * end-user JWT is checked; the calling service already did human-level auth.
 */

const mongoose = require("mongoose");
const User = require("../../models/User");
const logger = require("../../utils/logger");

const PROJECTION = "_id name email";

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const user = await User.findById(id).select(PROJECTION).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    logger.error({ err: error.message }, "Internal Get User Error");
    return res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

module.exports = { getUserById };
