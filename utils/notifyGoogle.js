// utils/notifyGoogle.js
const axios = require('axios');

async function pingGoogleSitemap() {
  const sitemapUrl = 'https://studyglade.onrender.com/sitemap.xml';
  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
  try {
    const response = await axios.get(pingUrl);
    console.log('✅ Google sitemap pinged successfully:', response.status);
  } catch (err) {
    console.error('❌ Failed to ping Google:', err.message);
  }
}

module.exports = pingGoogleSitemap;