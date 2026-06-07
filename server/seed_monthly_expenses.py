"""
본부별 월별 판관비/공통비 시드 데이터 생성.
- 이미지의 본부별 연 합계에 정확히 맞춰 12개월로 분배
- 약간의 월별 변동(±15%) 적용 후 마지막 월에서 잔액 조정으로 합계 일치 보장
- division_expenses의 연 합계도 자동 동기화
"""
import sqlite3, sys, os, random
sys.stdout.reconfigure(encoding='utf-8')
random.seed(20260525)

YEAR = 2026

# 이미지 기준 본부별 (판관비, 공통비) 연 합계
TOTALS = {
    '기술융합본부':         (5_528_233_000, 1_908_090_000),
    'AX사업본부':           (1_457_207_000,   480_904_000),
    '강원지사':             (  430_683_000,   154_196_000),
    '경영지원본부':         (            0,             0),
    '공통':                 (            0,             0),
    '글로벌&성장혁신본부':  (  465_083_000,   158_795_000),
    '뉴미디어사업본부':     (            0,             0),
    '미소헬스케어':         (4_524_942_000, 1_455_019_000),
    '인텔리전스사업본부':   (  594_673_000,   223_765_000),
    '호남지사':             (1_082_245_000,       394_129),
}

DB = os.path.join(os.path.dirname(__file__), '..', 'db', 'crm.db')
con = sqlite3.connect(DB)
cur = con.cursor()

# 테이블 보장 (db.js 마이그레이션이 이미 적용했어야 함)
cur.execute('''CREATE TABLE IF NOT EXISTS division_monthly_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  division_id INTEGER NOT NULL REFERENCES divisions(id),
  sga INTEGER DEFAULT 0,
  common_cost INTEGER DEFAULT 0,
  UNIQUE(year, month, division_id)
)''')

# 2026년 기존 월별 데이터 비우기
cur.execute('DELETE FROM division_monthly_expenses WHERE year=?', (YEAR,))

def split12(total):
    """합이 정확히 total이 되는 12개월 분배 (변동 ±15%)"""
    if not total:
        return [0] * 12
    weights = [random.uniform(0.85, 1.15) for _ in range(12)]
    s = sum(weights)
    parts = [int(total * w / s) for w in weights]
    parts[-1] = total - sum(parts[:-1])  # 잔액 보정
    return parts

print(f'[{YEAR}년 월별 판관비/공통비 시드]')
print('-' * 80)

for name, (sga_total, common_total) in TOTALS.items():
    row = cur.execute('SELECT id FROM divisions WHERE name=?', (name,)).fetchone()
    if not row:
        print(f'  ⚠ 본부 없음: {name}')
        continue
    div_id = row[0]

    sga_months    = split12(sga_total)
    common_months = split12(common_total)

    for m in range(1, 13):
        cur.execute('''INSERT INTO division_monthly_expenses
                       (year, month, division_id, sga, common_cost)
                       VALUES (?,?,?,?,?)''',
                    (YEAR, m, div_id, sga_months[m-1], common_months[m-1]))

    # division_expenses 연 합계도 동기화
    sga_sum = sum(sga_months)
    common_sum = sum(common_months)
    exist = cur.execute('SELECT id FROM division_expenses WHERE year=? AND division_id=?', (YEAR, div_id)).fetchone()
    if exist:
        cur.execute('UPDATE division_expenses SET sga=?, common_cost=? WHERE id=?',
                    (sga_sum, common_sum, exist[0]))
    else:
        cur.execute('INSERT INTO division_expenses (year, division_id, sga, common_cost) VALUES (?,?,?,?)',
                    (YEAR, div_id, sga_sum, common_sum))

    ok_sga = '✓' if sga_sum == sga_total else '✗'
    ok_com = '✓' if common_sum == common_total else '✗'
    print(f'  {name:22s}  판관비 {sga_sum:>15,}원 {ok_sga}  공통비 {common_sum:>13,}원 {ok_com}')

con.commit()

# 전사 합계 검증
total_sga = cur.execute('SELECT SUM(sga) FROM division_monthly_expenses WHERE year=?', (YEAR,)).fetchone()[0]
total_com = cur.execute('SELECT SUM(common_cost) FROM division_monthly_expenses WHERE year=?', (YEAR,)).fetchone()[0]
expected_sga = sum(s for s, _ in TOTALS.values())
expected_com = sum(c for _, c in TOTALS.values())
print('-' * 80)
print(f'  전사 합계 판관비 {total_sga:>15,}원  (기대값: {expected_sga:,}) {"✓" if total_sga == expected_sga else "✗"}')
print(f'  전사 합계 공통비 {total_com:>15,}원  (기대값: {expected_com:,}) {"✓" if total_com == expected_com else "✗"}')

con.close()
print('완료.')
