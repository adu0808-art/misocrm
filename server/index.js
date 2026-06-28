const path = require('path');
const express = require('express');
const db = require('./db');
const auth = require('./routes/auth');

const app = express();
app.use(express.json({ limit: '5mb' }));

// 1) 인증 라우트는 보호 미들웨어 이전에 등록 (로그인/로그아웃 자체는 인증 필요 없음)
app.use('/api/auth', auth.router);

// 2) 공개 자원 (CSS/JS/이미지, 로그인 페이지) 화이트리스트
const PUBLIC_PATHS = new Set(['/login.html', '/favicon.ico']);
const PUBLIC_PREFIXES = ['/css/', '/js/', '/img/', '/assets/'];

function isPublic(p) {
  if (PUBLIC_PATHS.has(p)) return true;
  return PUBLIC_PREFIXES.some(pre => p.startsWith(pre));
}

// 3) 인증 미들웨어
app.use((req, res, next) => {
  if (isPublic(req.path)) return next();
  if (req.path.startsWith('/api/auth/')) return next();

  const token = auth.getCookie(req, auth.SESSION_NAME);
  const session = auth.lookupSession(token);
  if (!session) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: '로그인이 필요합니다.' });
    // HTML 페이지 요청이면 로그인 페이지로 리다이렉트 (원래 가려던 경로 보존)
    const wanted = encodeURIComponent(req.originalUrl || req.url || '/');
    return res.redirect(`/login.html?next=${wanted}`);
  }
  req.user = session;
  next();
});

// 4) 정적 파일 (인증 통과 후 또는 화이트리스트 경로에 대해)
app.use(express.static(path.join(__dirname, '..', 'public')));

// 5) API 라우트 (이제부터 모두 인증 필요)
app.use('/api/masters', require('./routes/masters'));
app.use('/api/customer-contacts', require('./routes/customer_contacts'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/project-solutions', require('./routes/project_solutions'));
app.use('/api/project-resources', require('./routes/project_resources'));
app.use('/api/activities', require('./routes/activities'));
app.use('/api/targets', require('./routes/targets'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/cashflow', require('./routes/cashflow'));
app.use('/api/bizno', require('./routes/bizno'));
app.use('/api/nts', require('./routes/nts'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MISO CRM 서버 실행 중: http://localhost:${PORT}`);
});
