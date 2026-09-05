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

    logger.info("Admin Microservice MongoDB Connected Successfully");
  } catch (error) {
    logger.fatal(
      { err: error.message },
      "Admin Microservice MongoDB Connection Failed"
    );
    process.exit(1);
  }

  // Handle errors/disconnects that happen AFTER the initial connect.
  // Without these listeners, an 'error' event on the connection is
  // unhandled and crashes the whole process (exit code 1) instead of
  // letting mongoose's own reconnection logic handle it.
  mongoose.connection.on("error", (err) => {
    logger.error({ err: err.message }, "Admin Microservice MongoDB runtime error");
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("Admin Microservice MongoDB disconnected — mongoose will attempt to reconnect");
  });

  mongoose.connection.on("reconnected", () => {
    logger.info("Admin Microservice MongoDB reconnected");
  });
};

module.exports = connectDB;