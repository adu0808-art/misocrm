const express = require('express');
const db = require('../db');
const router = express.Router();

const FIELDS = ['project_id','activity_date','category','post_win_rate','title','content','created_by'];

router.get('/', (req, res) => {
  const { project_id, category, keyword } = req.query;
  const where = [];
  const params = [];
  if (project_id) { where.push('a.project_id = ?'); params.push(project_id); }
  if (category) { where.push('a.category = ?'); params.push(category); }
  if (keyword) { where.push('(a.title LIKE ? OR a.content LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
  const sql = `SELECT a.*, u.name AS creator_name, p.project_name FROM activities a
               LEFT JOIN users u ON a.created_by = u.id
               LEFT JOIN projects p ON a.project_id = p.id
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY a.activity_date DESC, a.id DESC`;
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const values = FIELDS.map(f => req.body[f] ?? null);
  const result = db.prepare(`INSERT INTO activities (${FIELDS.join(',')}) VALUES (${FIELDS.map(()=>'?').join(',')})`).run(...values);
  if (req.body.update_project_win_rate && req.body.project_id && req.body.post_win_rate != null) {
    db.prepare('UPDATE projects SET win_probability=? WHERE id=?').run(req.body.post_win_rate, req.body.project_id);
  }
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const sets = FIELDS.map(f => `${f}=?`).join(',');
  const values = FIELDS.map(f => req.body[f] ?? null);
  db.prepare(`UPDATE activities SET ${sets} WHERE id=?`).run(...values, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM activities WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
