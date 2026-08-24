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
};

module.exports = connectDB;