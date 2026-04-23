const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail', // or any SMTP
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
async function sendEmail(to, subject, text) {
  await transporter.sendMail({ from: 'noreply@studyglade.com', to, subject, text });
}
module.exports = sendEmail;