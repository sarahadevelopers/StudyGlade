// scripts/fixCorruptedPreviews.js
require('dotenv').config();
const mongoose = require('mongoose');
const Document = require('../models/Document');

// Same dummy preview generator (copy from above)
function generateDummyPreview() {
  const lorem = `This document contains valuable academic content. To protect the author's work, the full preview is hidden. Unlock to access the complete document including all chapters, examples, and detailed explanations. The content includes comprehensive research, step‑by‑step guides, and original analysis that will help you succeed in your studies. `;
  return lorem.repeat(5).substring(0, 500) + '...';
}

async function fixPreviews() {
  await mongoose.connect(process.env.MONGODB_URI);
  const docs = await Document.find({ isApproved: true });
  let updated = 0;

  for (const doc of docs) {
    const preview = doc.previewText || '';
    // Detect garbage: high ratio of non‑printable chars OR too short
    const nonPrintableRatio = preview.replace(/[\x20-\x7E]/g, '').length / (preview.length || 1);
    if (nonPrintableRatio > 0.3 || preview.length < 20 || preview.includes('Preview not available')) {
      doc.previewText = generateDummyPreview();
      await doc.save();
      updated++;
      console.log(`Fixed preview for: ${doc.title}`);
    }
  }

  console.log(`✅ Updated ${updated} documents with dummy preview`);
  process.exit(0);
}

fixPreviews().catch(console.error);