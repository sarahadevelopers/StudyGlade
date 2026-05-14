// utils/contentFilter.js
const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
const phoneRegex = /(?:\+?254|0)[7-9][0-9]{8}\b|\+\d{1,3}[-.\s]?\d{3,12}\b|\b0[0-9]{9,10}\b/;
const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*)/;
const keywords = /\b(gmail|yahoo|outlook|hotmail|protonmail|aol|mail\.com|icloud|me\.com|whatsapp|telegram|signal|wechat|viber|discord|skype|facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com|tiktok\.com|paypal\.me|buymeacoffee|ko-fi|patreon|onlyfans)\b/gi;

function getMatchingPattern(text) {
  if (emailRegex.test(text)) return 'email';
  if (phoneRegex.test(text)) return 'phone';
  if (urlRegex.test(text)) return 'url';
  if (keywords.test(text)) return 'keyword';
  return null;
}

function containsContactInfo(text) {
  return getMatchingPattern(text) !== null;
}

function redactContactInfo(text) {
  if (!text) return text;
  let result = text;
  result = result.replace(emailRegex, '[EMAIL REDACTED]');
  result = result.replace(phoneRegex, '[PHONE REDACTED]');
  result = result.replace(urlRegex, '[URL REDACTED]');
  result = result.replace(keywords, '[PROHIBITED TERM]');
  return result;
}

module.exports = { containsContactInfo, getMatchingPattern, redactContactInfo };