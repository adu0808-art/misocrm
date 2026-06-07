const db = require('./db');

function clearAll() {
  const tables = [
    'activities', 'project_purchases', 'project_sales', 'project_solutions',
    'projects', 'sales_targets', 'division_expenses',
    'solutions', 'project_types', 'customers', 'users', 'divisions'
  ];
  for (const t of tables) db.exec(`DELETE FROM ${t}; DELETE FROM sqlite_sequence WHERE name='${t}';`);
}

function seed() {
  const hasData = db.prepare('SELECT COUNT(*) AS c FROM divisions').get().c > 0;
  if (hasData) {
    console.log('이미 데이터가 있습니다. 시드를 건너뜁니다. (강제 재시드: SEED_FORCE=1)');
    if (process.env.SEED_FORCE !== '1') return;
    clearAll();
  }

  const insertDivision = db.prepare('INSERT INTO divisions (code,name,sort_order) VALUES (?,?,?)');
  const divs = [
    ['D01', '기술융합본부', 1],
    ['D02', '공공사업본부', 2],
    ['D03', '금융사업본부', 3],
    ['D04', '클라우드본부', 4]
  ];
  const divIds = divs.map(d => insertDivision.run(...d).lastInsertRowid);

  const insertUser = db.prepare('INSERT INTO users (username,name,division_id,role,email,phone) VALUES (?,?,?,?,?,?)');
  const users = [
    ['admin', '관리자', divIds[0], 'admin', 'admin@miso.co.kr', '02-0000-0000'],
    ['sjh', '손진호', divIds[0], 'pm', 'sjh@miso.co.kr', '010-1111-2222'],
    ['kdh', '김대현', divIds[1], 'sales', 'kdh@miso.co.kr', '010-1111-3333'],
    ['lyw', '이용우', divIds[1], 'pm', 'lyw@miso.co.kr', '010-1111-4444'],
    ['pms', '박민수', divIds[2], 'sales', 'pms@miso.co.kr', '010-1111-5555'],
    ['cjy', '최지연', divIds[3], 'pm', 'cjy@miso.co.kr', '010-1111-6666']
  ];
  const userIds = users.map(u => insertUser.run(...u).lastInsertRowid);

  const insertCust = db.prepare('INSERT INTO customers (name,contact_person,phone,email,industry,notes) VALUES (?,?,?,?,?,?)');
  const custs = [
    ['국방부', '서욱', '02-748-1000', 'mnd@korea.kr', '공공', '국방 데이터 카탈로그 사업'],
    ['삼성SDS', '이상호', '02-6155-0114', 'contact@sds.com', '대기업', '협력 파트너'],
    ['KT', '정국일', '02-3495-1000', 'biz@kt.com', '대기업', ''],
    ['신한은행', '김지훈', '02-756-0505', 'biz@shinhan.com', '금융', '디지털 전환 추진'],
    ['행정안전부', '박정수', '02-2100-3399', 'mois@korea.kr', '공공', ''],
    ['LG CNS', '한승우', '02-6363-3636', 'biz@lgcns.com', '대기업', '']
  ];
  const custIds = custs.map(c => insertCust.run(...c).lastInsertRowid);

  const insertType = db.prepare('INSERT INTO project_types (code,name,sort_order) VALUES (?,?,?)');
  const types = [
    ['P', '일반 프로젝트', 1],
    ['M', '유지보수', 2],
    ['L', '라이선스 판매', 3],
    ['C', '컨설팅', 4],
    ['R', '연구개발', 5]
  ];
  const typeIds = types.map(t => insertType.run(...t).lastInsertRowid);

  const insertSol = db.prepare('INSERT INTO solutions (name,vendor,spec,standard_price,internal_cost,notes) VALUES (?,?,?,?,?,?)');
  const sols = [
    ['DataCatalog Pro', 'MISO', '엔터프라이즈 라이선스', 200000000, 80000000, '데이터 카탈로그 솔루션'],
    ['AI-Insight', 'MISO', 'Standard Pack', 80000000, 30000000, 'AI 분석 플랫폼'],
    ['CloudOps Manager', 'Partner-A', '연 구독', 50000000, 20000000, '클라우드 운영 관리'],
    ['SecureGate', 'Partner-B', 'Perpetual License', 120000000, 60000000, '보안 게이트웨이']
  ];
  const solIds = sols.map(s => insertSol.run(...s).lastInsertRowid);

  const insertProj = db.prepare(`INSERT INTO projects (
    project_code,project_name,project_type_id,status,division_id,manager_id,pm_id,sales_rep_id,
    proposal_deadline,customer_id,customer_contact,prime_contractor,business_year,start_date,end_date,
    total_budget,participation_type,total_purchase,tech_support_date,
    participation_rate,participation_amount,win_probability,expected_revenue,actual_revenue,
    has_solution,sw_registered,competitor,intro_channel,overview
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const projects = [
    {
      code: 'P26102', name: '지능형 플랫폼 구축', type: typeIds[0], status: '제안단계',
      div: divIds[0], mgr: userIds[1], pm: userIds[1], sales: userIds[1],
      pdeadline: '2027-03-31', cust: custIds[0], ccontact: '서욱', prime: '',
      year: 2026, start: '2027-07-01', end: '2028-06-30',
      budget: 35000000000, ptype: '참여', purchase: 0, tech: '2026-03-24',
      prate: 8, pamt: 2800000000, win: 10, exp: 280000000, act: 0,
      hsol: 'Y', sw: 'N', comp: 'SDS KT LG SKT', intro: '제안요청',
      overview: '2개년에 걸쳐 데이터 카탈로그 시스템 구축 예정\n솔루션 검토 단계\n사업 예산은 350억 중 26년 파일럿(30억 ?) 27년 본사업\n\nSDS KT LG SKT 경쟁'
    },
    {
      code: 'P26088', name: '디지털 뱅킹 플랫폼 고도화', type: typeIds[0], status: '수주완료',
      div: divIds[2], mgr: userIds[4], pm: userIds[4], sales: userIds[4],
      pdeadline: '2026-02-15', cust: custIds[3], ccontact: '김지훈', prime: '',
      year: 2026, start: '2026-04-01', end: '2026-12-31',
      budget: 1800000000, ptype: '주관', purchase: 600000000, tech: '2026-02-20',
      prate: 100, pamt: 1800000000, win: 100, exp: 1800000000, act: 900000000,
      hsol: 'Y', sw: 'Y', comp: 'LG CNS', intro: '기존 고객',
      overview: '신한은행 디지털 뱅킹 플랫폼 고도화 사업\n주관사로 수주 완료'
    },
    {
      code: 'P26045', name: 'AI 데이터 분석 PoC', type: typeIds[3], status: '영업단계',
      div: divIds[0], mgr: userIds[1], pm: userIds[1], sales: userIds[1],
      pdeadline: '2026-06-30', cust: custIds[1], ccontact: '이상호', prime: '',
      year: 2026, start: '2026-08-01', end: '2026-11-30',
      budget: 300000000, ptype: '참여', purchase: 0, tech: null,
      prate: 30, pamt: 90000000, win: 50, exp: 45000000, act: 0,
      hsol: 'N', sw: 'N', comp: '내부 자체', intro: '파트너 소개',
      overview: '삼성SDS와 협력하여 AI 분석 PoC 수행'
    },
    {
      code: 'P26033', name: '공공 클라우드 전환 컨설팅', type: typeIds[3], status: '수행종료',
      div: divIds[3], mgr: userIds[5], pm: userIds[5], sales: userIds[2],
      pdeadline: '2026-01-10', cust: custIds[4], ccontact: '박정수', prime: '',
      year: 2026, start: '2026-02-01', end: '2026-05-31',
      budget: 450000000, ptype: '주관', purchase: 150000000, tech: '2026-01-15',
      prate: 100, pamt: 450000000, win: 100, exp: 450000000, act: 450000000,
      hsol: 'Y', sw: 'Y', comp: '', intro: '제안요청',
      overview: '행안부 산하기관 클라우드 전환 컨설팅 - 완료'
    },
    {
      code: 'P26021', name: '데이터 거버넌스 컨설팅', type: typeIds[3], status: '기획단계',
      div: divIds[1], mgr: userIds[2], pm: userIds[3], sales: userIds[2],
      pdeadline: '2026-07-15', cust: custIds[5], ccontact: '한승우', prime: '',
      year: 2026, start: '2026-09-01', end: '2026-12-31',
      budget: 220000000, ptype: '참여', purchase: 0, tech: null,
      prate: 50, pamt: 110000000, win: 20, exp: 22000000, act: 0,
      hsol: 'N', sw: 'N', comp: '', intro: '신규 발굴',
      overview: 'LG CNS 협력 데이터 거버넌스 컨설팅 검토 중'
    },
    {
      code: 'P25099', name: '국방 사이버보안 시스템', type: typeIds[0], status: '수주실패',
      div: divIds[1], mgr: userIds[2], pm: userIds[3], sales: userIds[2],
      pdeadline: '2025-12-20', cust: custIds[0], ccontact: '서욱', prime: '대기업A',
      year: 2025, start: '2026-03-01', end: '2026-12-31',
      budget: 5000000000, ptype: '참여', purchase: 0, tech: '2025-12-15',
      prate: 5, pamt: 250000000, win: 0, exp: 0, act: 0,
      hsol: 'Y', sw: 'N', comp: 'SDS', intro: '제안요청',
      overview: 'SDS 컨소시엄에 패배'
    },
    {
      code: 'P26077', name: 'KT 신사업 협력 검토', type: typeIds[4], status: '사업보류',
      div: divIds[0], mgr: userIds[1], pm: userIds[1], sales: userIds[1],
      pdeadline: null, cust: custIds[2], ccontact: '정국일', prime: '',
      year: 2026, start: null, end: null,
      budget: 0, ptype: '참여', purchase: 0, tech: null,
      prate: 0, pamt: 0, win: 0, exp: 0, act: 0,
      hsol: 'N', sw: 'N', comp: '', intro: '미팅',
      overview: 'KT 신사업 협력 가능성 미팅 진행. 사업화 시점 미정.'
    }
  ];

  const projIds = projects.map(p => insertProj.run(
    p.code, p.name, p.type, p.status, p.div, p.mgr, p.pm, p.sales,
    p.pdeadline, p.cust, p.ccontact, p.prime, p.year, p.start, p.end,
    p.budget, p.ptype, p.purchase, p.tech,
    p.prate, p.pamt, p.win, p.exp, p.act,
    p.hsol, p.sw, p.comp, p.intro, p.overview
  ).lastInsertRowid);

  // 솔루션 납품 (수주완료/수행종료 프로젝트)
  const insertPSol = db.prepare(`INSERT INTO project_solutions
    (project_id,solution_id,spec,standard_price,quantity,internal_cost,discount_rate,delivery_amount,install_date,contract_issued,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  insertPSol.run(projIds[1], solIds[0], 'Enterprise', 200000000, 1, 80000000, 10, 180000000, '2026-04-15', 'Y', '');
  insertPSol.run(projIds[1], solIds[1], 'Standard', 80000000, 2, 30000000, 5, 152000000, '2026-04-15', 'Y', '');
  insertPSol.run(projIds[3], solIds[2], '연 구독 1년', 50000000, 1, 20000000, 0, 50000000, '2026-02-15', 'Y', '');

  // 매출
  const insertSale = db.prepare(`INSERT INTO project_sales
    (project_id,invoice_date,invoice_issued,sales_amount,vat,total_amount,unpaid_balance,collection_type,cash_or_note,payment_due_date,paid,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertSale.run(projIds[1], '2026-04-30', 'Y', 900000000, 90000000, 990000000, 0, '계좌이체', '현금', '2026-05-31', 'Y', '1차 기성');
  insertSale.run(projIds[1], '2026-08-30', 'N', 900000000, 90000000, 990000000, 990000000, '계좌이체', '현금', '2026-09-30', 'N', '2차 기성 예정');
  insertSale.run(projIds[3], '2026-05-31', 'Y', 450000000, 45000000, 495000000, 0, '계좌이체', '현금', '2026-06-30', 'Y', '완료 정산');

  // 매입
  const insertPurc = db.prepare(`INSERT INTO project_purchases
    (project_id,purchase_code,payment_due_date,purchase_amount,vat,total_amount,vendor,description,invoice_number,invoice_issued,invoice_date,paid)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertPurc.run(projIds[1], '솔루션', '2026-05-31', 300000000, 30000000, 330000000, 'MISO 본사', '솔루션 내부원가', 'INV-2026-001', 'Y', '2026-04-30', 'Y');
  insertPurc.run(projIds[1], '외주인건', '2026-09-30', 300000000, 30000000, 330000000, '협력업체A', '개발 외주', '', 'N', null, 'N');
  insertPurc.run(projIds[3], '솔루션', '2026-06-30', 150000000, 15000000, 165000000, 'Partner-A', 'CloudOps 라이선스', 'PA-26-12', 'Y', '2026-05-31', 'Y');

  // 활동
  const insertAct = db.prepare(`INSERT INTO activities
    (project_id,activity_date,category,post_win_rate,title,content,created_by)
    VALUES (?,?,?,?,?,?,?)`);
  insertAct.run(projIds[0], '2026-04-27', '영업방문', 10, 'SDS 미팅', '이용우 프로 미팅\n국방 전담 영업\n라인업이 있지만 함께 할 수 있는 영역이 있음', userIds[1]);
  insertAct.run(projIds[0], '2026-04-23', '영업방문', 10, 'KT 미팅', '정국일 상무 미팅\n다수 인원이 참석하셔서 초기 미팅부터 관심을 보임', userIds[1]);
  insertAct.run(projIds[0], '2026-04-10', '전화상담', 10, '국방부 담당자 통화', '제안요청 일정 확인. 6월 중순 발주 예정.', userIds[1]);
  insertAct.run(projIds[1], '2026-03-15', '영업방문', 100, '신한은행 킥오프', '디지털 뱅킹 플랫폼 고도화 킥오프 미팅 완료', userIds[4]);
  insertAct.run(projIds[2], '2026-05-10', '영업방문', 50, '삼성SDS PoC 협의', 'AI 분석 PoC 범위 협의', userIds[1]);

  // 영업목표 (2026)
  const insertTarget = db.prepare('INSERT INTO sales_targets (year,division_id,target_revenue,target_profit,memo) VALUES (?,?,?,?,?)');
  insertTarget.run(2026, divIds[0], 5000000000, 1000000000, '기술융합본부 2026 목표');
  insertTarget.run(2026, divIds[1], 3000000000, 600000000, '공공사업본부 2026 목표');
  insertTarget.run(2026, divIds[2], 4000000000, 800000000, '금융사업본부 2026 목표');
  insertTarget.run(2026, divIds[3], 2500000000, 500000000, '클라우드본부 2026 목표');

  // 판관비/공통비 (2026)
  const insertExp = db.prepare('INSERT INTO division_expenses (year,division_id,sga,common_cost,memo) VALUES (?,?,?,?,?)');
  insertExp.run(2026, divIds[0], 350000000, 200000000, '');
  insertExp.run(2026, divIds[1], 250000000, 150000000, '');
  insertExp.run(2026, divIds[2], 300000000, 180000000, '');
  insertExp.run(2026, divIds[3], 200000000, 120000000, '');

  console.log('시드 완료: 본부 %d, 사용자 %d, 고객 %d, 프로젝트유형 %d, 솔루션 %d, 프로젝트 %d',
    divIds.length, userIds.length, custIds.length, typeIds.length, solIds.length, projIds.length);
}

seed();
