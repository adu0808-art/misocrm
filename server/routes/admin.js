// 관리자 전용 — DB 백업 다운로드
const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const db = require('../db');
const router = express.Router();

// admin 세션만 허용
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '관리자만 사용할 수 있습니다.' });
  }
  next();
}

// GET /api/admin/backup — 일관된 스냅샷을 만들어 crm.db 파일로 다운로드
router.get('/backup', requireAdmin, async (req, res) => {
  const tmp = path.join(os.tmpdir(), `crm-backup-${Date.now()}.db`);
  try {
    await db.backup(tmp);                 // WAL 포함 일관 스냅샷
    const today = new Date().toISOString().slice(0, 10);
    res.download(tmp, `crm-backup-${today}.db`, (err) => {
      fs.unlink(tmp, () => {});           // 전송 후 임시파일 정리
    });
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    res.status(500).json({ error: '백업 생성 실패: ' + e.message });
  }
});

module.exports = router;
