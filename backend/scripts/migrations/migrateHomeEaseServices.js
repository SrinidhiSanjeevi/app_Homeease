const mongoose = require("mongoose");
require("dotenv").config();

const Service = require("../../models/Service");

const STORAGE_ACCOUNT = "sthomeeaseimggvz8nk";

const imageMap = {
  "AC Deep Filter & Foam Service":
    "AC Deep Filter & Foam Service.jpeg",

  "Bed & Wardrobe Assembly":
    "Bed & Wardrobe Assembly.jpeg",

  "CCTV Camera Installation":
    "CCTV Camera Installation.jpeg",

  "Ceiling Fan Installation & Repair":
    "Ceiling Fan Installation & Repair.jpg",

  "Complete Home Safety Wiring Check":
    "Complete Home Safety Wiring Check.jpeg",

  "Deep House Cleaning":
    "Deep House Cleaning.jpeg",

  "Door & Window Lock Fixing":
    "Door & Window Lock Fixing.jpeg",

  "Drain & Pipe Blockage Unclogging":
    "Drain & Pipe Blockage Unclogging.jpeg",

  "Dripping Tap & Leaks Repair":
    "Dripping Tap & Leaks Repair.jpeg",

  "Glowing Gold Facial":
    "Glowing Gold Facial.jpg",

  "Organic Hair Coloring":
    "Organic Hair Coloring.jpg",

  "Premium Haircut & Styling":
    "Premium Haircut & Styling.jpeg",

  "Relaxing Aromatherapy Massage":
    "Relaxing Aromatherapy Massage.jpeg",

  "Smart Wi-Fi Door Lock Setup":
    "SmAart Wi-Fi Door Lock Setup.jpeg",

  "Sofa & Upholstery Dry Cleaning":
    "Sofa & Upholstery Dry Cleaning.jpeg",

  "Sofa Frame & Cabinet Repair":
    "Sofa Frame & Cabinet Repair.jpeg",

  "Switchboard Repair & Socket Installation":
    "Switchboard Repair & Socket Installation.jpeg",

  "Toilet Flush & Commode Repair":
    "Toilet Flush & Commode Repair.jpeg",

  "Water Tank Leakage & Issue Diagnostics":
    "Water Tank Leakage & Issue Diagnostics.jpeg"
};

function makeImageAlt(service) {
  return `${service.name} service`;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const services = await Service.find({});

  console.log(`Found ${services.length} services`);

  if (services.length !== 19) {
    throw new Error(
      `Expected 19 services, but found ${services.length}. Migration stopped.`
    );
  }

  for (const service of services) {
    const imageName = imageMap[service.name];

    if (!imageName) {
      throw new Error(
        `No Blob image mapping found for service: ${service.name}`
      );
    }

    const imageKey = `service-images/${imageName}`;

    const bookingCount =
      typeof service.bookingCount === "number"
        ? service.bookingCount
        : typeof service.numRatings === "number"
          ? service.numRatings
          : 0;

    const completedBookingCount =
      typeof service.completedBookingCount === "number"
        ? service.completedBookingCount
        : 0;

    await Service.updateOne(
      { _id: service._id },
      {
        $set: {
          ratingCount:
            typeof service.ratingCount === "number"
              ? service.ratingCount
              : service.numRatings || 0,

          imageKey,

          imageAlt: makeImageAlt(service),

          bookingCount,

          completedBookingCount,

          active:
            typeof service.active === "boolean"
              ? service.active
              : true
        },

        $unset: {
          image: "",
          numRatings: ""
        }
      }
    );

    console.log(
      `UPDATED: ${service.name} -> ${imageKey}`
    );
  }

  console.log("\nService migration completed successfully.");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("\nMigration failed:");
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {}

  process.exit(1);
});
