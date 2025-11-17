const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const DataStore = require('./datastore');
const { sendConfirmationEmail } = require('./email');

const rootDir = path.join(__dirname, '..');
const dataPath = path.join(rootDir, 'data', 'store.json');

loadEnv();
const PORT = process.env.PORT || 4000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me';
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const EMAIL_FROM = process.env.EMAIL_FROM || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

const store = new DataStore(dataPath);

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const { pathname, searchParams } = parsedUrl;

  if (pathname.startsWith('/api')) {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    if (pathname === '/api/signups' && req.method === 'POST') {
      return handleSignup(req, res, searchParams);
    }
    if (pathname === '/api/signups/confirm' && req.method === 'GET') {
      return handleConfirm(req, res, searchParams);
    }
    if (pathname === '/api/field-notes' && req.method === 'GET') {
      return sendJSON(res, 200, store.getFieldNotes());
    }
    if (pathname === '/api/testimonials' && req.method === 'GET') {
      return sendJSON(res, 200, store.getTestimonials());
    }
    if (pathname === '/api/drop-state' && req.method === 'GET') {
      const state = store.getDropState();
      return sendJSON(res, 200, state);
    }
    if (pathname === '/api/insights/sizes' && req.method === 'GET') {
      return sendJSON(res, 200, store.getSizeCounts());
    }
    if (pathname === '/api/insights/signups' && req.method === 'GET') {
      return sendJSON(res, 200, store.getSignupTimeline());
    }
    if (pathname === '/api/codes/validate' && req.method === 'POST') {
      return handleCodeValidation(req, res);
    }
    if (pathname === '/api/events' && req.method === 'POST') {
      return handleEventLog(req, res);
    }
    if (pathname === '/api/admin/signups' && req.method === 'GET') {
      if (!isAdmin(req, searchParams)) return unauthorized(res);
      const filters = {
        size: searchParams.get('size') || undefined,
        confirmed: searchParams.has('confirmed') ? searchParams.get('confirmed') === 'true' : undefined,
        start: searchParams.get('start') || undefined,
        end: searchParams.get('end') || undefined
      };
      return sendJSON(res, 200, store.listSignups(filters));
    }
    if (pathname === '/api/admin/export' && req.method === 'GET') {
      if (!isAdmin(req, searchParams)) return unauthorized(res);
      const csv = toCSV(store.listSignups());
      res.writeHead(200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="snooom-signups.csv"'
      });
      return res.end(csv);
    }
    if (pathname === '/api/admin/referrals' && req.method === 'GET') {
      if (!isAdmin(req, searchParams)) return unauthorized(res);
      return sendJSON(res, 200, store.getReferrals());
    }
    if (pathname === '/api/admin/events' && req.method === 'GET') {
      if (!isAdmin(req, searchParams)) return unauthorized(res);
      return sendJSON(res, 200, store.getEventSummary());
    }
    if (pathname === '/api/admin/field-notes' && req.method === 'POST') {
      if (!isAdmin(req, searchParams)) return unauthorized(res);
      const body = await readBody(req);
      if (!body.quote || !body.author) return sendJSON(res, 400, { error: 'quote and author are required' });
      const record = store.addFieldNote(body);
      return sendJSON(res, 201, record);
    }
    if (pathname.startsWith('/api/admin/field-notes/') && (req.method === 'PUT' || req.method === 'DELETE')) {
      if (!isAdmin(req, searchParams)) return unauthorized(res);
      const id = pathname.split('/').pop();
      if (req.method === 'PUT') {
        const body = await readBody(req);
        const updated = store.updateFieldNote(id, body);
        if (!updated) return sendJSON(res, 404, { error: 'Not found' });
        return sendJSON(res, 200, updated);
      }
      const deleted = store.deleteFieldNote(id);
      if (!deleted) return sendJSON(res, 404, { error: 'Not found' });
      return sendJSON(res, 204, {});
    }
    if (pathname === '/api/admin/testimonials' && req.method === 'POST') {
      if (!isAdmin(req, searchParams)) return unauthorized(res);
      const body = await readBody(req);
      if (!body.quote || !body.author) return sendJSON(res, 400, { error: 'quote and author are required' });
      const record = store.addTestimonial(body);
      return sendJSON(res, 201, record);
    }
    if (pathname.startsWith('/api/admin/testimonials/') && (req.method === 'PUT' || req.method === 'DELETE')) {
      if (!isAdmin(req, searchParams)) return unauthorized(res);
      const id = pathname.split('/').pop();
      if (req.method === 'PUT') {
        const body = await readBody(req);
        const updated = store.updateTestimonial(id, body);
        if (!updated) return sendJSON(res, 404, { error: 'Not found' });
        return sendJSON(res, 200, updated);
      }
      const deleted = store.deleteTestimonial(id);
      if (!deleted) return sendJSON(res, 404, { error: 'Not found' });
      return sendJSON(res, 204, {});
    }
    return sendJSON(res, 404, { error: 'Not found' });
  }

  if (pathname === '/admin') {
    const adminPath = path.join(__dirname, 'admin.html');
    return serveFile(res, adminPath, 'text/html');
  }

  return serveStatic(res, pathname);
});

async function handleSignup(req, res, searchParams) {
  const body = await readBody(req);
  const name = (body.name || '').trim();
  const email = (body.email || '').toLowerCase().trim();
  const size = (body.size || '').toUpperCase();
  const sizes = ['S', 'M', 'L', 'XL', 'XXL'];
  if (!name || !email || !size || !sizes.includes(size)) {
    return sendJSON(res, 400, { error: 'name, email, and valid size are required' });
  }
  const referredByCode = (body.referralCode || searchParams.get('ref')) || null;
  const { existing, record } = store.upsertSignup({ name, email, size, referredByCode });
  if (existing) {
    return sendJSON(res, 200, {
      status: record.confirmed ? 'confirmed' : 'pending',
      message: record.confirmed ? 'You are already confirmed.' : 'Check your inbox to confirm your spot.',
      earlyAccessCode: record.earlyAccessCode,
      referralLink: `${APP_BASE_URL}/?ref=${record.referralCode}`
    });
  }
  const confirmUrl = `${APP_BASE_URL}/api/signups/confirm?token=${record.confirmationToken}`;
  const referralLink = `${APP_BASE_URL}/?ref=${record.referralCode}`;
  const emailHtml = `
    <h2>Confirm your SNOOOM Hoodie waitlist spot</h2>
    <p>Tap the link below to confirm:</p>
    <p><a href="${confirmUrl}">Confirm my spot</a></p>
    <p>Your early access code: <strong>${record.earlyAccessCode}</strong></p>
    <p>Share your referral link: <strong>${referralLink}</strong></p>
  `;
  sendConfirmationEmail({
    apiKey: RESEND_API_KEY,
    from: EMAIL_FROM,
    to: email,
    subject: 'Confirm your SNOOOM waitlist spot',
    html: emailHtml
  });
  return sendJSON(res, 201, {
    status: 'pending',
    message: 'Check your email to confirm your spot.',
    earlyAccessCode: record.earlyAccessCode,
    referralLink
  });
}

function handleConfirm(req, res, searchParams) {
  const token = searchParams.get('token');
  if (!token) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    return res.end('<h2>Missing confirmation token.</h2>');
  }
  const signup = store.confirmSignup(token);
  if (!signup) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    return res.end('<h2>Confirmation link is invalid or already used.</h2>');
  }
  const html = `
    <style>
      body { font-family: Arial, sans-serif; background:#050c1c; color:#f7f9ff; text-align:center; padding:60px; }
      a { color:#d8b46d; }
    </style>
    <h1>Confirmed.</h1>
    <p>You are officially on the list. Your code <strong>${signup.earlyAccessCode}</strong> will unlock early access once the drop opens.</p>
    <p><a href="${APP_BASE_URL}">Return to SNOOOM</a></p>
  `;
  res.writeHead(200, { 'Content-Type': 'text/html' });
  return res.end(html);
}

async function handleCodeValidation(req, res) {
  const body = await readBody(req);
  const code = (body.code || '').toUpperCase().trim();
  if (!code) return sendJSON(res, 400, { error: 'code is required' });
  const result = store.incrementCodeUsage(code);
  if (!result.success) return sendJSON(res, 400, { error: result.reason });
  return sendJSON(res, 200, { success: true, signup: { email: result.signup.email, name: result.signup.name } });
}

async function handleEventLog(req, res) {
  const body = await readBody(req);
  if (!body.type) return sendJSON(res, 400, { error: 'type is required' });
  store.logEvent({
    type: body.type,
    userId: body.userId || null,
    metadata: body.metadata || {}
  });
  return sendJSON(res, 201, { status: 'logged' });
}

function serveStatic(res, pathname) {
  let filePath = path.join(rootDir, pathname);
  if (pathname === '/' || pathname === '') {
    filePath = path.join(rootDir, 'index.html');
  }
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const type = getMimeType(filePath);
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Admin-Token');
}

function sendJSON(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function isAdmin(req, searchParams) {
  const headerToken = req.headers['x-admin-token'];
  const queryToken = searchParams ? searchParams.get('token') : null;
  return headerToken === ADMIN_TOKEN || (!!queryToken && queryToken === ADMIN_TOKEN);
}

function unauthorized(res) {
  return sendJSON(res, 401, { error: 'Unauthorized' });
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  };
  return map[ext] || 'application/octet-stream';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
  }).catch(() => ({}));
}

function toCSV(rows) {
  const headers = ['name', 'email', 'size', 'confirmed', 'referralCode', 'referralCount', 'createdAt'];
  const lines = [headers.join(',')];
  rows.forEach(row => {
    const line = headers.map(key => {
      const value = row[key] ?? '';
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return value;
    }).join(',');
    lines.push(line);
  });
  return lines.join('\n');
}

function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf-8');
  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    const value = rest.join('=');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

server.listen(PORT, () => {
  console.log(`SNOOOM backend running on http://localhost:${PORT}`);
});
