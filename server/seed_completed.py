"""
수주완료 프로젝트에 매출/매입/투입내역/활동이력 더미 데이터 생성.
- 매출: 1~3건의 기성금. invoice_date는 프로젝트 사업기간 내, 누적 미청구 자동 계산
- 매입: 매출보다 약간 작은 금액으로 1~2건
- 투입내역: 1~3명의 인력 (PM/개발자/분석가 등)
- 활동이력: 영업방문/전화상담/이슈등록 등 2~5건
"""
import sqlite3, os, sys, random
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding='utf-8')
random.seed(20260525)

DB = os.path.join(os.path.dirname(__file__), '..', 'db', 'crm.db')
con = sqlite3.connect(DB)
con.execute('PRAGMA foreign_keys = ON;')
cur = con.cursor()

# 기존 더미 데이터 청소 (전체 트랜잭션 비우고 다시 채움)
for t in ['activities','project_purchases','project_sales','project_resources']:
    cur.execute(f'DELETE FROM {t}')
    cur.execute(f"DELETE FROM sqlite_sequence WHERE name='{t}'")
con.commit()
print('[Clean] 기존 트랜잭션 비움')

# 수주완료 프로젝트
projects = cur.execute("""
    SELECT id, project_code, project_name, division_id, manager_id, pm_id, sales_rep_id,
           business_year, start_date, end_date,
           actual_revenue, total_purchase, expected_revenue, participation_amount,
           y2023, y2024, y2025, y2026, y2027, y2028
    FROM projects
    WHERE status='수주완료'
    ORDER BY id
""").fetchall()
print(f'대상 수주완료 프로젝트: {len(projects)}건')

# 사용자 ID 풀
user_ids = [r[0] for r in cur.execute("SELECT id FROM users").fetchall()]

NAMES = ['김지훈','이서연','박민재','최예린','정태현','윤시아','강재호','한지원','조유찬','임도윤',
         '서가은','권하준','오수아','신우진','홍지유','문성호','배시우','전아린','노건우','구다은']
AFFILS = ['미소정보기술','파트너A','파트너B','외주사C']
POSITIONS = ['수석','책임','선임','전임','매니저']
RES_CATS = ['PM','PL','컨설턴트','분석가','개발자']
ACTIVITY_TEMPLATES = [
    ('영업방문', '고객사 미팅', '담당자 미팅\n- 사업 범위 협의\n- 일정 협의\n- 우호적 분위기'),
    ('영업방문', '킥오프 미팅', '프로젝트 킥오프 미팅 완료\n- 참석자: 양사 PM/실무자\n- 다음 주 상세 일정 공유'),
    ('전화상담', '담당자 통화', '담당자와 진행상황 통화\n- 일정 확인\n- 추가 요구사항 청취'),
    ('이슈등록', '리스크 보고', '기술 리스크 식별\n- 기존 환경과의 호환성 확인 필요\n- 추가 검토 후 회신 예정'),
    ('영업방문', '중간 점검 미팅', '중간 점검 미팅\n- 진행률 양호\n- 산출물 검토 일정 조정'),
    ('영업방문', '계약 협의', '계약 조건 협의\n- 단가 확정\n- 결제 조건 합의'),
    ('전화상담', '일정 조율', '일정 조율 통화\n- 다음 단계 일정 확정'),
    ('영업방문', '제안서 설명', '제안서 발표 및 Q&A 진행'),
    ('리스트등록', '확약서 요청', '확약서 요청 접수, 처리 진행'),
    ('영업방문', '완료 보고', '사업 완료 보고\n- 결과물 인계\n- 정산 일정 공유'),
]

sale_count = purc_count = res_count = act_count = 0

for p in projects:
    (pid, code, name, div_id, mgr, pm, sales_rep, year,
     sd, ed, actual_rev, total_purc, exp_rev, part_amt,
     y23, y24, y25, y26, y27, y28) = p

    total_rev = actual_rev or exp_rev or part_amt or 0
    total_pur = total_purc or int(total_rev * random.uniform(0.45, 0.7))
    if total_rev <= 0:
        continue

    # 사업기간 보정
    try:
        d_start = datetime.strptime(sd, '%Y-%m-%d') if sd else datetime(year or 2026, 1, 1)
    except Exception:
        d_start = datetime(year or 2026, 1, 1)
    try:
        d_end = datetime.strptime(ed, '%Y-%m-%d') if ed else d_start + timedelta(days=180)
    except Exception:
        d_end = d_start + timedelta(days=180)
    if d_end <= d_start:
        d_end = d_start + timedelta(days=180)
    duration_days = max(30, (d_end - d_start).days)

    # ---------- 매출 1~3건 ----------
    # 연도별 분포가 있으면 그 비율로, 없으면 균등 분배
    year_map = {2023:y23,2024:y24,2025:y25,2026:y26,2027:y27,2028:y28}
    weighted_years = [(y,v) for y,v in year_map.items() if v]
    if weighted_years:
        sale_buckets = weighted_years
    else:
        # business_year 한 곳에 몰아넣기
        sale_buckets = [(year or 2026, total_rev)]

    # 미청구 누적 차감 계산
    cum_sale = 0
    for (sy, samt) in sale_buckets:
        if samt <= 0: continue
        # 해당 연도 내에서 1~2건으로 쪼개기
        splits = random.randint(1, 2)
        per = samt // splits
        for i in range(splits):
            amt = per if i < splits-1 else (samt - per*(splits-1))
            if amt <= 0: continue
            # 발행일자: 해당 연도 내 (사업기간과 겹치는 범위 안에서)
            yr_start = datetime(sy, 1, 1)
            yr_end = datetime(sy, 12, 31)
            lo = max(d_start, yr_start)
            hi = min(d_end, yr_end)
            if hi <= lo:
                inv_date = lo
            else:
                rng = (hi - lo).days
                inv_date = lo + timedelta(days=random.randint(0, max(0, rng)))
            due_date = inv_date + timedelta(days=random.choice([15, 30, 45]))
            cum_sale += amt
            unpaid = max(0, total_rev - cum_sale)
            # 입금여부: 발행일이 오늘 기준 30일 이전이면 Y, 아니면 N
            today = datetime.today()
            paid = 'Y' if (today - inv_date).days > 30 and random.random() > 0.2 else 'N'
            cur.execute("""
                INSERT INTO project_sales
                (project_id, invoice_date, invoice_issued, sales_amount, vat, total_amount,
                 unpaid_balance, collection_type, cash_or_note, payment_due_date, paid)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """, (pid, inv_date.strftime('%Y-%m-%d'), 'Y', amt, 0, amt,
                  unpaid, '기성금', '현금', due_date.strftime('%Y-%m-%d'), paid))
            sale_count += 1

    # ---------- 매입 1~2건 ----------
    if total_pur > 0:
        # 매입은 보통 매출보다 약간 일찍 발생
        p_splits = random.randint(1, 2)
        p_per = total_pur // p_splits
        vendors = ['(주)미소솔루션','퍼스트IT파트너스','테크커넥트','오케이파트너','글로벌소프트']
        descs = {'솔루션':'솔루션 라이선스 매입','외주인건':'외주 개발 인력 비용',
                 '인건비':'프로젝트 인건비','HW':'서버/장비 구입','SW':'SW 라이선스',
                 '경비':'출장/소모품 경비','기타':'기타 부대비용'}
        for i in range(p_splits):
            amt = p_per if i < p_splits-1 else (total_pur - p_per*(p_splits-1))
            if amt <= 0: continue
            # 매입 발행일: 사업기간 내, 매출보다 약간 빠르게
            rng = (d_end - d_start).days
            offs = int(rng * (0.2 + i * 0.4))
            inv_date = d_start + timedelta(days=min(rng, max(0, offs)))
            due_date = inv_date + timedelta(days=30)
            today = datetime.today()
            paid = 'Y' if (today - inv_date).days > 45 and random.random() > 0.15 else 'N'
            code_choice = random.choice(['외주인건','인건비','솔루션','SW','경비'])
            vendor = random.choice(vendors)
            desc = descs.get(code_choice, '매입')
            cur.execute("""
                INSERT INTO project_purchases
                (project_id, purchase_code, payment_due_date, purchase_amount, vat, total_amount,
                 vendor, description, invoice_number, invoice_issued, invoice_date, paid)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """, (pid, code_choice, due_date.strftime('%Y-%m-%d'), amt, 0, amt,
                  vendor, desc, None, 'Y', inv_date.strftime('%Y-%m-%d'), paid))
            purc_count += 1

    # ---------- 투입내역 1~3명 ----------
    n_res = random.randint(1, 3)
    picked_names = random.sample(NAMES, n_res)
    for i in range(n_res):
        cat = 'PM' if i == 0 else random.choice(RES_CATS[1:])
        nm = picked_names[i]
        aff = AFFILS[0] if cat in ('PM','PL','컨설턴트','분석가') else random.choice(AFFILS)
        pos = random.choice(POSITIONS)
        days = (d_end - d_start).days + 1
        rate = random.choice([50, 70, 80, 100])
        mm = (days / 20.0) * (rate / 100.0)
        std_price = random.choice([6_500_000, 7_500_000, 8_500_000, 9_500_000, 11_000_000])
        internal_cost = int(std_price * random.uniform(0.6, 0.85))
        discount = random.choice([0, 5, 10])
        internal_total = int(internal_cost * mm * (1 - discount/100))
        cur.execute("""
            INSERT INTO project_resources
            (project_id, category, affiliation, name, position, start_date, end_date,
             participation_rate, effort_mm, total_days, standard_price, internal_cost,
             discount_rate, internal_total)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (pid, cat, aff, nm, pos, d_start.strftime('%Y-%m-%d'), d_end.strftime('%Y-%m-%d'),
              rate, round(mm, 2), days, std_price, internal_cost, discount, internal_total))
        res_count += 1

    # ---------- 활동이력 2~5건 ----------
    n_act = random.randint(2, 5)
    win_rates = [10, 30, 50, 70, 100]
    # 활동일자: 시작일자 ~ 종료일자 사이 또는 시작일자 이전 ~ 시작일자 + 30일
    act_start = d_start - timedelta(days=60)
    act_end = min(datetime.today(), d_end)
    if act_end <= act_start:
        act_end = act_start + timedelta(days=30)
    chosen = random.sample(ACTIVITY_TEMPLATES, min(n_act, len(ACTIVITY_TEMPLATES)))
    creator = sales_rep or pm or mgr or (user_ids[0] if user_ids else None)
    for i, (cat, title, content) in enumerate(chosen):
        rng = (act_end - act_start).days
        adate = act_start + timedelta(days=random.randint(0, max(0, rng)))
        wr = win_rates[min(len(win_rates)-1, i + max(0, 5 - n_act))]
        cur.execute("""
            INSERT INTO activities
            (project_id, activity_date, category, post_win_rate, title, content, created_by)
            VALUES (?,?,?,?,?,?,?)
        """, (pid, adate.strftime('%Y-%m-%d'), cat, wr, title, content, creator))
        act_count += 1

con.commit()
print(f'[Sales]     {sale_count}건')
print(f'[Purchases] {purc_count}건')
print(f'[Resources] {res_count}건')
print(f'[Activities]{act_count}건')

# 검증: 2026 invoice_date 기준 매출/매입 합계
r = cur.execute("""
  SELECT COALESCE(SUM(ps.sales_amount),0) FROM project_sales ps
  JOIN projects p ON ps.project_id=p.id
  WHERE strftime('%Y', ps.invoice_date)='2026' AND p.status='수주완료'
""").fetchone()
print(f'\n[검증] 2026 invoice_date 기준 매출 (수주완료): {r[0]:,}원')
r = cur.execute("""
  SELECT COALESCE(SUM(pp.purchase_amount),0) FROM project_purchases pp
  JOIN projects p ON pp.project_id=p.id
  WHERE strftime('%Y', pp.invoice_date)='2026' AND p.status='수주완료'
""").fetchone()
print(f'[검증] 2026 invoice_date 기준 매입 (수주완료): {r[0]:,}원')
con.close()
print('완료.')
