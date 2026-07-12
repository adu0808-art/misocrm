const express = require('express');
const db = require('../db');
const router = express.Router();

function crud(table, fields, options = {}) {
  const r = express.Router();
  const sortBy = options.sortBy || 'id';
  const selectExtras = options.selectExtras || '';

  r.get('/', (req, res) => {
    const rows = db.prepare(`SELECT t.* ${selectExtras} FROM ${table} t ${options.join || ''} ORDER BY ${sortBy}`).all();
    res.json(rows);
  });

  r.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT t.* ${selectExtras} FROM ${table} t ${options.join || ''} WHERE t.id=?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  r.post('/', (req, res) => {
    const values = fields.map(f => req.body[f] ?? null);
    const placeholders = fields.map(() => '?').join(',');
    const result = db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders})`).run(...values);
    res.json({ id: result.lastInsertRowid });
  });

  r.put('/:id', (req, res) => {
    const sets = fields.map(f => `${f}=?`).join(',');
    const values = fields.map(f => req.body[f] ?? null);
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id=?`).run(...values, req.params.id);
    res.json({ ok: true });
  });

  r.delete('/:id', (req, res) => {
    try {
      db.prepare(`DELETE FROM ${table} WHERE id=?`).run(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: '참조 중인 데이터가 있어 삭제할 수 없습니다.' });
    }
  });

  return r;
}

// 본부 순서 일괄 갱신 (드래그 정렬) — crud 마운트보다 먼저 등록
router.post('/divisions/reorder', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids 배열이 필요합니다.' });
  const upd = db.prepare('UPDATE divisions SET sort_order=? WHERE id=?');
  const tx = db.transaction((list) => {
    list.forEach((id, idx) => upd.run(idx + 1, id));
  });
  tx(ids.map(Number));
  res.json({ ok: true });
});

router.use('/divisions', crud('divisions',
  ['code', 'name', 'sort_order', 'active', 'valid_from', 'valid_to'], { sortBy: 't.sort_order, t.id' }));

// ── 직원 라우터(/users): 프로젝트 담당 스태프. 비밀번호 없음 ──
(function employeeRouter() {
  const r = express.Router();
  const HR_FIELDS = ['birth_date', 'sci_tech_no', 'address', 'annual_salary', 'monthly_pay', 'base_pay', 'meal_allowance', 'overtime_allowance', 'childcare_allowance', 'ins_pension', 'ins_health', 'ins_employment', 'ins_accident', 'severance_monthly', 'severance_annual', 'severance_on_leave',
    'career_period', 'career_start', 'edu_final', 'grad_school', 'grad_major', 'grad_year', 'university', 'univ_major', 'univ_year', 'cert1', 'cert1_date', 'cert2', 'cert2_date', 'cert3', 'cert3_date', 'cert4', 'cert4_date', 'note'];
  const FIELDS = ['username', 'name', 'division_id', 'role', 'email', 'phone', 'active', 'is_login', 'position', 'employee_number', 'hq', 'team', 'hire_date', 'leave_date', ...HR_FIELDS];
  const SELECT_COLS = 'id, username, name, division_id, role, email, phone, active, is_login, position, employee_number, hq, team, hire_date, leave_date, ' + HR_FIELDS.join(', ') + ', last_login_at, created_at';

  r.get('/', (req, res) => res.json(db.prepare(`SELECT ${SELECT_COLS} FROM users ORDER BY id`).all()));
  r.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM users WHERE id=?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });
  r.post('/', (req, res) => {
    const values = FIELDS.map(f => req.body[f] ?? null);
    try {
      const result = db.prepare(`INSERT INTO users (${FIELDS.join(',')}) VALUES (${FIELDS.map(()=>'?').join(',')})`).run(...values);
      res.json({ id: result.lastInsertRowid });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: `이미 존재하는 ID입니다: ${req.body.username}` });
      res.status(400).json({ error: e.message });
    }
  });
  r.put('/:id', (req, res) => {
    const sets = FIELDS.map(f => `${f}=?`).join(',');
    const values = FIELDS.map(f => req.body[f] ?? null);
    try {
      db.prepare(`UPDATE users SET ${sets} WHERE id=?`).run(...values, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: `이미 존재하는 ID입니다: ${req.body.username}` });
      res.status(400).json({ error: e.message });
    }
  });
  r.delete('/:id', (req, res) => {
    const uid = req.params.id;
    const projects = db.prepare(`
      SELECT p.id, p.project_code, p.project_name, p.status, p.business_year,
        TRIM((CASE WHEN p.manager_id=? THEN '주관 ' ELSE '' END) ||
             (CASE WHEN p.pm_id=? THEN 'PM ' ELSE '' END) ||
             (CASE WHEN p.sales_rep_id=? THEN '영업' ELSE '' END)) AS roles
      FROM projects p
      WHERE p.manager_id=? OR p.pm_id=? OR p.sales_rep_id=?
      ORDER BY p.business_year DESC, p.project_code
    `).all(uid, uid, uid, uid, uid, uid);
    if (projects.length) {
      return res.status(400).json({ error: `관련 사업 ${projects.length}건이 있어 삭제할 수 없습니다. (비활성 처리 권장)`, projects });
    }
    try { db.prepare('DELETE FROM users WHERE id=?').run(uid); res.json({ ok: true }); }
    catch (e) { res.status(400).json({ error: '참조 중인 데이터가 있어 삭제할 수 없습니다.' }); }
  });
  router.use('/users', r);
})();

// ── 로그인 계정 라우터(/accounts): 비밀번호 처리 ──
(function accountRouter() {
  const r = express.Router();
  const auth = require('./auth');
  const FIELDS = ['username', 'name', 'division_id', 'role', 'email', 'phone', 'active'];
  const SELECT_COLS = 'id, username, name, division_id, role, email, phone, active, last_login_at, created_at';

  r.get('/', (req, res) => res.json(db.prepare(`SELECT ${SELECT_COLS} FROM accounts ORDER BY id`).all()));
  r.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM accounts WHERE id=?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });
  r.post('/', (req, res) => {
    const values = FIELDS.map(f => req.body[f] ?? null);
    let pwHash = null;
    if (req.body.password) {
      const err = auth.validateComplexity(req.body.password);
      if (err) return res.status(400).json({ error: err });
      pwHash = auth.hashPassword(req.body.password);
    }
    try {
      const result = db.prepare(`INSERT INTO accounts (${FIELDS.join(',')}, password_hash) VALUES (${FIELDS.map(()=>'?').join(',')}, ?)`).run(...values, pwHash);
      res.json({ id: result.lastInsertRowid });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: `이미 존재하는 ID입니다: ${req.body.username}` });
      res.status(400).json({ error: e.message });
    }
  });
  r.put('/:id', (req, res) => {
    const sets = FIELDS.map(f => `${f}=?`).join(',');
    const values = FIELDS.map(f => req.body[f] ?? null);
    try {
      db.prepare(`UPDATE accounts SET ${sets} WHERE id=?`).run(...values, req.params.id);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: `이미 존재하는 ID입니다: ${req.body.username}` });
      return res.status(400).json({ error: e.message });
    }
    if (req.body.password) {
      const err = auth.validateComplexity(req.body.password);
      if (err) return res.status(400).json({ error: err });
      db.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(auth.hashPassword(req.body.password), req.params.id);
      try { db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.params.id); } catch {}
    }
    res.json({ ok: true });
  });
  r.delete('/:id', (req, res) => {
    const row = db.prepare('SELECT username FROM accounts WHERE id=?').get(req.params.id);
    if (row && row.username === 'admin') return res.status(400).json({ error: 'admin 계정은 삭제할 수 없습니다.' });
    db.prepare('DELETE FROM accounts WHERE id=?').run(req.params.id);
    try { db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.params.id); } catch {}
    res.json({ ok: true });
  });
  router.use('/accounts', r);
})();

// ── 사용자 신청 관리 (관리자) ──
router.get('/account-requests', (req, res) => {
  res.json(db.prepare("SELECT id, username, name, email, phone, created_at FROM account_requests WHERE status='pending' ORDER BY created_at").all());
});
router.post('/account-requests/:id/approve', (req, res) => {
  const auth = require('./auth');
  const reqRow = db.prepare("SELECT * FROM account_requests WHERE id=? AND status='pending'").get(req.params.id);
  if (!reqRow) return res.status(404).json({ error: '신청을 찾을 수 없습니다.' });
  if (db.prepare('SELECT 1 FROM accounts WHERE username=?').get(reqRow.username)) {
    return res.status(400).json({ error: `이미 존재하는 ID입니다: ${reqRow.username}` });
  }
  const body = req.body || {};
  db.prepare(`INSERT INTO accounts (username, name, division_id, role, email, phone, active, password_hash)
              VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
    .run(reqRow.username, reqRow.name, body.division_id ?? null, body.role || 'user',
         reqRow.email, reqRow.phone, reqRow.password_hash);
  db.prepare("UPDATE account_requests SET status='approved', processed_at=CURRENT_TIMESTAMP WHERE id=?").run(reqRow.id);
  res.json({ ok: true });
});
router.post('/account-requests/:id/reject', (req, res) => {
  db.prepare("UPDATE account_requests SET status='rejected', processed_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

router.use('/customers', crud('customers', [
  'name', 'contact_person', 'phone', 'email', 'address', 'detail_address',
  'industry', 'legal_type', 'business_no', 'corp_no',
  'top_domain', 'sub_domain', 'biz_type', 'biz_category',
  'ceo_name', 'ceo_phone', 'fax', 'notes'
]));

router.use('/project-types', crud('project_types',
  ['code', 'name', 'sort_order', 'is_internal'], { sortBy: 't.sort_order, t.id' }));

// 솔루션 순서 일괄 갱신 (드래그 정렬) — crud 마운트보다 먼저 등록
router.post('/solutions/reorder', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids 배열이 필요합니다.' });
  const upd = db.prepare('UPDATE solutions SET sort_order=? WHERE id=?');
  const tx = db.transaction((list) => { list.forEach((id, idx) => upd.run(idx + 1, id)); });
  tx(ids.map(Number));
  res.json({ ok: true });
});

router.use('/solutions', crud('solutions', [
  'code', 'name', 'vendor', 'spec',
  'base_consumer_price', 'recommended_price', 'standard_price', 'max_discount',
  'cogs', 'internal_cost', 'is_sellable', 'is_internal', 'sales_division_id',
  'notes', 'active'
], {
  join: 'LEFT JOIN divisions d ON t.sales_division_id = d.id',
  selectExtras: ', d.name AS sales_division_name',
  // 정렬: sort_order 순 (미설정 0/NULL은 맨 뒤)
  sortBy: '(CASE WHEN t.sort_order IS NULL OR t.sort_order=0 THEN 999999 ELSE t.sort_order END), t.id'
}));

module.exports = router;
