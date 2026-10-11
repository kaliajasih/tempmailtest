'use strict';

/**
 * Universal TempMail Multi-Provider Engine (stateless variant)
 * -----------------------------------------------------------
 * Diadaptasi dari scraper CLI asli agar bisa dipakai sebagai library server:
 *  - Modul `../../core/cloudflare-bypass` DIHAPUS (tidak tersedia di projek ini).
 *  - Engine `temp-mail-org` (butuh bypass Cloudflare) DIHAPUS.
 *  - Persistensi `.tempmail-session.json` DIHAPUS -> sesi hanya di memori,
 *    supaya setiap request bisa stateless (client mengirim {email, token, provider}).
 */

const axios = require('axios');
const cheerio = require('cheerio');

const GENERATOR_BASE_URL = 'https://generator.email/';
const TEMPMAIL_CHAT_PRIMARY_API = 'https://tempmail-backend.hasnaintariq142.workers.dev';
const TEMPMAIL_CHAT_FALLBACK_API = 'https://tempmail.chat';

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

// Pool domain cadangan (fallback) untuk generator.email.
const GENERATOR_ACTIVE_DOMAINS = [
  'dailynutria.com',
  'mkda9884.top',
  'thuha99.com',
  'cuaks.fun',
  'xx-p1.top',
  'lunarmoon.online',
  'sadsghghjj.top',
  'arigo.site',
  'pasarakun.me',
  'checkback.vn',
  'gohivezone.com',
  'ddat0511.click',
  'pp-tw.cc',
  'zlaughter.me',
  'regvippro.site',
  'icloudemail.kr',
  'syaacantik.me',
  'hiverun.io',
  'easyplainlife.com',
  'spotiy.site',
  'mevuba.tech',
  'meser.cc',
];

async function fetchLiveGeneratorDomain() {
  try {
    const res = await axios.get('https://generator.email/', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      timeout: 5000,
    });
    const $ = cheerio.load(res.data);
    const token = $('meta[name="api-token"]').attr('content');
    const cookies = res.headers['set-cookie'] || [];
    const cookieStr = cookies.map((c) => c.split(';')[0]).join('; ');

    if (token) {
      try {
        const domRes = await axios.get('https://generator.email/api/domains.php', {
          headers: {
            'X-API-Token': token,
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: cookieStr,
            Origin: 'https://generator.email',
            Referer: 'https://generator.email/',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          timeout: 4000,
        });
        if (Array.isArray(domRes.data) && domRes.data.length > 0) {
          const list = domRes.data
            .map((d) => (d.display || d.ascii || d).toLowerCase().trim())
            .filter((d) => d && d.includes('.') && !d.includes('generator.email'));
          if (list.length > 0) {
            return list[Math.floor(Math.random() * list.length)];
          }
        }
      } catch (_) {}
    }

    const dom = $('#domainName2').val();
    if (dom && dom.includes('.') && !dom.includes('generator.email')) {
      return dom.toLowerCase().trim();
    }
  } catch (_) {}
  const idx = Math.floor(Math.random() * GENERATOR_ACTIVE_DOMAINS.length);
  return GENERATOR_ACTIVE_DOMAINS[idx];
}

function resolveTempUsername(options = {}) {
  const opts = typeof options === 'string' ? { custom: options } : options || {};
  const type = (opts.type || opts.usernameType || 'default').toLowerCase().trim();
  const custom = (opts.custom || opts.customUsername || opts.name || '').trim();

  const randNum = Math.floor(100000 + Math.random() * 900000);

  // Opsi 2: Kustom nama
  if (type === 'custom' || custom) {
    const cleaned = (custom || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    if (cleaned) return cleaned;
    return `omnifylabs${randNum}`;
  }

  // Opsi 3: Random nama
  if (type === 'random') {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let u = '';
    for (let i = 0; i < 9; i++) {
      u += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return u;
  }

  // Opsi 1 (default): omnifylabs + angka random
  return `omnifylabs${randNum}`;
}

class TempMailClient {
  constructor() {
    this.cookie = '';
    this.session = null; // disimpan di memori saja (stateless-friendly)
  }

  saveLocalSession(data) {
    this.session = data;
  }

  // ==========================================
  // ENGINE 1: TEMPMAIL.CHAT (Cloudflare Workers API)
  // ==========================================
  async generateTempMailChat(domain) {
    const endpoints = [
      `${TEMPMAIL_CHAT_PRIMARY_API}/api/create-inbox`,
      `${TEMPMAIL_CHAT_FALLBACK_API}/api/create-inbox`,
    ];

    let data = null;
    let lastErr = null;

    for (const ep of endpoints) {
      try {
        const res = await axios.post(
          ep,
          domain ? { domain } : {},
          {
            headers: {
              ...DEFAULT_HEADERS,
              'Content-Type': 'application/json',
              Origin: 'https://tempmail.chat',
              Referer: 'https://tempmail.chat/',
            },
            timeout: 12000,
          }
        );
        if (res.data && res.data.success && res.data.email) {
          data = res.data;
          break;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    if (!data) {
      throw new Error(`Gagal membuat mailbox TempMail.chat: ${lastErr?.message || 'Unknown error'}`);
    }

    const email = data.email;
    const token = data.access_token || data.token;
    const expiresIn = data.expires_in || 86400;
    const [user, dom] = email.split('@');

    const result = {
      email,
      domain: dom,
      user,
      token,
      expiresIn,
      provider: 'tempmail-chat',
      createdAt: new Date().toISOString(),
    };

    this.saveLocalSession(result);
    return result;
  }

  async getInboxTempMailChat(token) {
    const targetToken = token || this.session?.token;
    if (!targetToken) {
      throw new Error('Token akses TempMail.chat tidak ditemukan.');
    }

    const endpoints = [
      `${TEMPMAIL_CHAT_PRIMARY_API}/api/inbox?token=${encodeURIComponent(targetToken)}`,
      `${TEMPMAIL_CHAT_FALLBACK_API}/api/inbox?token=${encodeURIComponent(targetToken)}`,
    ];

    let data = null;
    let lastErr = null;

    for (const ep of endpoints) {
      try {
        const res = await axios.get(ep, {
          headers: {
            ...DEFAULT_HEADERS,
            Origin: 'https://tempmail.chat',
            Referer: 'https://tempmail.chat/',
          },
          timeout: 12000,
        });
        if (res.data && (res.data.success || Array.isArray(res.data.messages))) {
          data = res.data;
          break;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    if (!data) {
      throw new Error(`Gagal mengambil inbox TempMail.chat: ${lastErr?.message || 'Unknown error'}`);
    }

    const rawMessages = data.messages || [];
    return rawMessages.map((m) => {
      const senderName = m.sender_name || '';
      const senderEmail = m.sender_email || '';
      const from =
        senderName && senderEmail ? `${senderName} <${senderEmail}>` : senderEmail || senderName || 'Unknown';
      const text = m.body_text || '';
      const html = m.body_html || '';

      return {
        id: String(m.id || ''),
        from,
        sender_name: senderName,
        sender_email: senderEmail,
        subject: m.subject || '(Tanpa Subjek)',
        date: m.received_at || new Date().toISOString(),
        text,
        html,
        is_read: Boolean(m.is_read),
        provider: 'tempmail-chat',
      };
    });
  }

  async deleteTempMailChat(token) {
    const targetToken = token || this.session?.token;
    if (!targetToken) {
      throw new Error('Token akses TempMail.chat tidak ditemukan.');
    }

    const endpoints = [
      `${TEMPMAIL_CHAT_PRIMARY_API}/api/delete-inbox`,
      `${TEMPMAIL_CHAT_FALLBACK_API}/api/delete-inbox`,
    ];

    for (const ep of endpoints) {
      try {
        const res = await axios.post(
          ep,
          { token: targetToken },
          {
            headers: {
              ...DEFAULT_HEADERS,
              'Content-Type': 'application/json',
              Origin: 'https://tempmail.chat',
              Referer: 'https://tempmail.chat/',
            },
            timeout: 10000,
          }
        );
        if (res.data && res.data.success) {
          if (this.session?.token === targetToken) this.session = null;
          return { success: true, message: 'Mailbox berhasil dihapus.' };
        }
      } catch (_) {}
    }

    return { success: false, message: 'Gagal menghapus mailbox.' };
  }

  // ==========================================
  // ENGINE 2: MAIL.TM REST API
  // ==========================================
  async generateMailTm(options = {}) {
    const domainRes = await axios.get('https://api.mail.tm/domains?page=1', { timeout: 10000 });
    const domain = domainRes.data?.['hydra:member']?.[0]?.domain;
    if (!domain) throw new Error('Gagal mengambil domain Mail.tm');

    let username = resolveTempUsername(options);
    let address = `${username}@${domain}`;
    const rand = Math.floor(100000 + Math.random() * 900000);
    const password = `P@ssword${rand}!`;

    try {
      await axios.post('https://api.mail.tm/accounts', { address, password }, { timeout: 10000 });
    } catch (err) {
      if (err.response?.status === 422) {
        username = `${username}_${Math.floor(1000 + Math.random() * 9000)}`;
        address = `${username}@${domain}`;
        await axios.post('https://api.mail.tm/accounts', { address, password }, { timeout: 10000 });
      } else {
        throw err;
      }
    }

    const tokenRes = await axios.post('https://api.mail.tm/token', { address, password }, { timeout: 10000 });
    const token = tokenRes.data?.token;

    const result = {
      email: address,
      domain,
      user: username,
      provider: 'mailtm',
      token,
      password,
      createdAt: new Date().toISOString(),
    };

    this.saveLocalSession(result);
    return result;
  }

  async getInboxMailTm(token) {
    const res = await axios.get('https://api.mail.tm/messages', {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const members = res.data?.['hydra:member'] || [];
    const messages = [];

    for (const m of members) {
      const detail = await axios
        .get(`https://api.mail.tm/messages/${m.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        })
        .catch(() => null);

      const rawHtmlArr = detail?.data?.html;
      const html = Array.isArray(rawHtmlArr) ? rawHtmlArr.join('') : rawHtmlArr || '';
      const text = detail?.data?.text || detail?.data?.intro || '';

      messages.push({
        id: String(m.id || ''),
        from: m.from?.address || m.from?.name || '',
        sender_name: m.from?.name || '',
        sender_email: m.from?.address || '',
        subject: m.subject || '',
        date: m.createdAt,
        text,
        html,
        is_read: Boolean(m.seen),
        provider: 'mailtm',
      });
    }

    return messages;
  }

  // ==========================================
  // ENGINE 3: GENERATOR.EMAIL (HTML Scraper)
  // ==========================================
  async generateGenEmail(options = {}) {
    const opts = typeof options === 'string' ? { domain: options } : options || {};
    const targetDomain = opts.domain || (await fetchLiveGeneratorDomain());
    const user = resolveTempUsername(opts);
    const email = `${user}@${targetDomain}`;

    const client = axios.create({
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Origin: 'https://generator.email',
        Referer: 'https://generator.email/',
      },
      timeout: 10000,
    });

    let cookies = '';
    let inboxPageUrl = `${GENERATOR_BASE_URL}${targetDomain}/${user}`;

    try {
      const initRes = await client.get(inboxPageUrl, {
        maxRedirects: 0,
        validateStatus: (s) => s < 400 || s === 302,
      });

      if (initRes.headers['set-cookie']) {
        cookies = initRes.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
      }
      if (initRes.headers.location) {
        inboxPageUrl = initRes.headers.location.split('#')[0];
        if (!inboxPageUrl.startsWith('http')) {
          inboxPageUrl = `https://generator.email${inboxPageUrl}`;
        }
      }
    } catch (_) {}

    const result = {
      email,
      domain: targetDomain,
      user,
      provider: 'generator.email',
      cookies,
      inboxPageUrl,
      createdAt: new Date().toISOString(),
    };

    this.saveLocalSession(result);
    return result;
  }

  // ==========================================
  // UNIFIED INTERFACE
  // ==========================================
  async generate(provider = 'tempmail-chat', options = {}) {
    const p = String(provider).toLowerCase().trim();

    if (p === 'tempmail-chat' || p === 'tempmailchat' || p === 'chat' || p === 'tmchat') {
      try {
        return await this.generateTempMailChat(options.domain);
      } catch (e) {
        console.warn(`[!] TempMail.chat gagal (${e.message}), beralih ke Mail.tm...`);
        return await this.generateMailTm(options);
      }
    } else if (p === 'generator.email' || p === 'generator' || p === 'gen') {
      return await this.generateGenEmail(options);
    } else if (p === 'mailtm' || p === 'mail.tm') {
      try {
        return await this.generateMailTm(options);
      } catch (e) {
        return await this.generateTempMailChat(options?.domain);
      }
    }

    // Default: TempMail.chat -> Mail.tm -> Generator
    try {
      return await this.generateTempMailChat(options?.domain);
    } catch (_) {
      try {
        return await this.generateMailTm(options);
      } catch (_) {
        return await this.generateGenEmail(options);
      }
    }
  }

  async inbox(tokenOrEmail) {
    const isObj = typeof tokenOrEmail === 'object' && tokenOrEmail !== null;
    const inputToken = isObj
      ? tokenOrEmail.token || ''
      : typeof tokenOrEmail === 'string'
      ? tokenOrEmail
      : '';
    const inputEmail = isObj
      ? tokenOrEmail.email || ''
      : typeof tokenOrEmail === 'string' && tokenOrEmail.includes('@')
      ? tokenOrEmail
      : '';
    const explicitProvider = isObj ? tokenOrEmail.provider : null;

    const saved = this.session;
    const provider = (
      explicitProvider || (inputEmail ? 'generator.email' : saved?.provider || 'tempmail-chat')
    ).toLowerCase();

    // 1. TempMail.chat
    if (provider === 'tempmail-chat' || provider === 'chat') {
      const token = inputToken && !inputToken.includes('@') ? inputToken : '';
      if (token) return await this.getInboxTempMailChat(token);
      if (saved?.token && (saved.provider === 'tempmail-chat' || saved.provider === 'chat')) {
        return await this.getInboxTempMailChat(saved.token);
      }
    }

    // 2. Mail.tm
    if (provider === 'mailtm' || provider === 'mail.tm') {
      const token = inputToken && !inputToken.includes('@') ? inputToken : saved?.token;
      if (token) return await this.getInboxMailTm(token);
    }

    function parseCookieString(str) {
      const jar = {};
      if (!str) return jar;
      str.split(';').forEach((p) => {
        const [k, ...v] = p.split('=');
        if (k && v) jar[k.trim()] = v.join('=').trim();
      });
      return jar;
    }

    function updateCookieJar(jar, setCookies) {
      if (!setCookies) return;
      const list = Array.isArray(setCookies) ? setCookies : [setCookies];
      for (const c of list) {
        const [pair] = c.split(';');
        const [k, ...v] = pair.split('=');
        const val = v.join('=').trim();
        if (val === 'deleted' || !val) delete jar[k.trim()];
        else jar[k.trim()] = val;
      }
    }

    function formatCookieJar(jar) {
      return Object.entries(jar)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    }

    // 3. Generator.email fallback (scraper HTML)
    const email = inputEmail || (inputToken && inputToken.includes('@') ? inputToken : saved?.email);
    if (!email || !email.includes('@')) return [];
    const [user, domain] = email.split('@');
    const directUrl = `${GENERATOR_BASE_URL}${domain}/${user}`;

    try {
      const jar = parseCookieString(saved && saved.email === email && saved.cookies ? saved.cookies : '');
      const client = axios.create({
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Origin: 'https://generator.email',
          Referer: directUrl,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 12000,
      });

      const initRes = await client.get(directUrl, {
        headers: { Cookie: formatCookieJar(jar) },
        maxRedirects: 0,
        validateStatus: (s) => s < 400 || s === 302,
      });

      updateCookieJar(jar, initRes.headers['set-cookie']);

      let inboxPageUrl = directUrl;
      if (initRes.headers.location) {
        inboxPageUrl = initRes.headers.location.split('#')[0];
        if (!inboxPageUrl.startsWith('http')) inboxPageUrl = `https://generator.email${inboxPageUrl}`;
      }

      const pageRes = await client.get(inboxPageUrl, {
        headers: { Cookie: formatCookieJar(jar), Referer: directUrl },
        maxRedirects: 0,
        validateStatus: (s) => s < 400,
      });

      const html = typeof pageRes.data === 'string' ? pageRes.data : '';
      if (!html) return [];

      updateCookieJar(jar, pageRes.headers['set-cookie']);

      if (saved) {
        saved.cookies = formatCookieJar(jar);
        saved.inboxPageUrl = inboxPageUrl;
        this.saveLocalSession(saved);
      }

      const $ = cheerio.load(html);
      const messages = [];

      const directOob = html.match(/https:\/\/[^\s"'<>]+oobCode=[a-zA-Z0-9_\-]+[^\s"'<>]*/i);

      const rows = $('#email-table > div, .email-table-mb > div, [class*="list-group-item"]');

      for (let i = 0; i < rows.length; i++) {
        const el = rows[i];
        const text = $(el).text().trim();
        if (text.includes('From') && text.includes('Subject')) continue;

        const from = $(el).find('[class*="from_div"]').text().trim() || 'Alight Creative';
        const subject = $(el).find('[class*="subj_div"]').text().trim() || 'Sign in to Alight Motion';
        const time = $(el).find('[class*="time_div"]').text().trim() || '';

        const onclick = $(el).attr('onclick') || '';
        const mMatch = onclick.match(/loadInboxClientSide\('([^']+)'\)/);
        const msgPath = mMatch ? mMatch[1] : $(el).find('a').attr('href') || '';

        let msgHtml = html;
        let msgText = `${from} - ${subject}\n${html}`;

        if (msgPath && !directOob) {
          try {
            const detailUrl = msgPath.startsWith('http')
              ? msgPath
              : `https://generator.email/${msgPath.replace(/^\//, '')}`;
            const detailJar = { ...jar };
            const detailInit = await client.get(detailUrl, {
              headers: { Cookie: formatCookieJar(detailJar), Referer: inboxPageUrl },
              maxRedirects: 0,
              validateStatus: (s) => s < 400 || s === 302,
            });

            updateCookieJar(detailJar, detailInit.headers['set-cookie']);

            let detailFinalUrl = detailUrl;
            if (detailInit.headers.location) {
              detailFinalUrl = detailInit.headers.location.split('#')[0];
              if (!detailFinalUrl.startsWith('http')) detailFinalUrl = `https://generator.email${detailFinalUrl}`;
            }

            const detailFinal = await client.get(detailFinalUrl, {
              headers: { Cookie: formatCookieJar(detailJar), Referer: detailUrl },
              maxRedirects: 0,
              validateStatus: (s) => s < 400,
            });

            if (typeof detailFinal.data === 'string') {
              msgHtml = detailFinal.data;
              msgText = `${from} - ${subject}\n${detailFinal.data}`;
            }
          } catch (_) {}
        }

        messages.push({
          id: msgPath || String(Date.now()),
          from,
          sender_name: from,
          sender_email: '',
          subject,
          date: time,
          link: msgPath,
          text: msgText,
          html: msgHtml,
          is_read: false,
          provider: 'generator.email',
        });
      }

      if (directOob && messages.length === 0) {
        messages.push({
          id: String(Date.now()),
          from: 'Alight Creative <support@alightcreative.com>',
          sender_name: 'Alight Creative',
          sender_email: 'support@alightcreative.com',
          subject: 'Sign in to Alight Motion',
          date: new Date().toISOString(),
          link: directOob[0],
          text: html,
          html,
          is_read: false,
          provider: 'generator.email',
        });
      }

      return messages;
    } catch (_) {
      return [];
    }
  }

  async delete(tokenOrEmail) {
    const isObj = typeof tokenOrEmail === 'object' && tokenOrEmail !== null;
    const token = isObj
      ? tokenOrEmail.token
      : typeof tokenOrEmail === 'string' && !tokenOrEmail.includes('@')
      ? tokenOrEmail
      : null;
    const provider = isObj ? tokenOrEmail.provider : null;

    if ((provider === 'tempmail-chat' || provider === 'chat' || !provider) && token) {
      return await this.deleteTempMailChat(token);
    }
    this.session = null;
    return { success: true, message: 'Sesi lokal dibersihkan.' };
  }

  async watch(options = {}) {
    const intervalMs = options.intervalMs || 4000;
    const timeoutMs = options.timeoutMs || 120000;
    const startTime = Date.now();
    const seenIds = new Set();

    try {
      const initial = await this.inbox();
      for (const m of initial) seenIds.add(m.id);
    } catch (_) {}

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const current = await this.inbox();
        const newMessages = current.filter((m) => !seenIds.has(m.id));
        if (newMessages.length > 0) {
          for (const m of newMessages) seenIds.add(m.id);
          if (typeof options.onMessage === 'function') options.onMessage(newMessages);
          return newMessages;
        }
      } catch (_) {}
    }

    return [];
  }
}

const defaultClient = new TempMailClient();

module.exports = {
  TempMailClient,
  tempmail: defaultClient,
  generate: (provider, options) => defaultClient.generate(provider, options),
  inbox: (tokenOrEmail) => defaultClient.inbox(tokenOrEmail),
  delete: (tokenOrEmail) => defaultClient.delete(tokenOrEmail),
  watch: (options) => defaultClient.watch(options),
  generateTempMailChat: (domain) => defaultClient.generateTempMailChat(domain),
  getInboxTempMailChat: (token) => defaultClient.getInboxTempMailChat(token),
  deleteTempMailChat: (token) => defaultClient.deleteTempMailChat(token),
  generateMailTm: (options) => defaultClient.generateMailTm(options),
  getInboxMailTm: (token) => defaultClient.getInboxMailTm(token),
  generateGenEmail: (options) => defaultClient.generateGenEmail(options),
};
