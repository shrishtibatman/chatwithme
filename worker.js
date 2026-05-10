// ═══════════════════════════════════════════════════════
// her space — Cloudflare Worker
// D1 binding name: HERSPACE_DB (set in Cloudflare dashboard)
// ═══════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ── Init D1 tables on first run ──
async function initDB(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_ts ON conversations(ts);
  `);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.HERSPACE_DB;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    await initDB(db);

    // ══ GET /api/chats/:userId ══
    // Returns all messages for a user, oldest first
    if (request.method === 'GET' && path.startsWith('/api/chats/')) {
      const userId = decodeURIComponent(path.split('/api/chats/')[1]);
      if (!userId) return json({ error: 'userId required' }, 400);

      const { results } = await db.prepare(
        `SELECT role, content, ts FROM conversations
         WHERE user_id = ?
         ORDER BY ts ASC
         LIMIT 500`
      ).bind(userId).all();

      return json(results || []);
    }

    // ══ POST /api/chats/:userId ══
    // Save a single message
    if (request.method === 'POST' && path.startsWith('/api/chats/')) {
      const userId = decodeURIComponent(path.split('/api/chats/')[1]);
      const body = await request.json();
      const { role, content, ts } = body;

      if (!role || !content) return json({ error: 'role and content required' }, 400);

      const id = userId + '_' + (ts || Date.now()) + '_' + Math.random().toString(36).slice(2, 7);
      await db.prepare(
        `INSERT OR REPLACE INTO conversations (id, user_id, role, content, ts)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(id, userId, role, content, ts || Date.now()).run();

      return json({ ok: true });
    }

    // ══ POST /api/chats/:userId/bulk ══
    // Save multiple messages at once (for initial sync)
    if (request.method === 'POST' && path.startsWith('/api/chats/') && path.endsWith('/bulk')) {
      const userId = decodeURIComponent(path.split('/api/chats/')[1].replace('/bulk', ''));
      const body = await request.json();
      const messages = body.messages || [];

      const stmt = db.prepare(
        `INSERT OR REPLACE INTO conversations (id, user_id, role, content, ts)
         VALUES (?, ?, ?, ?, ?)`
      );

      await db.batch(
        messages.map((m, i) => {
          const id = userId + '_' + (m.ts || Date.now() + i) + '_' + Math.random().toString(36).slice(2, 7);
          return stmt.bind(id, userId, m.role, m.content, m.ts || Date.now() + i);
        })
      );

      return json({ ok: true, saved: messages.length });
    }

    // ══ DELETE /api/chats/:userId ══
    // Clear all chats for a user
    if (request.method === 'DELETE' && path.startsWith('/api/chats/')) {
      const userId = decodeURIComponent(path.split('/api/chats/')[1]);
      await db.prepare(`DELETE FROM conversations WHERE user_id = ?`).bind(userId).run();
      return json({ ok: true });
    }

    // ══ GET /api/training-context/:userId ══
    // Returns last N messages formatted as training context for AI
    if (request.method === 'GET' && path.startsWith('/api/training-context/')) {
      const userId = decodeURIComponent(path.split('/api/training-context/')[1]);
      const limit = parseInt(url.searchParams.get('limit') || '100');

      const { results } = await db.prepare(
        `SELECT role, content FROM conversations
         WHERE user_id = ?
         ORDER BY ts DESC
         LIMIT ?`
      ).bind(userId, limit).all();

      // Reverse so oldest first
      const messages = (results || []).reverse();
      return json(messages);
    }

    // ══ GET /api/all-convos ══
    // Owner: fetch all conversations across all users (for global training)
    if (request.method === 'GET' && path === '/api/all-convos') {
      const limit = parseInt(url.searchParams.get('limit') || '200');
      const { results } = await db.prepare(
        `SELECT user_id, role, content, ts FROM conversations
         ORDER BY ts DESC
         LIMIT ?`
      ).bind(limit).all();
      return json(results || []);
    }

    // ══ GET /api/stats ══
    if (request.method === 'GET' && path === '/api/stats') {
      const users = await db.prepare(`SELECT COUNT(DISTINCT user_id) as count FROM conversations`).first();
      const msgs = await db.prepare(`SELECT COUNT(*) as count FROM conversations`).first();
      return json({ users: users.count, messages: msgs.count });
    }

    return json({ error: 'not found' }, 404);
  }
};
