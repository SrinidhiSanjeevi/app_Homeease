const mongoose = require("mongoose");
const dns = require("dns");

// Fix for Node.js v24+ SRV DNS resolution issue with some system DNS servers
// Forces Node to use Google's public DNS which properly handles MongoDB Atlas SRV records
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log("MongoDB Connected Successfully");
  } catch (error) {
    console.error("MongoDB Connection Failed:", error.message);
    console.error("Tip: Make sure your IP is whitelisted in MongoDB Atlas Network Access (0.0.0.0/0 for anywhere).");
    process.exit(1);
  }
};

module.exports = connectDB;