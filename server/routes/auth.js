// 인증 - scrypt 해시 + 쿠키 기반 세션 (DB 저장)
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const router = express.Router();

const SESSION_NAME = 'miso_session';
const SESSION_DAYS = 7;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const check = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
  } catch { return false; }
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const match = cookies.match(new RegExp('(^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function validateComplexity(p) {
  if (!p || typeof p !== 'string') return '비밀번호를 입력하세요.';
  if (p.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
  if (!/[a-z]/.test(p)) return '소문자를 포함해야 합니다.';
  if (!/[A-Z]/.test(p)) return '대문자를 포함해야 합니다.';
  if (!/\d/.test(p))    return '숫자를 포함해야 합니다.';
  if (!/[^a-zA-Z0-9]/.test(p)) return '특수문자(!@#$ 등)를 포함해야 합니다.';
  return null;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return { token, expires };
}

function lookupSession(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.user_id, s.expires_at,
           u.id, u.username, u.name, u.role, u.active, u.division_id,
           d.name AS division_name
    FROM sessions s
    LEFT JOIN users u ON s.user_id = u.id
    LEFT JOIN divisions d ON u.division_id = d.id
    WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
  `).get(token);
  if (!row || !row.active) return null;
  return row;
}

// 만료된 세션 정기 청소 (1시간마다)
setInterval(() => {
  try { db.prepare("DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')").run(); } catch {}
}, 60 * 60 * 1000);

// ============== ROUTES ==============

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
  }
  const user = db.prepare(
    'SELECT id, username, name, role, password_hash, active FROM users WHERE username = ?'
  ).get(username);
  if (!user || !user.active) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  if (!user.password_hash) {
    return res.status(401).json({ error: '비밀번호가 설정되지 않은 계정입니다. 관리자에게 문의하세요.' });
  }
  if (!verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  const { token } = createSession(user.id);
  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  res.setHeader('Set-Cookie',
    `${SESSION_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 3600}`
  );
  res.json({ ok: true, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
});

router.post('/logout', (req, res) => {
  const token = getCookie(req, SESSION_NAME);
  if (token) {
    try { db.prepare('DELETE FROM sessions WHERE token = ?').run(token); } catch {}
  }
  res.setHeader('Set-Cookie', `${SESSION_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = getCookie(req, SESSION_NAME);
  const s = lookupSession(token);
  if (!s) return res.status(401).json({ error: '인증되지 않음' });
  res.json({ user: { id: s.id, username: s.username, name: s.name, role: s.role,
                     division_id: s.division_id, division_name: s.division_name } });
});

// 자기 비밀번호 변경
router.post('/change-password', (req, res) => {
  const token = getCookie(req, SESSION_NAME);
  const s = lookupSession(token);
  if (!s) return res.status(401).json({ error: '인증되지 않음' });
  const { current, next } = req.body || {};
  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(s.id);
  if (!user || !verifyPassword(current, user.password_hash)) {
    return res.status(401).json({ error: '현재 비밀번호가 일치하지 않습니다.' });
  }
  const err = validateComplexity(next);
  if (err) return res.status(400).json({ error: err });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id);
  // 다른 세션 모두 끊기
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(user.id, token);
  res.json({ ok: true });
});

module.exports = {
  router,
  hashPassword, verifyPassword, validateComplexity,
  getCookie, lookupSession, SESSION_NAME
};
