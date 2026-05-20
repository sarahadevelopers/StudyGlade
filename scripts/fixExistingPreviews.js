require('dotenv').config();
const mongoose = require('mongoose');
const Document = require('../models/Document');
const fs = require('fs').promises;
const path = require('path');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (same as your app)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function extractPreviewTextFromFile(fileUrl) {
  // Download file from Cloudinary and extract text (simplified)
  // For a full script, you'd need to fetch the file from Cloudinary,
  // then run the same extraction logic as in extractPreviewText.
  // This is complex because you need to handle PDF/DOCX/TXT.
  // A simpler approach: just set a fallback message for all corrupted previews.
  return null;
}

async function fixPreviews() {
  await mongoose.connect(process.env.MONGODB_URI);
  const docs = await Document.find({ isApproved: true });
  let updated = 0;
  for (const doc of docs) {
    const preview = doc.previewText || '';
    // Detect if preview is mostly non‑printable characters
    const nonPrintableRatio = preview.replace(/[\x20-\x7E]/g, '').length / (preview.length || 1);
    if (nonPrintableRatio > 0.3 || preview.length < 20) {
      doc.previewText = 'Preview not available. Unlock to see the full document.';
      await doc.save();
      updated++;
      console.log(`Fixed preview for ${doc.title}`);
    }
  }
  console.log(`Fixed ${updated} documents`);
  process.exit(0);
}

fixPreviews().catch(console.error);