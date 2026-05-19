// generate-sitemap.js
const fs = require('fs');
const path = require('path');

// Define all the URLs you want in your sitemap
const pages = [
  { url: '/', priority: '1.0', changefreq: 'daily' },
  { url: '/subjects', priority: '0.9', changefreq: 'weekly' },
  { url: '/pricing', priority: '0.8', changefreq: 'weekly' },
  { url: '/tutors', priority: '0.9', changefreq: 'daily' },
  { url: '/login.html', priority: '0.7', changefreq: 'monthly' },
  { url: '/register.html', priority: '0.8', changefreq: 'monthly' },
  { url: '/document-library.html', priority: '0.8', changefreq: 'daily' },
  { url: '/find-tutors.html', priority: '0.8', changefreq: 'daily' },
  { url: '/post-question.html', priority: '0.9', changefreq: 'daily' },
  { url: '/student-dashboard.html', priority: '0.7', changefreq: 'weekly' },
  { url: '/tutor-dashboard.html', priority: '0.7', changefreq: 'weekly' },
  { url: '/upload-document.html', priority: '0.6', changefreq: 'weekly' },
];

// If you have dynamic pages (e.g., questions, tutors from database), fetch them here.
// For now, we'll use static pages only. You can extend this later.

// Get today's date in YYYY-MM-DD format
const today = new Date().toISOString().split('T')[0];

// Build the XML sitemap
let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

pages.forEach(page => {
  sitemap += `  <url>
    <loc>https://studyglade.com${page.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>\n`;
});

sitemap += `</urlset>`;

// Define output path: inside the docs/ folder
const outputPath = path.join(__dirname, 'docs', 'sitemap.xml');

try {
  fs.writeFileSync(outputPath, sitemap, 'utf8');
  console.log(`✅ Sitemap generated successfully at ${outputPath}`);
} catch (err) {
  console.error('❌ Error writing sitemap file:', err);
}