#!/usr/bin/env node

const http = require('http');
const { Pool } = require('pg');

const port = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL || 'Not configured';
const nodeVersion = process.version;
const hasDatabase = databaseUrl !== 'Not configured';

const pool = hasDatabase
  ? new Pool({ connectionString: databaseUrl })
  : null;

async function initDatabase() {
  if (!pool) {
    return;
  }

  await pool.query(
    'CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())'
  );
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function parseFormEncoded(body) {
  const params = new URLSearchParams(body);
  return {
    name: (params.get('name') || '').trim(),
  };
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/save') {
      if (!pool) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Database is not configured.');
        return;
      }

      const body = await readRequestBody(req);
      const { name } = parseFormEncoded(body);

      if (!name) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Name is required.');
        return;
      }

      await pool.query('INSERT INTO users (name) VALUES ($1)', [name]);
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }

    let latestName = null;
    if (pool) {
      const result = await pool.query('SELECT name FROM users ORDER BY created_at DESC LIMIT 1');
      latestName = result.rows[0] ? result.rows[0].name : null;
    }

    const safeName = latestName ? escapeHtml(latestName) : null;
    const welcomeMessage = safeName ? `Welcome, ${safeName}!` : 'Welcome! Enter your name below.';

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head><title>Node.js App</title></head>
        <body>
          <h1>Hello from Node.js App!</h1>
          <p>${welcomeMessage}</p>
          <form method="POST" action="/save">
            <label for="name">Name:</label>
            <input id="name" name="name" required />
            <button type="submit">Save</button>
          </form>
          <p>Node.js Version: ${nodeVersion}</p>
          <p>Database URL: ${databaseUrl}</p>
          <p>Server is running on port ${port}</p>
        </body>
      </html>
    `);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error.');
    console.error('Request failed:', error);
  }
});

// Start server
initDatabase()
  .then(() => {
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log(`Node.js Version: ${nodeVersion}`);
      console.log(`Database URL: ${databaseUrl}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
