const path = require('path');
const ejs = require('ejs');
const { Resend } = require('resend');

let resend = null;
try {
  if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('✅ Resend initialized in email utils');
  } else {
    console.warn('⚠️ RESEND_API_KEY not set – emails will be logged to console');
  }
} catch (err) {
  console.error('❌ Failed to initialize Resend:', err.message);
}

/**
 * Send an email using Resend.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML content
 */
async function sendEmail(to, subject, html) {
  if (!resend) {
    console.log(`📧 [DEV] Email to ${to}: ${subject} - ${html.substring(0, 200)}`);
    return;
  }
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.NODE_ENV === 'production' 
        ? 'StudyGlade <info@studyglade.com>'
        : 'StudyGlade <onboarding@resend.dev>',
      to: [to],
      subject: subject,
      html: html,
    });
    if (error) throw error;
    console.log(`✅ Email sent to ${to} – ID: ${data.id}`);
  } catch (err) {
    console.error('❌ Resend error:', err.message);
  }
}

/**
 * Render an EJS email template and send it.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} templateName - Name of EJS file in views/emails/ (e.g., 'welcome.ejs')
 * @param {object} data - Data to pass to the template
 */
async function sendEmailWithTemplate(to, subject, templateName, data) {
  try {
    const templatePath = path.join(__dirname, '../views/emails/', templateName);
    const html = await ejs.renderFile(templatePath, data, { async: true });
    await sendEmail(to, subject, html);
  } catch (err) {
    console.error(`❌ Failed to render/send email template ${templateName}:`, err);
  }
}

module.exports = { sendEmail, sendEmailWithTemplate };