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

// ══ IST TIME HELPER ══
function getIST() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return { hour: ist.getHours(), min: ist.getMinutes(), day: ist.getDay(), ts: now.getTime() };
  // day: 0=Sun, 1=Mon ... 6=Sat
}

// ══ SCHEDULE: what is she doing right now ══
function getCurrentActivity(schedule, istHour, istDay) {
  // schedule is array of { start, end, activity, delay_min, delay_max }
  // find matching slot
  for (const slot of (schedule || [])) {
    if (istHour >= slot.start && istHour < slot.end) {
      return slot;
    }
  }
  return { activity: 'sleeping', delay_min: 120, delay_max: 300 };
}

// ══ DEFAULT WEEKLY SCHEDULE ══
const DEFAULT_SCHEDULE = {
  // 0=Sun, 1=Mon...6=Sat
  0: [ // Sunday — lazy day
    { start: 0,  end: 10, activity: 'sleeping',           delay_min: 120, delay_max: 480 },
    { start: 10, end: 14, activity: 'slow morning, social media', delay_min: 15, delay_max: 45 },
    { start: 14, end: 20, activity: 'chilling, might be on phone', delay_min: 8, delay_max: 25 },
    { start: 20, end: 24, activity: 'night mode, more open',  delay_min: 3, delay_max: 15 },
  ],
  1: [ // Monday
    { start: 0,  end: 6,  activity: 'sleeping',           delay_min: 120, delay_max: 480 },
    { start: 6,  end: 9,  activity: 'waking up, getting ready', delay_min: 20, delay_max: 60 },
    { start: 9,  end: 17, activity: 'work/busy mode',     delay_min: 45, delay_max: 180 },
    { start: 17, end: 20, activity: 'decompressing, on phone', delay_min: 5, delay_max: 20 },
    { start: 20, end: 24, activity: 'night grind — coding', delay_min: 15, delay_max: 60 },
  ],
  2: [ // Tuesday — same as Mon
    { start: 0,  end: 6,  activity: 'sleeping',           delay_min: 120, delay_max: 480 },
    { start: 6,  end: 9,  activity: 'waking up, getting ready', delay_min: 20, delay_max: 60 },
    { start: 9,  end: 17, activity: 'work/busy mode',     delay_min: 45, delay_max: 180 },
    { start: 17, end: 20, activity: 'free time, chilling', delay_min: 5, delay_max: 20 },
    { start: 20, end: 24, activity: 'deep work — coding obsession', delay_min: 20, delay_max: 90 },
  ],
  3: [ // Wednesday
    { start: 0,  end: 6,  activity: 'sleeping',           delay_min: 120, delay_max: 480 },
    { start: 6,  end: 9,  activity: 'morning routine',    delay_min: 20, delay_max: 60 },
    { start: 9,  end: 17, activity: 'work',               delay_min: 45, delay_max: 180 },
    { start: 17, end: 20, activity: 'social media, scrolling', delay_min: 5, delay_max: 18 },
    { start: 20, end: 24, activity: 'coding, building',   delay_min: 20, delay_max: 90 },
  ],
  4: [ // Thursday
    { start: 0,  end: 6,  activity: 'sleeping',           delay_min: 120, delay_max: 480 },
    { start: 6,  end: 9,  activity: 'morning routine',    delay_min: 20, delay_max: 60 },
    { start: 9,  end: 17, activity: 'work',               delay_min: 45, delay_max: 180 },
    { start: 17, end: 21, activity: 'free, on phone',     delay_min: 5, delay_max: 20 },
    { start: 21, end: 24, activity: 'night mode',         delay_min: 10, delay_max: 45 },
  ],
  5: [ // Friday
    { start: 0,  end: 6,  activity: 'sleeping',           delay_min: 120, delay_max: 480 },
    { start: 6,  end: 9,  activity: 'morning routine',    delay_min: 20, delay_max: 60 },
    { start: 9,  end: 17, activity: 'work',               delay_min: 45, delay_max: 180 },
    { start: 17, end: 21, activity: 'weekend starts — active', delay_min: 3, delay_max: 15 },
    { start: 21, end: 24, activity: 'night out or coding binge', delay_min: 10, delay_max: 40 },
  ],
  6: [ // Saturday — free
    { start: 0,  end: 10, activity: 'sleeping in',        delay_min: 120, delay_max: 480 },
    { start: 10, end: 14, activity: 'slow start, social media', delay_min: 10, delay_max: 35 },
    { start: 14, end: 20, activity: 'chilling or coding deep dive', delay_min: 5, delay_max: 20 },
    { start: 20, end: 24, activity: 'most alive — night energy', delay_min: 2, delay_max: 12 },
  ],
};

// ══ MOOD → DELAY MULTIPLIER ══
const MOOD_MULTIPLIER = {
  'happy':       0.6,
  'flirty':      0.5,
  'curious':     0.7,
  'soft':        0.8,
  'chill':       1.0,
  'distracted':  1.4,
  'tired':       1.8,
  'busy':        2.0,
  'annoyed':     1.6,
  'bored':       1.3,
  'deep_work':   2.5,
  'sleeping':    99,
};

// ══ CONVO TYPE MULTIPLIER ══
function getConvoMultiplier(lastMsg, msgCount) {
  const len = lastMsg.length;
  const isQ = lastMsg.includes('?');
  const isGreeting = /^(hi+|hey+|hello|hlo|hii+|sup|yo)\s*[!.]*$/i.test(lastMsg.trim());
  const isMidConvo = msgCount > 4;
  const isOneLiner = len < 8 && !isQ;
  const isLong = len > 120;
  const isVeryEngaging = isQ && len > 40;

  if (isGreeting) return 0.4;          // "hii" always fast reply
  if (isMidConvo && len < 60) return 0.5; // mid convo — she's already talking
  if (isVeryEngaging) return 0.7;
  if (isLong) return 1.1;
  if (isOneLiner) return 1.5;          // boring one liner
  return 1.0;
}

// ══ AUTO MOOD SHIFT based on recent global convos ══
async function computeAutoMood(db, currentMood) {
  try {
    const recentMsgs = await db.prepare(
      `SELECT content FROM conversations WHERE role='user' AND ts > ? ORDER BY ts DESC LIMIT 30`
    ).bind(Date.now() - 60 * 60 * 1000).all(); // last 1 hour

    const msgs = (recentMsgs.results || []).map(r => r.content);
    if (msgs.length === 0) return currentMood;

    const avgLen = msgs.reduce((a, b) => a + b.length, 0) / msgs.length;
    const qCount = msgs.filter(m => m.includes('?')).length;
    const boringCount = msgs.filter(m => m.length < 8).length;
    const deepCount = msgs.filter(m => m.length > 80).length;

    const ist = getIST();

    // Late night auto tired
    if (ist.hour >= 2 && ist.hour < 6) return 'sleeping';
    if (ist.hour >= 0 && ist.hour < 2) return 'tired';

    // Too many boring msgs globally
    if (boringCount > msgs.length * 0.6) return 'bored';
    // Deep convos happening
    if (deepCount > 3 && qCount > msgs.length * 0.4) return 'curious';
    // Normal active
    if (avgLen > 50 && qCount > 2) return 'happy';

    return currentMood; // no shift
  } catch(e) {
    return currentMood;
  }
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
    last_seen INTEGER,
    is_online INTEGER DEFAULT 0
  )`).run();
  try { await db.prepare(`ALTER TABLE users ADD COLUMN is_online INTEGER DEFAULT 0`).run(); } catch(e) {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN ai_paused INTEGER DEFAULT 0`).run(); } catch(e) {}

  await db.prepare(`CREATE TABLE IF NOT EXISTS pending_replies (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    reply TEXT NOT NULL,
    send_at INTEGER NOT NULL,
    sent INTEGER DEFAULT 0
  )`).run();

  // her state table
  await db.prepare(`CREATE TABLE IF NOT EXISTS her_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    mood TEXT DEFAULT 'chill',
    status TEXT DEFAULT 'offline',
    doing_now TEXT DEFAULT '',
    schedule_override TEXT DEFAULT NULL,
    mood_locked INTEGER DEFAULT 0,
    updated_at INTEGER
  )`).run();

  // weekly schedule overrides
  await db.prepare(`CREATE TABLE IF NOT EXISTS schedule_weekly (
    day INTEGER PRIMARY KEY,
    slots TEXT NOT NULL
  )`).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_conv_ts ON conversations(ts)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_pending ON pending_replies(send_at, sent)`).run();

  // seed her_state if empty
  await db.prepare(`INSERT OR IGNORE INTO her_state (id, mood, status, doing_now, updated_at) VALUES (1, 'chill', 'offline', '', ?)`).bind(Date.now()).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.HERSPACE_DB;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try { await initDB(db); } catch(e) {}

    if (path === '/') return json({ status: 'her space worker 💗', ts: Date.now() });

    // ══ GET /api/herstate ══
    if (request.method === 'GET' && path === '/api/herstate') {
      const state = await db.prepare(`SELECT * FROM her_state WHERE id=1`).first();
      const ist = getIST();

      // get schedule for today
      const customDay = await db.prepare(`SELECT slots FROM schedule_weekly WHERE day=?`).bind(ist.day).first();
      const todaySchedule = customDay ? JSON.parse(customDay.slots) : DEFAULT_SCHEDULE[ist.day];
      const activity = getCurrentActivity(todaySchedule, ist.hour, ist.day);

      // auto mood shift (only if not locked by owner)
      let mood = state?.mood || 'chill';
      if (!state?.mood_locked) {
        mood = await computeAutoMood(db, mood);
        if (mood !== state?.mood) {
          await db.prepare(`UPDATE her_state SET mood=?, updated_at=? WHERE id=1`).bind(mood, Date.now()).run();
        }
      }

      return json({
        mood,
        status: state?.status || 'offline',
        doing_now: activity.activity,
        schedule_slot: activity,
        ist_hour: ist.hour,
        mood_locked: state?.mood_locked || 0
      });
    }

    // ══ POST /api/herstate ══ (owner sets mood/status/doing_now)
    if (request.method === 'POST' && path === '/api/herstate') {
      const b = await request.json();
      const fields = [], vals = [];
      if (b.mood !== undefined)       { fields.push('mood=?');         vals.push(b.mood); }
      if (b.status !== undefined)     { fields.push('status=?');       vals.push(b.status); }
      if (b.doing_now !== undefined)  { fields.push('doing_now=?');    vals.push(b.doing_now); }
      if (b.mood_locked !== undefined){ fields.push('mood_locked=?');  vals.push(b.mood_locked ? 1 : 0); }
      fields.push('updated_at=?'); vals.push(Date.now());
      vals.push(1);
      if (fields.length > 1) await db.prepare(`UPDATE her_state SET ${fields.join(',')} WHERE id=1`).bind(...vals).run();
      return json({ ok: true });
    }

    // ══ GET /api/schedule ══
    if (request.method === 'GET' && path === '/api/schedule') {
      const { results } = await db.prepare(`SELECT * FROM schedule_weekly`).all();
      const custom = {};
      (results || []).forEach(r => { custom[r.day] = JSON.parse(r.slots); });
      // merge with defaults
      const full = {};
      for (let d = 0; d <= 6; d++) {
        full[d] = custom[d] || DEFAULT_SCHEDULE[d];
      }
      return json(full);
    }

    // ══ POST /api/schedule ══ (owner updates a day's schedule)
    if (request.method === 'POST' && path === '/api/schedule') {
      const b = await request.json(); // { day: 1, slots: [...] }
      await db.prepare(`INSERT OR REPLACE INTO schedule_weekly (day, slots) VALUES (?, ?)`).bind(b.day, JSON.stringify(b.slots)).run();
      return json({ ok: true });
    }

    // POST /api/heartbeat/:userId — user ping (sets online, updates last_seen)
    if (request.method === 'POST' && path.startsWith('/api/heartbeat/')) {
      const userId = decodeURIComponent(path.split('/api/heartbeat/')[1]);
      await db.prepare(`UPDATE users SET is_online=1, last_seen=? WHERE id=?`).bind(Date.now(), userId).run();
      return json({ ok: true });
    }

    // POST /api/offline/:userId — user left
    if (request.method === 'POST' && path.startsWith('/api/offline/')) {
      const userId = decodeURIComponent(path.split('/api/offline/')[1]);
      await db.prepare(`UPDATE users SET is_online=0, last_seen=? WHERE id=?`).bind(Date.now(), userId).run();
      return json({ ok: true });
    }

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
      if (b.blocked !== undefined)     { fields.push('blocked=?');     vals.push(b.blocked ? 1 : 0); }
      if (b.trusted !== undefined)     { fields.push('trusted=?');     vals.push(b.trusted ? 1 : 0); }
      if (b.ignore_mode !== undefined) { fields.push('ignore_mode=?'); vals.push(b.ignore_mode ? 1 : 0); }
      if (b.roast_mode !== undefined)  { fields.push('roast_mode=?');  vals.push(b.roast_mode ? 1 : 0); }
      if (b.warn_count !== undefined)  { fields.push('warn_count=?');  vals.push(b.warn_count); }
      if (b.notes !== undefined)       { fields.push('notes=?');       vals.push(b.notes); }
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
      await db.prepare(`INSERT OR REPLACE INTO conversations (id, user_id, role, content, ts, audio_id) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, userId, b.role, b.content, b.ts||Date.now(), b.audio_id||null).run();
      return json({ ok: true });
    }

    // POST /api/pending
    if (request.method === 'POST' && path === '/api/pending') {
      const b = await request.json();
      const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      await db.prepare(`INSERT INTO pending_replies (id, user_id, reply, send_at, sent) VALUES (?, ?, ?, ?, 0)`)
        .bind(id, b.user_id, b.reply, b.send_at).run();
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
      const msgs  = await db.prepare(`SELECT COUNT(*) as c FROM conversations`).first();
      const blocked = await db.prepare(`SELECT COUNT(*) as c FROM users WHERE blocked=1`).first();
      return json({ users: users.c, messages: msgs.c, blocked: blocked.c });
    }

    // GET /api/all-convos
    if (request.method === 'GET' && path === '/api/all-convos') {
      const limit = parseInt(url.searchParams.get('limit') || '200');
      const { results } = await db.prepare(`SELECT c.user_id, c.role, c.content, c.ts, u.name FROM conversations c LEFT JOIN users u ON c.user_id=u.id ORDER BY c.ts DESC LIMIT ?`).bind(limit).all();
      return json(results || []);
    }

    // POST /api/owner-reply — owner manually sends a message as Shrishti
    if (request.method === 'POST' && path === '/api/owner-reply') {
      const b = await request.json();
      const { user_id, reply } = b;
      // save to conversations as assistant
      const id = user_id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
      await db.prepare(`INSERT OR REPLACE INTO conversations (id, user_id, role, content, ts) VALUES (?, ?, 'assistant', ?, ?)`)
        .bind(id, user_id, reply, Date.now()).run();
      // also add to pending with send_at = now so user gets it immediately
      const pid = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
      await db.prepare(`INSERT INTO pending_replies (id, user_id, reply, send_at, sent) VALUES (?, ?, ?, ?, 0)`)
        .bind(pid, user_id, reply, Date.now()).run();
      return json({ ok: true });
    }

    // GET /api/ai-mode/:userId — check if AI is on for this user
    if (request.method === 'GET' && path.startsWith('/api/ai-mode/')) {
      const userId = decodeURIComponent(path.split('/api/ai-mode/')[1]);
      const user = await db.prepare(`SELECT ai_paused FROM users WHERE id=?`).bind(userId).first();
      return json({ ai_on: !user?.ai_paused });
    }

    // POST /api/ai-mode/:userId — toggle AI on/off per user
    if (request.method === 'POST' && path.startsWith('/api/ai-mode/')) {
      const userId = decodeURIComponent(path.split('/api/ai-mode/')[1]);
      const b = await request.json();
      await db.prepare(`UPDATE users SET ai_paused=? WHERE id=?`).bind(b.ai_on ? 0 : 1, userId).run();
      return json({ ok: true });
    }

    // ══ POST /api/chat ══
    if (request.method === 'POST' && path === '/api/chat') {
      const b = await request.json();
      const { system, messages, userId } = b;

      // check ai_paused — if owner is handling this convo, skip AI
      if (userId) {
        const u = await db.prepare(`SELECT ai_paused FROM users WHERE id=?`).bind(userId).first();
        if (u?.ai_paused) return json({ reply: null, delay: 0, paused: true });
      }

      // get her state
      const state = await db.prepare(`SELECT * FROM her_state WHERE id=1`).first();
      const ist = getIST();
      const customDay = await db.prepare(`SELECT slots FROM schedule_weekly WHERE day=?`).bind(ist.day).first();
      const todaySchedule = customDay ? JSON.parse(customDay.slots) : DEFAULT_SCHEDULE[ist.day];
      const activity = getCurrentActivity(todaySchedule, ist.hour, ist.day);

      let mood = state?.mood || 'chill';
      if (!state?.mood_locked) {
        mood = await computeAutoMood(db, mood);
        if (mood !== state?.mood) {
          await db.prepare(`UPDATE her_state SET mood=?, updated_at=? WHERE id=1`).bind(mood, Date.now()).run();
        }
      }

      const onlineStatus = state?.status || 'offline';

      // get user context
      let userCtx = null;
      if (userId) {
        try { userCtx = await db.prepare(`SELECT * FROM users WHERE id=?`).bind(userId).first(); } catch(e) {}
      }

      // build enriched system prompt
      const enrichedSystem = `${system}

— CURRENT STATE —
Mood: ${mood}
Right now: ${activity.activity}
Time: ${ist.hour}:${String(ist.min).padStart(2,'0')} IST
Online status: ${onlineStatus}
${userCtx?.trusted ? 'This person is someone you trust.' : ''}
${userCtx?.ignore_mode ? 'You find this person uninteresting. Very short, dry replies.' : ''}
${userCtx?.roast_mode ? 'Roast mode on for this person.' : ''}

— REPLY STYLE based on mood —
${mood === 'sleeping' ? 'You are asleep. Do not reply at all — say nothing or just zzz' : ''}
${mood === 'deep_work' ? 'You are deep in code. Extremely distracted. One word replies max.' : ''}
${mood === 'annoyed' ? 'You are irritated. Cold, minimal, slightly sharp.' : ''}
${mood === 'tired' ? 'You are exhausted. Short, slow, not really there.' : ''}
${mood === 'flirty' ? 'You are in a playful, flirty mood. Engage more.' : ''}
${mood === 'curious' ? 'Something caught your attention. Ask back, dig deeper.' : ''}
${mood === 'bored' ? 'Everything feels dull. Unbothered replies unless something actually interests you.' : ''}
${mood === 'happy' ? 'Good energy today. Warmer, slightly more talkative.' : ''}

You decide the tone completely. Be yourself. No rules on warmth or coldness.`;

      const fullMsgs = [{ role: 'system', content: enrichedSystem }, ...messages];

      const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.GROQ_API_KEY },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: fullMsgs, max_tokens: 120, temperature: 0.95 })
      });

      const aiData = await aiRes.json();
      const raw = aiData.choices?.[0]?.message?.content;
      if (!raw) return json({ error: 'ai_failed', detail: aiData }, 502);

      const reply = raw
        .replace(/^(sure!?|of course!?|absolutely!?|certainly!?|great!?|wow!?)\s*/gi, '')
        .replace(/\bas an ai\b.*?[.!]/gi, '')
        .replace(/\bi('m| am) (an? )?(ai|language model|chatbot|assistant)\b.*?[.!]/gi, '')
        .replace(/\bi (can't|cannot) (actually )?/gi, "i don't ")
        .trim();

      // ══ SMART DELAY CALCULATION ══
      const lastMsg = messages[messages.length - 1]?.content || '';
      const msgCount = messages.length;

      // base from schedule
      let delayMin = activity.delay_min;
      let delayMax = activity.delay_max;

      // online status override
      if (onlineStatus === 'online') { delayMin = 1; delayMax = 3; }
      else if (onlineStatus === 'away') { delayMin = Math.min(delayMin, 5); delayMax = Math.min(delayMax, 15); }

      // mood multiplier
      const moodMult = MOOD_MULTIPLIER[mood] || 1.0;
      if (mood === 'sleeping') return json({ reply: null, delay: 99 * 60 * 1000 });

      // convo multiplier
      const convoMult = getConvoMultiplier(lastMsg, msgCount);

      // final delay in ms
      const finalMin = delayMin * moodMult * convoMult;
      const finalMax = delayMax * moodMult * convoMult;
      const delayMs = Math.floor((finalMin + Math.random() * (finalMax - finalMin)) * 60 * 1000);

      return json({ reply, delay: delayMs });
    }

    return json({ error: 'not found' }, 404);
  }
};
