const https = require('https');

function sendConfirmationEmail({
  apiKey,
  from,
  to,
  subject,
  html
}) {
  if (!apiKey || !from) {
    console.log('[email] Missing RESEND_API_KEY or EMAIL_FROM. Skipping send.');
    return Promise.resolve({ skipped: true });
  }
  const payload = JSON.stringify({ from, to, subject, html });
  const options = {
    hostname: 'api.resend.com',
    path: '/emails',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true });
        } else {
          console.error('[email] Failed to send', res.statusCode, data);
          resolve({ success: false, statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on('error', err => {
      console.error('[email] Error', err.message);
      resolve({ success: false, error: err });
    });
    req.write(payload);
    req.end();
  });
}

module.exports = { sendConfirmationEmail };
