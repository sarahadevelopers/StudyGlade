require('dotenv').config();
const mongoose = require('mongoose');
const Document = require('./models/Document');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const doc = await Document.findOne({ slug: "sudah" });
  if (doc) {
    console.log(`Title: ${doc.title}`);
    console.log(`isApproved: ${doc.isApproved}`);
    console.log(`slug: ${doc.slug}`);
  } else {
    console.log("Document with slug 'sudah' not found");
  }
  process.exit();
}
check();