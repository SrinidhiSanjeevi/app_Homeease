const mongoose = require("mongoose");
const logger = require("../utils/logger");
const { mongodbConnectionState } = require("../metrics");
const metricsPlugin = require("./metricsPlugin");

// Register global Mongoose metrics plugin before any model is compiled
mongoose.plugin(metricsPlugin);

// Connection lifecycle event listeners
mongoose.connection.on("connected", () => {
  mongodbConnectionState.set(1);
  logger.info("Admin Microservice MongoDB connected");
});

mongoose.connection.on("error", (err) => {
  logger.error({ err: err.message }, "Admin Microservice MongoDB runtime error");
});

mongoose.connection.on("disconnected", () => {
  mongodbConnectionState.set(0);
  logger.warn("Admin Microservice MongoDB disconnected — mongoose will attempt to reconnect");
});

mongoose.connection.on("reconnected", () => {
  mongodbConnectionState.set(1);
  logger.info("Admin Microservice MongoDB reconnected");
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
      heartbeatFrequencyMS: 30000
    });

    mongodbConnectionState.set(1);
    logger.info("Admin Microservice MongoDB Connected Successfully");
  } catch (error) {
    logger.fatal(
      { err: error.message },
      "Admin Microservice MongoDB Connection Failed"
    );
    process.exit(1);
  }
};

module.exports = connectDB;