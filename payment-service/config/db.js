const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info({ host: conn.connection.host }, "Payment Service MongoDB Connected");
  } catch (error) {
    logger.error({ err: error.message }, "Payment Service MongoDB Connection Failed");
    process.exit(1);
  }
};

module.exports = connectDB;
