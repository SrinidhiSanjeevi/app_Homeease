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
