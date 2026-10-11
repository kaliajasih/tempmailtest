'use strict';

/**
 * TempMail Glass — Express backend
 * Menjembatani frontend (browser) dengan scraper Node.js (axios/cheerio),
 * sekaligus menyelesaikan masalah CORS karena API pihak ketiga tidak
 * mengizinkan request langsung dari origin browser.
 *
 * Endpoint (semuanya stateless — client mengirim {email, token, provider}):
 *   POST /api/create  -> buat alamat email baru
 *   GET  /api/inbox   -> ambil pesan masuk
 *   POST /api/delete  -> hapus mailbox
 *   GET  /api/health  -> cek status server
 */

const path = require('path');
const express = require('express');
const { TempMailClient } = require('./tempmail');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));

// Sajikan frontend dari /public (index.html sebagai landing page)
app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

const client = new TempMailClient();

const fail = (res, code, message) => res.status(code).json({ success: false, error: message });

// ---------- CREATE ----------
app.post('/api/create', async (req, res) => {
  const { provider = 'tempmail-chat', type, custom, domain } = req.body || {};
  try {
    const acc = await client.generate(String(provider), { type, custom, domain });
    return res.json({
      success: true,
      account: {
        email: acc.email,
        domain: acc.domain,
        user: acc.user,
        token: acc.token || null,
        password: acc.password || null,
        provider: acc.provider,
        expiresIn: acc.expiresIn || null,
        createdAt: acc.createdAt,
      },
    });
  } catch (err) {
    return fail(res, 502, err.message || 'Gagal membuat alamat email.');
  }
});

// ---------- INBOX ----------
app.get('/api/inbox', async (req, res) => {
  const { email, token, provider } = req.query;
  if (!email && !token) return fail(res, 400, 'Parameter email atau token wajib dikirim.');

  try {
    let messages = await client.inbox({
      email: email || '',
      token: token || '',
      provider: provider || '',
    });

    // Untuk generator.email: iframe tidak bisa memuat HTML langsung,
    // jadi cukup kembalikan ringkasannya saja + jangan bengkakkan payload.
    messages = messages.map((m) => ({
      id: m.id,
      from: m.from,
      sender_name: m.sender_name,
      sender_email: m.sender_email,
      subject: m.subject || '(Tanpa Subjek)',
      date: m.date,
      text: (m.text || '').slice(0, 20000),
      html: (m.html || '').slice(0, 200000),
      is_read: !!m.is_read,
      provider: m.provider,
    }));

    return res.json({ success: true, count: messages.length, messages });
  } catch (err) {
    return fail(res, 502, err.message || 'Gagal mengambil inbox.');
  }
});

// ---------- DELETE ----------
app.post('/api/delete', async (req, res) => {
  const { token, email, provider } = req.body || {};
  try {
    let result = { success: true, message: 'Sesi lokal dibersihkan.' };
    if (token && (provider === 'tempmail-chat' || provider === 'chat')) {
      result = await client.deleteTempMailChat(token);
    }
    return res.json({ success: true, message: result.message || 'Mailbox dihapus.' });
  } catch (err) {
    // Walaupun upstream gagal, sesi client tetap dianggap terhapus.
    return res.json({ success: true, message: `Mailbox dihapus lokal (${err.message}).` });
  }
});

// ---------- HEALTH ----------
app.get('/api/health', (req, res) => {
  res.json({ success: true, service: 'tempmail-glass', uptime: process.uptime(), time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\x1b[36m[TempMail Glass]\x1b[0m berjalan di http://localhost:${PORT}`);
});
