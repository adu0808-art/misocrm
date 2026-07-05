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

// users는 password 처리를 위해 별도 라우터로 구성
(function userRouter() {
  const r = express.Router();
  const auth = require('./auth');
  const FIELDS = ['username', 'name', 'division_id', 'role', 'email', 'phone', 'active'];

  // 비밀번호 해시는 응답에서 제외
  r.get('/', (req, res) => {
    res.json(db.prepare('SELECT id, username, name, division_id, role, email, phone, active, last_login_at, created_at FROM users ORDER BY id').all());
  });
  r.get('/:id', (req, res) => {
    const row = db.prepare('SELECT id, username, name, division_id, role, email, phone, active, last_login_at, created_at FROM users WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });
  r.post('/', (req, res) => {
    const values = FIELDS.map(f => req.body[f] ?? null);
    const placeholders = FIELDS.map(() => '?').join(',');
    let pwHash = null;
    if (req.body.password) {
      const err = auth.validateComplexity(req.body.password);
      if (err) return res.status(400).json({ error: err });
      pwHash = auth.hashPassword(req.body.password);
    }
    const result = db.prepare(
      `INSERT INTO users (${FIELDS.join(',')}, password_hash) VALUES (${placeholders}, ?)`
    ).run(...values, pwHash);
    res.json({ id: result.lastInsertRowid });
  });
  r.put('/:id', (req, res) => {
    const sets = FIELDS.map(f => `${f}=?`).join(',');
    const values = FIELDS.map(f => req.body[f] ?? null);
    db.prepare(`UPDATE users SET ${sets} WHERE id=?`).run(...values, req.params.id);
    if (req.body.password) {
      const err = auth.validateComplexity(req.body.password);
      if (err) return res.status(400).json({ error: err });
      db.prepare('UPDATE users SET password_hash=? WHERE id=?')
        .run(auth.hashPassword(req.body.password), req.params.id);
      // 비밀번호 변경 시 해당 사용자의 모든 세션 종료
      try { db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.params.id); } catch {}
    }
    res.json({ ok: true });
  });
  r.delete('/:id', (req, res) => {
    const uid = req.params.id;
    // 관련 사업(프로젝트) 확인: 주관자/PM/영업담당으로 참조 중이면 삭제 불가 + 목록 반환
    const projects = db.prepare(`
      SELECT p.id, p.project_code, p.project_name, p.status, p.business_year,
        TRIM(
          (CASE WHEN p.manager_id=?  THEN '주관 ' ELSE '' END) ||
          (CASE WHEN p.pm_id=?       THEN 'PM '  ELSE '' END) ||
          (CASE WHEN p.sales_rep_id=? THEN '영업' ELSE '' END)
        ) AS roles
      FROM projects p
      WHERE p.manager_id=? OR p.pm_id=? OR p.sales_rep_id=?
      ORDER BY p.business_year DESC, p.project_code
    `).all(uid, uid, uid, uid, uid, uid);
    if (projects.length) {
      return res.status(400).json({
        error: `관련 사업 ${projects.length}건이 있어 삭제할 수 없습니다. (비활성 처리 권장)`,
        projects
      });
    }
    try {
      db.prepare('DELETE FROM users WHERE id=?').run(uid);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: '참조 중인 데이터가 있어 삭제할 수 없습니다.' });
    }
  });
  router.use('/users', r);
})();

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
