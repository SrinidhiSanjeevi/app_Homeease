const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log("Admin Microservice MongoDB Connected Successfully");
  } catch (error) {
    console.error(
      "Admin Microservice MongoDB Connection Failed:",
      error.message
    );
    process.exit(1);
  }

  // Handle errors/disconnects that happen AFTER the initial connect.
  // Without these listeners, an 'error' event on the connection is
  // unhandled and crashes the whole process (exit code 1) instead of
  // letting mongoose's own reconnection logic handle it.
  mongoose.connection.on("error", (err) => {
    console.error("Admin Microservice MongoDB runtime error:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("Admin Microservice MongoDB disconnected — mongoose will attempt to reconnect");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("Admin Microservice MongoDB reconnected");
  });
};

module.exports = connectDB;