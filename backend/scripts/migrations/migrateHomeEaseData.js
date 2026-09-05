const mongoose = require("mongoose");
require("dotenv").config();

const Service = require("../../models/Service");

const MONGO_URI = process.env.MONGO_URI;

const services = {
  "Dripping Tap & Leaks Repair": {
    imageKey: "service-images/Dripping Tap & Leaks Repair.jpeg",
    imageAlt: "Dripping Tap and Leaks Repair service"
  },

  "Organic Hair Coloring": {
    imageKey: "service-images/Organic Hair Coloring.jpg",
    imageAlt: "Organic Hair Coloring service"
  },

  "CCTV Camera Installation": {
    imageKey: "service-images/CCTV Camera Installation.jpeg",
    imageAlt: "CCTV Camera Installation service"
  },

  "Switchboard Repair & Socket Installation": {
    imageKey: "service-images/Switchboard Repair & Socket Installation.jpeg",
    imageAlt: "Switchboard Repair and Socket Installation service"
  },

  "Relaxing Aromatherapy Massage": {
    imageKey: "service-images/Relaxing Aromatherapy Massage.jpeg",
    imageAlt: "Relaxing Aromatherapy Massage service"
  },

  "Sofa Frame & Cabinet Repair": {
    imageKey: "service-images/Sofa Frame & Cabinet Repair.jpeg",
    imageAlt: "Sofa Frame and Cabinet Repair service"
  },

  "Smart Wi-Fi Door Lock Setup": {
    imageKey: "service-images/SmAart Wi-Fi Door Lock Setup.jpeg",
    imageAlt: "Smart Wi-Fi Door Lock Setup service"
  },

  "AC Deep Filter & Foam Service": {
    imageKey: "service-images/AC Deep Filter & Foam Service.jpeg",
    imageAlt: "AC Deep Filter and Foam Service"
  },

  "Bed & Wardrobe Assembly": {
    imageKey: "service-images/Bed & Wardrobe Assembly.jpeg",
    imageAlt: "Bed and Wardrobe Assembly service"
  },

  "Ceiling Fan Installation & Repair": {
    imageKey: "service-images/Ceiling Fan Installation & Repair.jpg",
    imageAlt: "Ceiling Fan Installation and Repair service"
  },

  "Complete Home Safety Wiring Check": {
    imageKey: "service-images/Complete Home Safety Wiring Check.jpeg",
    imageAlt: "Complete Home Safety Wiring Check service"
  },

  "Deep House Cleaning": {
    imageKey: "service-images/Deep House Cleaning.jpeg",
    imageAlt: "Deep House Cleaning service"
  },

  "Door & Window Lock Fixing": {
    imageKey: "service-images/Door & Window Lock Fixing.jpeg",
    imageAlt: "Door and Window Lock Fixing service"
  },

  "Drain & Pipe Blockage Unclogging": {
    imageKey: "service-images/Drain & Pipe Blockage Unclogging.jpeg",
    imageAlt: "Drain and Pipe Blockage Unclogging service"
  },

  "Glowing Gold Facial": {
    imageKey: "service-images/Glowing Gold Facial.jpg",
    imageAlt: "Glowing Gold Facial service"
  },

  "Premium Haircut & Styling": {
    imageKey: "service-images/Premium Haircut & Styling.jpeg",
    imageAlt: "Premium Haircut and Styling service"
  },

  "Relaxing Aromatherapy Massage": {
    imageKey: "service-images/Relaxing Aromatherapy Massage.jpeg",
    imageAlt: "Relaxing Aromatherapy Massage service"
  },

  "Sofa & Upholstery Dry Cleaning": {
    imageKey: "service-images/Sofa & Upholstery Dry Cleaning.jpeg",
    imageAlt: "Sofa and Upholstery Dry Cleaning service"
  },

  "Toilet Flush & Commode Repair": {
    imageKey: "service-images/Toilet Flush & Commode Repair.jpeg",
    imageAlt: "Toilet Flush and Commode Repair service"
  },

  "Water Tank Leakage & Issue Diagnostics": {
    imageKey: "service-images/Water Tank Leakage & Issue Diagnostics.jpeg",
    imageAlt: "Water Tank Leakage and Issue Diagnostics service"
  }
};

async function main() {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI is not defined");
  }

  await mongoose.connect(MONGO_URI);

  console.log("Connected to MongoDB Atlas\n");

  for (const [name, data] of Object.entries(services)) {
    const service = await Service.findOne({ name });

    if (!service) {
      console.log(`NOT FOUND: ${name}`);
      continue;
    }

    await Service.updateOne(
      { _id: service._id },
      {
        $set: {
          imageKey: data.imageKey,
          imageAlt: data.imageAlt,

          rating:
            typeof service.rating === "number"
              ? service.rating
              : 0,

          ratingCount:
            typeof service.numRatings === "number"
              ? service.numRatings
              : 0,

          bookingCount:
            typeof service.bookingCount === "number"
              ? service.bookingCount
              : 0,

          completedBookingCount:
            typeof service.completedBookingCount === "number"
              ? service.completedBookingCount
              : 0,

          active: true
        },

        $unset: {
          image: "",
          numRatings: ""
        }
      }
    );

    console.log(`UPDATED: ${name}`);
    console.log(`  _id: ${service._id}`);
    console.log(`  imageKey: ${data.imageKey}`);
  }

  await mongoose.disconnect();

  console.log("\nService migration completed successfully.");
}

main().catch(async (error) => {
  console.error("\nMigration failed:");
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {}

  process.exit(1);
});