/**
 * Secure Admin Account Bootstrapping Script
 * 
 * Usage:
 *   INITIAL_ADMIN_EMAIL="admin@homeease.com" INITIAL_ADMIN_PASSWORD="YourStrongPassword123!" node scripts/seedAdmin.js
 * 
 * In Production:
 *   Invoked via CI/CD, Kubernetes Job, or deployment hook reading from Azure Key Vault / AWS Secrets Manager.
 *   NO passwords are ever committed to git.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { generateSecret, getOtpAuthUrl } = require("../utils/totp");

async function seedAdmin() {
  const email = (process.env.INITIAL_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME || "System Administrator";
  const mongoUri = process.env.MONGO_URI;

  if (!email || !password) {
    console.error("❌ Error: INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD environment variables are required.");
    console.error("Example:");
    console.error('  INITIAL_ADMIN_EMAIL="admin@homeease.com" INITIAL_ADMIN_PASSWORD="StrongPassword123!" node scripts/seedAdmin.js');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("❌ Error: Admin password must be at least 8 characters long.");
    process.exit(1);
  }

  if (!mongoUri) {
    console.error("❌ Error: MONGO_URI is missing in environment.");
    process.exit(1);
  }

  try {
    console.log("Connecting to database...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB.");

    const hashedPassword = await bcrypt.hash(password, 10);
    const existingAdmin = await User.findOne({ email });

    let mfaSecret = existingAdmin?.mfaSecret;
    if (!mfaSecret) {
      mfaSecret = generateSecret();
    }

    const adminDoc = {
      name,
      email,
      password: hashedPassword,
      role: "admin",
      permissions: ["all"],
      active: true,
      failedLoginAttempts: 0,
      lockUntil: null,
      mfaSecret,
      isMfaEnabled: process.env.ADMIN_ENABLE_MFA === "true" || existingAdmin?.isMfaEnabled || false
    };

    if (existingAdmin) {
      await User.updateOne({ email }, { $set: adminDoc });
      console.log(`✅ Admin account '${email}' updated successfully with role: 'admin' and full permissions.`);
    } else {
      await User.create(adminDoc);
      console.log(`✅ Admin account '${email}' created successfully.`);
    }

    const otpAuthUrl = getOtpAuthUrl(email, mfaSecret, "HomeEase");
    console.log("\n==========================================");
    console.log("🔑 ADMIN CREDENTIALS INITIALIZED SAFELY");
    console.log(`Email:       ${email}`);
    console.log(`Role:        admin`);
    console.log(`Permissions: ["all"]`);
    console.log(`MFA Secret:  ${mfaSecret}`);
    console.log(`OTP Auth URL:${otpAuthUrl}`);
    console.log("==========================================\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to seed admin account:", error.message);
    process.exit(1);
  }
}

seedAdmin();
