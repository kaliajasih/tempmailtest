# TempMail Glass

Landing page email sementara bertema **glassmorphism** + backend Express yang membungkus scraper `tempmail.js`.

## Kenapa butuh backend?

Scraper-nya Node.js (`axios`, `cheerio`, `fs`) — tidak bisa jalan di browser. Selain itu
`tempmail.chat`, `mail.tm`, dan `generator.email` menolak request lintas-origin (CORS).
Jadi:

```
Browser  ──►  Express (/api/*)  ──►  TempMailClient  ──►  provider
```

## Struktur

```
tempmail-glass/
├── package.json
├── server.js            # Express: /api/create, /api/inbox, /api/delete, /api/health
├── tempmail.js          # Engine multi-provider (versi library, stateless)
└── public/
    └── index.html       # Landing page glassmorphism (HTML + CSS + JS, tanpa build step)
```

## Cara jalan

```bash
npm install
npm start
```

Lalu buka **http://localhost:3000**.

Saat pertama dibuka, alamat email otomatis dibuat (seperti Temp Mail).

## Yang diubah dari scraper asli

| Asli | Di sini | Alasan |
|---|---|---|
| `require('../../core/cloudflare-bypass')` | dihapus | Modul itu tidak ada di projek ini |
| Engine `temp-mail-org` | dihapus | Bergantung pada modul di atas |
| `.tempmail-session.json` (berbagi) | dihapus, sesi di `localStorage` | Agar sesi tidak tercampur antar pengguna |
| CLI `readline` | dihapus | Diganti endpoint HTTP |

Provider yang tersisa: **tempmail-chat**, **mailtm**, **generator.email**.

## Endpoint

| Method | Path | Body / Query | Fungsi |
|---|---|---|---|
| `POST` | `/api/create` | `{ provider, type, custom, domain }` | Buat alamat baru |
| `GET` | `/api/inbox` | `?email=&token=&provider=` | Ambil pesan masuk |
| `POST` | `/api/delete` | `{ email, token, provider }` | Hapus mailbox |
| `GET` | `/api/health` | — | Cek server |

## Catatan keamanan

HTML email dirender di dalam `<iframe srcdoc>` dengan atribut `sandbox` **kosong**,
jadi skrip di dalam email tidak akan dieksekusi. Semua teks (subjek, pengirim) di-escape.

Email sementara jangan dipakai untuk akun penting.
