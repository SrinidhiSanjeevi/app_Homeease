const mongoose = require("mongoose");
const dns = require("dns");

// FIX: this fix existed in backend/config/db.js but was missing here —
// admin-backend connects to the same Atlas cluster and is exposed to the
// same Node v24+ SRV DNS resolution issue with some system DNS servers.
// Forces Node to use public DNS resolvers that handle Atlas SRV records correctly.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

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
};

module.exports = connectDB;