# MISO CRM

Node.js + Express + SQLite 기반 프로젝트/영업 관리 시스템.

## 배포 정책 (중요)

배포 시 **스키마는 자동 갱신되고, 운영 데이터는 보존**됩니다.

- **스키마**: 매 부팅마다 마이그레이션 적용 (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF MISSING`). 기존 데이터는 그대로 둔 채 새 테이블/컬럼만 추가됩니다.
- **데이터**: 시드(`db/initial.db`, 개발 스냅샷)는 **운영 환경에서 기본 비활성화**됩니다. 배포가 개발 데이터를 운영에 절대 넣지 않습니다.
  - 운영(Railway 등): 기본 시드 OFF → 빈 DB는 스키마 + admin만 생성. 기존 DB는 데이터 보존.
  - 로컬 개발: 기본 시드 ON → 새 클론에서 데모 데이터 자동 적재.
  - `SEED_ON_FIRST_RUN=1` → 운영에서도 DB가 없을 때 1회 의도적 시드.
  - `SEED_DISABLED=1` → 어디서든 시드 완전 비활성화.
- **재배포**: 영속 볼륨의 DB를 그대로 사용 → 데이터 유지 (덮어쓰기 없음).

### Railway 등 운영 환경 필수 설정
- 영속 볼륨 마운트 (예: `/data`)
- 환경변수 `DB_PATH=/data/crm.db`
  - ⚠️ DB_PATH 미설정 시 컨테이너 내부 경로를 사용하므로 **재배포마다 데이터가 초기화**됩니다 (부팅 로그에 경고 출력).
- (선택) `ADMIN_PASSWORD` — admin 초기 비밀번호
- (선택) `SEED_DISABLED=1` — 시드 복사를 완전히 비활성화하고 빈 DB로 시작 (admin 계정은 자동 생성)

`db/initial.db`는 **최초 1회 부트스트랩용 시드**입니다. 코드/스키마만 배포할 때는 이 파일을 갱신하지 않으므로, 배포가 운영 데이터를 변경하지 않습니다.

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
