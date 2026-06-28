const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// 로컬 dev:   DB_DIR = ../db, DB_PATH = ../db/crm.db
// Railway 등 운영: DB_PATH env로 볼륨 경로 지정 (예: /data/crm.db)
const DB_DIR = path.join(__dirname, '..', 'db');
const SEED_PATH = path.join(DB_DIR, 'initial.db');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'crm.db');

// 운영 환경 디렉터리 자동 생성
const liveDir = path.dirname(DB_PATH);
if (!fs.existsSync(liveDir)) fs.mkdirSync(liveDir, { recursive: true });
if (!fs.existsSync(DB_DIR))  fs.mkdirSync(DB_DIR, { recursive: true });

// ============================================================
//  배포 정책
//   - 스키마: 매 부팅 시 마이그레이션 적용(CREATE IF NOT EXISTS / ADD COLUMN IF MISSING)
//   - 데이터: 기존 DB가 있으면 절대 덮어쓰지 않음 (시드는 "DB가 없을 때만" 1회)
//   - SEED_DISABLED=1 이면 시드 복사를 완전히 비활성화 (빈 DB로 시작)
// ============================================================
const seedDisabled = process.env.SEED_DISABLED === '1' || process.env.NO_SEED === '1';
const dbExisted = fs.existsSync(DB_PATH);

if (dbExisted) {
  // 이미 데이터가 있는 DB → 스키마만 갱신, 데이터 보존
  console.log(`[DB] 기존 DB 사용 (데이터 보존, 스키마만 마이그레이션): ${DB_PATH}`);
} else if (!seedDisabled && fs.existsSync(SEED_PATH)) {
  // 최초 1회: DB가 없을 때만 시드 복사
  fs.copyFileSync(SEED_PATH, DB_PATH);
  console.log(`[Bootstrap] 신규 DB 생성 - 초기 시드 복사: ${SEED_PATH} → ${DB_PATH}`);
} else {
  // 시드 비활성 또는 시드 파일 없음 → 빈 DB로 시작 (스키마는 init()에서 생성)
  console.log(`[DB] 빈 DB로 시작 (시드 ${seedDisabled ? '비활성화' : '없음'}). 스키마만 생성합니다: ${DB_PATH}`);
}

// 영속성 경고: 배포 환경인데 볼륨 경로(DB_PATH) 미지정이면 재배포마다 데이터가 사라짐
const isDeployed = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID ||
                      process.env.RENDER || process.env.FLY_APP_NAME);
if (isDeployed && !process.env.DB_PATH) {
  console.warn('⚠️  [경고] DB_PATH 미설정: 컨테이너 내부 경로를 사용하므로 재배포 시 데이터가 초기화됩니다.');
  console.warn('         영속 볼륨을 마운트하고 DB_PATH=/data/crm.db 를 설정하세요.');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}
function addColumnIfMissing(table, column, type) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS divisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      division_id INTEGER REFERENCES divisions(id),
      role TEXT DEFAULT 'user',
      email TEXT,
      phone TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      industry TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      vendor TEXT,
      spec TEXT,
      standard_price INTEGER DEFAULT 0,
      internal_cost INTEGER DEFAULT 0,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_code TEXT UNIQUE NOT NULL,
      project_name TEXT NOT NULL,
      project_type_id INTEGER REFERENCES project_types(id),
      status TEXT DEFAULT '기획단계',
      division_id INTEGER REFERENCES divisions(id),
      manager_id INTEGER REFERENCES users(id),
      pm_id INTEGER REFERENCES users(id),
      sales_rep_id INTEGER REFERENCES users(id),
      proposal_deadline DATE,
      customer_id INTEGER REFERENCES customers(id),
      customer_contact TEXT,
      prime_contractor TEXT,
      business_year INTEGER,
      start_date DATE,
      end_date DATE,
      total_budget INTEGER DEFAULT 0,
      participation_type TEXT DEFAULT '참여',
      total_purchase INTEGER DEFAULT 0,
      tech_support_date DATE,
      participation_rate REAL DEFAULT 0,
      participation_amount INTEGER DEFAULT 0,
      win_probability REAL DEFAULT 0,
      expected_revenue INTEGER DEFAULT 0,
      actual_revenue INTEGER DEFAULT 0,
      has_solution TEXT DEFAULT 'N',
      sw_registered TEXT DEFAULT 'N',
      competitor TEXT,
      intro_channel TEXT,
      overview TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      solution_id INTEGER REFERENCES solutions(id),
      spec TEXT,
      standard_price INTEGER DEFAULT 0,
      quantity INTEGER DEFAULT 1,
      internal_cost INTEGER DEFAULT 0,
      discount_rate REAL DEFAULT 0,
      delivery_amount INTEGER DEFAULT 0,
      install_date DATE,
      contract_issued TEXT DEFAULT 'N',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS project_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      invoice_date DATE,
      invoice_issued TEXT DEFAULT 'N',
      sales_amount INTEGER DEFAULT 0,
      vat INTEGER DEFAULT 0,
      total_amount INTEGER DEFAULT 0,
      unpaid_balance INTEGER DEFAULT 0,
      collection_type TEXT,
      cash_or_note TEXT,
      payment_due_date DATE,
      paid TEXT DEFAULT 'N',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS project_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      purchase_code TEXT,
      payment_due_date DATE,
      purchase_amount INTEGER DEFAULT 0,
      vat INTEGER DEFAULT 0,
      total_amount INTEGER DEFAULT 0,
      vendor TEXT,
      description TEXT,
      invoice_number TEXT,
      invoice_issued TEXT DEFAULT 'N',
      invoice_date DATE,
      paid TEXT DEFAULT 'N'
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      activity_date DATE,
      category TEXT,
      post_win_rate REAL DEFAULT 0,
      title TEXT,
      content TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      division_id INTEGER NOT NULL REFERENCES divisions(id),
      target_revenue INTEGER DEFAULT 0,
      target_profit INTEGER DEFAULT 0,
      memo TEXT,
      UNIQUE(year, division_id)
    );

    CREATE TABLE IF NOT EXISTS division_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      division_id INTEGER NOT NULL REFERENCES divisions(id),
      sga INTEGER DEFAULT 0,
      common_cost INTEGER DEFAULT 0,
      memo TEXT,
      UNIQUE(year, division_id)
    );

    CREATE TABLE IF NOT EXISTS division_monthly_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      division_id INTEGER NOT NULL REFERENCES divisions(id),
      sga INTEGER DEFAULT 0,
      common_cost INTEGER DEFAULT 0,
      UNIQUE(year, month, division_id)
    );
    CREATE INDEX IF NOT EXISTS idx_monthly_exp_year_div ON division_monthly_expenses(year, division_id);

    CREATE TABLE IF NOT EXISTS customer_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position TEXT,
      department TEXT,
      phone TEXT,
      mobile TEXT,
      email TEXT,
      is_primary INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_customer ON customer_contacts(customer_id);

    CREATE TABLE IF NOT EXISTS project_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      category TEXT,
      affiliation TEXT,
      name TEXT,
      position TEXT,
      start_date DATE,
      end_date DATE,
      participation_rate REAL DEFAULT 100,
      effort_mm REAL DEFAULT 0,
      total_days INTEGER DEFAULT 0,
      standard_price INTEGER DEFAULT 0,
      internal_cost INTEGER DEFAULT 0,
      discount_rate REAL DEFAULT 0,
      internal_total INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions(expires_at);

    CREATE INDEX IF NOT EXISTS idx_projects_division ON projects(division_id);
    CREATE INDEX IF NOT EXISTS idx_projects_year ON projects(business_year);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_sales_project ON project_sales(project_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_project ON project_purchases(project_id);
    CREATE INDEX IF NOT EXISTS idx_activities_project ON activities(project_id);
    CREATE INDEX IF NOT EXISTS idx_resources_project ON project_resources(project_id);
  `);

  // ---- 확장 컬럼 마이그레이션 ----
  // customers: 법인 정보
  addColumnIfMissing('customers', 'legal_type',     'TEXT');           // 법인/개인/공공
  addColumnIfMissing('customers', 'business_no',    'TEXT');           // 사업자등록번호
  addColumnIfMissing('customers', 'corp_no',        'TEXT');           // 법인등록번호
  addColumnIfMissing('customers', 'top_domain',     'TEXT');           // 상위도메인
  addColumnIfMissing('customers', 'sub_domain',     'TEXT');           // 하위도메인
  addColumnIfMissing('customers', 'biz_type',       'TEXT');           // 업태
  addColumnIfMissing('customers', 'biz_category',   'TEXT');           // 업종
  addColumnIfMissing('customers', 'ceo_name',       'TEXT');           // 대표자명
  addColumnIfMissing('customers', 'ceo_phone',      'TEXT');           // 대표전화
  addColumnIfMissing('customers', 'fax',            'TEXT');           // 팩스
  addColumnIfMissing('customers', 'detail_address', 'TEXT');           // 상세주소

  // solutions: 단가/판매 정보
  addColumnIfMissing('solutions', 'code',                     'TEXT'); // 솔루션코드
  addColumnIfMissing('solutions', 'base_consumer_price',      'INTEGER DEFAULT 0'); // 기본소비자가
  addColumnIfMissing('solutions', 'recommended_price',        'INTEGER DEFAULT 0'); // 권장소비자가
  addColumnIfMissing('solutions', 'max_discount',             'REAL DEFAULT 0');    // 최대할인율
  addColumnIfMissing('solutions', 'cogs',                     'INTEGER DEFAULT 0'); // 매출원가
  addColumnIfMissing('solutions', 'is_sellable',              "TEXT DEFAULT 'Y'");  // 판매여부
  addColumnIfMissing('solutions', 'is_internal',              "TEXT DEFAULT 'Y'");  // 자사솔루션
  addColumnIfMissing('solutions', 'sales_division_id',        'INTEGER');           // 매출귀속본부

  // project_types: 내부개발 여부
  addColumnIfMissing('project_types', 'is_internal', 'INTEGER DEFAULT 0');

  // users: 비밀번호 / 최근 로그인
  addColumnIfMissing('users', 'password_hash',  'TEXT');
  addColumnIfMissing('users', 'last_login_at',  'DATETIME');

  // projects: 즐겨찾기/도메인/연도별 참여금액
  addColumnIfMissing('projects', 'is_favorite', 'INTEGER DEFAULT 0');
  addColumnIfMissing('projects', 'top_domain',  'TEXT');
  addColumnIfMissing('projects', 'sub_domain',  'TEXT');
  for (const y of [2023,2024,2025,2026,2027,2028,2029,2030]) {
    addColumnIfMissing('projects', `y${y}`, 'INTEGER DEFAULT 0');
  }
}

init();

// 초기화 마커 (재시드 방지 / 운영 추적용). 데이터는 건드리지 않음.
(function recordMeta() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT);`);
    const inited = db.prepare("SELECT value FROM app_meta WHERE key='initialized_at'").get();
    if (!inited) {
      db.prepare("INSERT INTO app_meta (key,value) VALUES ('initialized_at', datetime('now'))").run();
      console.log('[DB] 최초 초기화 기록 생성');
    }
    db.prepare("INSERT OR REPLACE INTO app_meta (key,value) VALUES ('last_boot_at', datetime('now'))").run();
  } catch (e) { console.error('app_meta 기록 실패:', e.message); }
})();

// admin 계정 보장: 비어 있으면 생성, 비밀번호 없으면 설정. 기존 데이터/비밀번호는 절대 덮어쓰지 않음.
(function ensureAdmin() {
  try {
    const crypto = require('crypto');
    const makeHash = () => {
      const pwd = process.env.ADMIN_PASSWORD || 'Admin@2026';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
      return `${salt}:${hash}`;
    };
    let admin = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get('admin');
    if (!admin) {
      // 완전 빈 DB(시드 비활성 등) → 로그인 가능하도록 admin 신규 생성
      const r = db.prepare("INSERT INTO users (username, name, role, active, password_hash) VALUES ('admin','관리자','admin',1,?)").run(makeHash());
      console.log(`[Init] admin 계정 신규 생성 + 비밀번호 설정${process.env.ADMIN_PASSWORD ? ' (env)' : ' (default: Admin@2026)'}`);
    } else if (!admin.password_hash) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(makeHash(), admin.id);
      console.log(`[Init] admin 비밀번호 설정${process.env.ADMIN_PASSWORD ? ' (env)' : ' (default: Admin@2026)'}`);
    }
    // 비밀번호가 이미 있으면 아무 것도 하지 않음 (데이터 보존)
  } catch (e) { console.error('admin 계정 보장 실패:', e.message); }
})();

module.exports = db;
