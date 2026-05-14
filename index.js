const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

async function initDB(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    ts INTEGER NOT NULL,
    audio_id TEXT
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    ig_handle TEXT,
    pw_hash TEXT,
    status TEXT DEFAULT 'normal',
    trusted INTEGER DEFAULT 0,
    blocked INTEGER DEFAULT 0,
    ignore_mode INTEGER DEFAULT 0,
    warn_count INTEGER DEFAULT 0,
    roast_mode INTEGER DEFAULT 0,
    notes TEXT,
    last_seen INTEGER
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS pending_replies (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    reply TEXT NOT NULL,
    send_at INTEGER NOT NULL,
    sent INTEGER DEFAULT 0
  )`).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_conv_ts ON conversations(ts)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_pending ON pending_replies(send_at, sent)`).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.HERSPACE_DB;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try { await initDB(db); } catch(e) {}

    if (path === '/') return json({ status: 'her space worker 💗', ts: Date.now() });

    // GET /api/user/:id
    if (request.method === 'GET' && path.startsWith('/api/user/') && !path.includes('/status')) {
      const id = decodeURIComponent(path.split('/api/user/')[1]);
      const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first();
      return json(user || null);
    }

    // POST /api/user
    if (request.method === 'POST' && path === '/api/user') {
      const b = await request.json();
      await db.prepare(`INSERT INTO users (id, name, ig_handle, pw_hash, status, trusted, blocked, ignore_mode, warn_count, roast_mode, notes, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, ig_handle=excluded.ig_handle,
          pw_hash=COALESCE(excluded.pw_hash, pw_hash),
          last_seen=excluded.last_seen`
      ).bind(b.id, b.name||'', b.ig_handle||null, b.pw_hash||null, b.status||'normal', b.trusted||0, b.blocked||0, b.ignore_mode||0, b.warn_count||0, b.roast_mode||0, b.notes||null, Date.now()).run();
      return json({ ok: true });
    }

    // POST /api/user/:id/status
    if (request.method === 'POST' && path.match(/^\/api\/user\/(.+)\/status$/)) {
      const id = decodeURIComponent(path.split('/api/user/')[1].split('/status')[0]);
      const b = await request.json();
      const fields = [], vals = [];
      if (b.blocked !== undefined) { fields.push('blocked=?'); vals.push(b.blocked ? 1 : 0); }
      if (b.trusted !== undefined) { fields.push('trusted=?'); vals.push(b.trusted ? 1 : 0); }
      if (b.ignore_mode !== undefined) { fields.push('ignore_mode=?'); vals.push(b.ignore_mode ? 1 : 0); }
      if (b.roast_mode !== undefined) { fields.push('roast_mode=?'); vals.push(b.roast_mode ? 1 : 0); }
      if (b.warn_count !== undefined) { fields.push('warn_count=?'); vals.push(b.warn_count); }
      if (b.notes !== undefined) { fields.push('notes=?'); vals.push(b.notes); }
      if (fields.length) { vals.push(id); await db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=?`).bind(...vals).run(); }
      return json({ ok: true });
    }

    // GET /api/users
    if (request.method === 'GET' && path === '/api/users') {
      const { results } = await db.prepare(`SELECT * FROM users ORDER BY last_seen DESC`).all();
      return json(results || []);
    }

    // GET /api/chats/:userId
    if (request.method === 'GET' && path.startsWith('/api/chats/') && !path.includes('/pending')) {
      const userId = decodeURIComponent(path.split('/api/chats/')[1]);
      const { results } = await db.prepare(`SELECT role, content, ts, audio_id FROM conversations WHERE user_id = ? ORDER BY ts ASC LIMIT 300`).bind(userId).all();
      return json(results || []);
    }

    // POST /api/chats/:userId
    if (request.method === 'POST' && path.startsWith('/api/chats/') && !path.includes('/pending')) {
      const userId = decodeURIComponent(path.split('/api/chats/')[1]);
      const b = await request.json();
      const id = userId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      await db.prepare(`INSERT OR REPLACE INTO conversations (id, user_id, role, content, ts, audio_id) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, userId, b.role, b.content, b.ts||Date.now(), b.audio_id||null).run();
      return json({ ok: true });
    }

    // POST /api/pending
    if (request.method === 'POST' && path === '/api/pending') {
      const b = await request.json();
      const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      await db.prepare(`INSERT INTO pending_replies (id, user_id, reply, send_at, sent) VALUES (?, ?, ?, ?, 0)`
      ).bind(id, b.user_id, b.reply, b.send_at).run();
      return json({ ok: true, id });
    }

    // GET /api/pending/:userId
    if (request.method === 'GET' && path.startsWith('/api/pending/')) {
      const userId = decodeURIComponent(path.split('/api/pending/')[1]);
      const now = Date.now();
      const row = await db.prepare(`SELECT * FROM pending_replies WHERE user_id=? AND sent=0 AND send_at<=? ORDER BY send_at ASC LIMIT 1`).bind(userId, now).first();
      if (row) {
        await db.prepare(`UPDATE pending_replies SET sent=1 WHERE id=?`).bind(row.id).run();
        return json({ reply: row.reply });
      }
      const future = await db.prepare(`SELECT send_at FROM pending_replies WHERE user_id=? AND sent=0 ORDER BY send_at ASC LIMIT 1`).bind(userId).first();
      return json({ reply: null, next_at: future ? future.send_at : null });
    }

    // GET /api/stats
    if (request.method === 'GET' && path === '/api/stats') {
      const users = await db.prepare(`SELECT COUNT(*) as c FROM users`).first();
      const msgs = await db.prepare(`SELECT COUNT(*) as c FROM conversations`).first();
      const blocked = await db.prepare(`SELECT COUNT(*) as c FROM users WHERE blocked=1`).first();
      return json({ users: users.c, messages: msgs.c, blocked: blocked.c });
    }

    // GET /api/all-convos
    if (request.method === 'GET' && path === '/api/all-convos') {
      const limit = parseInt(url.searchParams.get('limit') || '200');
      const { results } = await db.prepare(`SELECT c.user_id, c.role, c.content, c.ts, u.name FROM conversations c LEFT JOIN users u ON c.user_id=u.id ORDER BY c.ts DESC LIMIT ?`).bind(limit).all();
      return json(results || []);
    }

    return json({ error: 'not found' }, 404);
  }
};
