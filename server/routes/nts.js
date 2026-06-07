// 국세청 사업자등록정보 진위확인 및 상태조회 (공공데이터포털 api.odcloud.kr)
// - POST /api/nts/status   : 상태조회 (b_no 만 있으면 됨)
// - POST /api/nts/validate : 진위확인 (b_no + p_nm + start_dt 등)
// docs: https://infuser.odcloud.kr/api/stages/28493/api-docs
const express = require('express');
const router = express.Router();

const NTS_KEY = process.env.NTS_SERVICE_KEY
  || '6w6C6DrCxpE8nG4CUywv1lHBPmZ7lex0HA5IzQTxIRg4sefpwy4b0Ll0GVIN9kX0CjuxlbhrnwLQuX9ZpDewEQ==';
const BASE = 'https://api.odcloud.kr/api/nts-businessman/v1';

function cleanBno(s) { return String(s || '').replace(/[^\d]/g, ''); }
function cleanDate(s) { return String(s || '').replace(/[^\d]/g, ''); }

async function callNts(path, body) {
  const params = new URLSearchParams({ serviceKey: NTS_KEY, returnType: 'JSON' });
  const url = `${BASE}${path}?${params.toString()}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); }
  catch (e) { throw new Error('NTS API JSON 파싱 실패: ' + text.substring(0, 200)); }
  if (!r.ok && !data.data) {
    throw new Error(`NTS API 오류 (${r.status}): ${data.message || data.msg || text.substring(0, 200)}`);
  }
  return data;
}

// 상태조회: 사업자번호만 있으면 됨
router.post('/status', async (req, res) => {
  try {
    const bnoList = (Array.isArray(req.body.b_no) ? req.body.b_no : [req.body.b_no])
      .map(cleanBno).filter(b => b && b.length === 10);
    if (!bnoList.length) {
      return res.status(400).json({ error: '유효한 사업자등록번호(10자리)가 필요합니다.' });
    }
    const data = await callNts('/status', { b_no: bnoList });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 진위확인: 사업자번호 + 대표자명 + 개업일자 (+ 선택 항목)
router.post('/validate', async (req, res) => {
  try {
    const items = Array.isArray(req.body.businesses) ? req.body.businesses : [req.body];
    const businesses = items.map(it => ({
      b_no: cleanBno(it.b_no),
      start_dt: cleanDate(it.start_dt),
      p_nm: String(it.p_nm || '').trim(),
      p_nm2: String(it.p_nm2 || ''),
      b_nm: String(it.b_nm || ''),
      corp_no: cleanBno(it.corp_no),
      b_sector: String(it.b_sector || ''),
      b_type: String(it.b_type || ''),
      b_adr: String(it.b_adr || '')
    })).filter(b => b.b_no && b.b_no.length === 10 && b.p_nm && b.start_dt);
    if (!businesses.length) {
      return res.status(400).json({ error: '진위확인은 사업자번호(10자리), 대표자명, 개업일자(YYYYMMDD)가 필수입니다.' });
    }
    const data = await callNts('/validate', { businesses });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
