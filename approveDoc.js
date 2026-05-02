// approveDoc.js
require('dotenv').config();
const mongoose = require('mongoose');
const Document = require('./models/Document');

async function approveDocument() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const result = await Document.updateOne(
      { slug: "sudah" },
      { $set: { isApproved: true } }
    );
    console.log(`Document updated: ${result.modifiedCount} document(s) modified`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
approveDocument();