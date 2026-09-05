const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
      heartbeatFrequencyMS: 30000
    });

    logger.info("MongoDB Connected Successfully");
  } catch (error) {
    logger.error({ err: error.message }, "MongoDB Connection Failed");
    process.exit(1);
  }

  // Handle errors/disconnects that happen AFTER the initial connect.
  mongoose.connection.on("error", (err) => {
    logger.error({ err: err.message }, "MongoDB runtime error");
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected — mongoose will attempt to reconnect");
  });

  mongoose.connection.on("reconnected", () => {
    logger.info("MongoDB reconnected");
  });
};

module.exports = connectDB;