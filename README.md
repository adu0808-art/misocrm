# MISO CRM

Node.js + Express + SQLite 기반 프로젝트/영업 관리 시스템.

## 폴더 구조
```
/db/              SQLite DB (crm.db) — 자동 생성
/server/
  index.js        Express 앱
  db.js           DB 초기화 & 스키마
  seed.js         샘플 데이터 시더
  routes/         API 라우트
/public/          HTML/CSS/JS (반응형)
```

## 실행 방법

### 1) 의존성 설치 (최초 1회)
```
npm install
```

### 2) 샘플 데이터 시드 (최초 1회)
```
npm run seed
```
이미 데이터가 있으면 건너뜁니다. 강제 재시드:
```
set SEED_FORCE=1 && npm run seed     (Windows cmd)
$env:SEED_FORCE=1; npm run seed      (PowerShell)
```

### 3) 서버 실행
```
npm start
```
브라우저에서 `http://localhost:3000` 접속.

## 주요 화면
- **대시보드**(`/index.html`) — 본부별 영업목표 달성, 영업이익, 월별 매출, 상태 분포, 마감/미수금
- **프로젝트 관리**(`/projects.html`) — 목록 / 필터 / 상세 / 신규 등록
- **프로젝트 상세**(`/project-detail.html?id=`) — 기본정보 / 솔루션 납품 / 매출·채권 / 매입·지급 / 활동이력 / 손익요약
- **활동 이력**(`/activities.html`) — 전체 활동 통합 조회
- **영업목표 / 판관비**(`/targets.html`) — 연도·본부별 목표/판관비/공통비 입력
- **기준정보**(`/masters.html`) — 사업본부 / 사용자 / 고객사 / 프로젝트 유형 / 솔루션 CRUD

## 영업이익 계산식
```
매출총이익 = 매출 합계 − 매입 합계   (project_sales / project_purchases)
영업이익   = 매출총이익 − 판매관리비 − 공통비
```
- 매출/매입은 프로젝트의 `project_sales.sales_amount`, `project_purchases.purchase_amount` 합산 (사업년도 기준)
- 판관비/공통비는 `targets.html`에서 본부·연도 단위로 입력
- 예상매출(가중) = 수주완료/수행종료의 expected_revenue + (기획/영업/제안 단계 × 수주확률)

## 모바일
- 좌측 사이드바는 900px 이하에서 햄버거 메뉴로 자동 전환
- 폼/테이블/카드 모두 반응형

## 데이터 백업
`/db/crm.db` 파일 단일 백업으로 충분합니다. WAL 모드이므로 종료된 상태에서 복사 권장.
