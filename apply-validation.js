const mongoose = require('mongoose');
require('dotenv').config();

async function applyValidation() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    const result = await db.command({
      collMod: "users",
      validator: {
        $jsonSchema: {
          bsonType: "object",
          properties: {
            walletBalance: { bsonType: "double", minimum: 0 }
          }
        }
      },
      validationLevel: "strict",
      validationAction: "error"
    });
    
    console.log("✅ Validation applied successfully:", result);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

applyValidation();