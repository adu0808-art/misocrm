// Bizno.net 사업자조회 API 프록시
// - API 키를 서버에 숨김
// - CORS 우회
// 문서: https://bizno.net/api/fapi
const express = require('express');
const router = express.Router();

const BIZNO_API_KEY = process.env.BIZNO_API_KEY || '204pCaen21GSJP5QIvtN';
const BIZNO_BASE = 'https://bizno.net/api/fapi';

router.get('/search', async (req, res) => {
  try {
    const { q, gb, area, ceo, page, pagecnt, status } = req.query;
    if (!q || !String(q).trim()) {
      return res.status(400).json({ error: '검색어(q)가 필요합니다.' });
    }

    const params = new URLSearchParams();
    params.set('key', BIZNO_API_KEY);
    params.set('q', String(q).trim());
    params.set('type', 'json');
    if (gb)      params.set('gb', gb);
    if (area)    params.set('area', area);
    if (ceo)     params.set('ceo', ceo);
    if (page)    params.set('page', page);
    if (pagecnt) params.set('pagecnt', pagecnt);
    if (status)  params.set('status', status);

    const url = `${BIZNO_BASE}?${params.toString()}`;
    const r = await fetch(url, { method: 'GET' });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      // XML로 응답이 올 수도 있음 — 본문을 그대로 전달
      console.error('Bizno 응답 파싱 실패:', text.substring(0, 200));
      return res.status(502).json({ error: 'Bizno API JSON 파싱 실패', raw: text.substring(0, 500) });
    }

    // 응답 정규화: items 배열로 통일
    let items = [];
    if (Array.isArray(data)) items = data;
    else if (data.items && Array.isArray(data.items)) items = data.items;
    else if (data.list && Array.isArray(data.list)) items = data.list;
    else if (data.result && Array.isArray(data.result)) items = data.result;
    else if (data && typeof data === 'object') {
      const numericEntries = Object.entries(data).filter(([k]) => /^\d+$/.test(k));
      if (numericEntries.length) items = numericEntries.map(([, v]) => v);
    }

    // Bizno는 pagecnt 채우려고 null로 padding 하는 경우가 있어 필터링
    items = items.filter(it => it && typeof it === 'object' && (it.company || it.bno || it.cno));

    res.json({
      ok: true,
      total: data.totalCount || data.total || items.length,
      items
    });
  } catch (e) {
    console.error('Bizno API 오류:', e);
    res.status(500).json({ error: e.message || '사업자조회 호출 실패' });
  }
});

module.exports = router;
