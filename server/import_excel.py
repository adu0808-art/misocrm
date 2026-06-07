"""
Excel(영업현황내역) → SQLite CRM DB 적재 스크립트 (확장 스키마 대응).
사용: python server/import_excel.py <excel_path>
"""
import sys, os, sqlite3, re
import pandas as pd
from datetime import datetime

EXCEL = sys.argv[1] if len(sys.argv) > 1 else r'C:/Users/miso-ceo/Downloads/영업현황내역_20260524223202.xlsx'
DB    = os.path.join(os.path.dirname(__file__), '..', 'db', 'crm.db')

STATUS_MAP = {
    '기획단계': '기획단계',
    '영업단계': '영업단계',
    '제안단계': '제안단계',
    '수주완료': '수주완료',
    '수행종료': '수행종료',
    '수주실패': '수주실패',
    '사업/제안보류': '사업보류',
    '사업보류': '사업보류',
}
LEGAL_MAP = { '공공':'공공', '민간':'법인', '법인':'법인', '개인':'개인' }

def to_int(v):
    if v is None or (isinstance(v, float) and pd.isna(v)): return 0
    if isinstance(v, str):
        v = v.strip()
        if v in ('', '확정전', '미정', '-'): return 0
        v = re.sub(r'[^\d.\-]', '', v)
        if v in ('', '-', '.'): return 0
        try: return int(float(v))
        except: return 0
    try: return int(v)
    except: return 0

def to_float(v):
    if v is None or (isinstance(v, float) and pd.isna(v)): return 0.0
    if isinstance(v, str):
        v = v.strip()
        if v in ('', '확정전', '미정', '-'): return 0.0
        v = re.sub(r'[^\d.\-]', '', v)
        if v in ('', '-', '.'): return 0.0
        try: return float(v)
        except: return 0.0
    try: return float(v)
    except: return 0.0

def to_date(v):
    if v is None: return None
    if isinstance(v, float) and pd.isna(v): return None
    if isinstance(v, str):
        v = v.strip()
        if not v: return None
        return v[:10]
    try: return v.strftime('%Y-%m-%d')
    except: return None

def to_str(v):
    if v is None: return ''
    if isinstance(v, float) and pd.isna(v): return ''
    return str(v).strip()

def main():
    df = pd.read_excel(EXCEL)
    print(f'[Excel] {len(df)}건 로드')

    con = sqlite3.connect(DB)
    con.execute('PRAGMA foreign_keys = ON;')
    cur = con.cursor()

    # ---- 1) 기존 프로젝트 트랜잭션 데이터 삭제 ----
    for t in ['activities','project_purchases','project_sales','project_solutions','projects']:
        cur.execute(f'DELETE FROM {t}')
        cur.execute(f"DELETE FROM sqlite_sequence WHERE name='{t}'")
    con.commit()
    print('[Clean] 기존 프로젝트 데이터 삭제')

    # ---- 2) 사업본부 upsert ----
    divs = sorted([d for d in df['사업주관본부'].dropna().unique() if str(d).strip()])
    div_id_map = {}
    for i, name in enumerate(divs, start=1):
        cur.execute('SELECT id FROM divisions WHERE name=?', (name,))
        r = cur.fetchone()
        if r: div_id_map[name] = r[0]
        else:
            code = f'D{i:02d}'; n = i
            while True:
                cur.execute('SELECT id FROM divisions WHERE code=?', (code,))
                if not cur.fetchone(): break
                n += 1; code = f'D{n:02d}'
            cur.execute('INSERT INTO divisions (code,name,sort_order) VALUES (?,?,?)', (code, name, i))
            div_id_map[name] = cur.lastrowid
    print(f'[Div] {len(div_id_map)}개')

    # ---- 3) 프로젝트 유형 ----
    types = sorted([t for t in df['프로젝트유형'].dropna().unique() if str(t).strip()])
    type_id_map = {}
    code_seq = {'License Renewal':'L','유지보수(인력)':'M','일반 프로젝트':'P','정부 지원 과제':'G','내부개발':'I'}
    for t in types:
        cur.execute('SELECT id FROM project_types WHERE name=?', (t,))
        r = cur.fetchone()
        if r: type_id_map[t] = r[0]
        else:
            code = code_seq.get(t, t[:2].upper()); base = code; n = 1
            while True:
                cur.execute('SELECT id FROM project_types WHERE code=?', (code,))
                if not cur.fetchone(): break
                n += 1; code = f'{base}{n}'
            is_internal = 1 if t == '내부개발' else 0
            cur.execute('INSERT INTO project_types (code,name,sort_order,is_internal) VALUES (?,?,?,?)', (code, t, 0, is_internal))
            type_id_map[t] = cur.lastrowid
    print(f'[Type] {len(type_id_map)}개')

    # ---- 4) 사용자 ----
    names = set()
    for c in ['영업직원번호','사업주관자번호','PM번호']:
        names.update(n for n in df[c].dropna().unique() if str(n).strip())
    user_id_map = {}
    for name in names:
        cur.execute('SELECT id FROM users WHERE name=?', (name,))
        r = cur.fetchone()
        if r: user_id_map[name] = r[0]
        else:
            uname_base = re.sub(r'[^a-zA-Z0-9가-힣]', '_', name).lower()[:20] or 'user'
            uname = uname_base; n = 0
            while True:
                cur.execute('SELECT id FROM users WHERE username=?', (uname,))
                if not cur.fetchone(): break
                n += 1; uname = f'{uname_base}{n}'
            cur.execute('INSERT INTO users (username,name,role,active) VALUES (?,?,?,?)', (uname, name, 'user', 1))
            user_id_map[name] = cur.lastrowid
    print(f'[User] {len(user_id_map)}명')

    # ---- 5) 고객사 (확장 필드 upsert) ----
    cust_id_map = {}
    for _, row in df.iterrows():
        name = to_str(row.get('고객사명'))
        if not name or name in cust_id_map: continue
        industry = to_str(row.get('기관유형'))
        legal_type = LEGAL_MAP.get(industry, '법인' if industry else '')
        top_d = to_str(row.get('상위도메인'))
        sub_d = to_str(row.get('하위도메인'))
        cur.execute('SELECT id FROM customers WHERE name=?', (name,))
        r = cur.fetchone()
        if r:
            cust_id_map[name] = r[0]
            # 보강 update (NULL인 항목만)
            cur.execute('''UPDATE customers SET
                industry = COALESCE(NULLIF(industry,''), ?),
                legal_type = COALESCE(NULLIF(legal_type,''), ?),
                top_domain = COALESCE(NULLIF(top_domain,''), ?),
                sub_domain = COALESCE(NULLIF(sub_domain,''), ?)
                WHERE id=?''', (industry, legal_type, top_d, sub_d, r[0]))
        else:
            cur.execute('''INSERT INTO customers (name, industry, legal_type, top_domain, sub_domain)
                           VALUES (?,?,?,?,?)''', (name, industry, legal_type, top_d, sub_d))
            cust_id_map[name] = cur.lastrowid
    print(f'[Cust] {len(cust_id_map)}개')

    # ---- 6) 프로젝트 적재 ----
    insert_cols = [
        'project_code','project_name','project_type_id','status',
        'division_id','manager_id','pm_id','sales_rep_id','proposal_deadline',
        'customer_id','customer_contact','prime_contractor',
        'business_year','start_date','end_date',
        'total_budget','participation_type','total_purchase','tech_support_date',
        'participation_rate','participation_amount','win_probability',
        'expected_revenue','actual_revenue',
        'has_solution','sw_registered','competitor','intro_channel','overview',
        'top_domain','sub_domain',
        'y2023','y2024','y2025','y2026','y2027','y2028','y2029','y2030'
    ]
    placeholders = ','.join(['?'] * len(insert_cols))
    insert_sql = f"INSERT INTO projects ({','.join(insert_cols)}) VALUES ({placeholders})"

    inserted = 0; skipped = 0
    for _, row in df.iterrows():
        code = to_str(row.get('프로젝트코드'))
        name = to_str(row.get('예상프로젝트명'))
        if not code or not name: skipped += 1; continue

        # overview 보강 (도메인/연도별은 컬럼으로 빠지므로 제외)
        overview_parts = []
        ov = to_str(row.get('사업/과제개요'))
        if ov: overview_parts.append(ov)
        extras = []
        for label, col in [
            ('총필요인원', '총필요예상인원'),
            ('당사참여인원', '당사참여예상인원'),
            ('외주참여인원', '외주참여예상인원'),
            ('적정투입가능공수', '적정투입가능공수'),
            ('예상평균계약단가', '예상평균계약단가'),
            ('솔루션납품예상합계', '솔루션납품예상합계금액'),
            ('솔루션용역배분', '솔루션용역배분금액'),
            ('미제출사유', '제안요청서미제출이유'),
        ]:
            v = row.get(col)
            if v is not None and not (isinstance(v, float) and pd.isna(v)) and str(v).strip():
                extras.append(f'· {label}: {v}')
        if extras:
            overview_parts.append('\n\n[추가정보]\n' + '\n'.join(extras))
        overview = '\n'.join(overview_parts)

        status_raw = to_str(row.get('진행상태코드'))
        status = STATUS_MAP.get(status_raw, status_raw or '기획단계')
        ptype = to_str(row.get('참여형태구분코드')) or '참여'

        # 코드 중복 회피
        base_code = code; n = 0
        while True:
            cur.execute('SELECT id FROM projects WHERE project_code=?', (code,))
            if not cur.fetchone(): break
            n += 1; code = f'{base_code}-{n}'

        values = [
            code, name,
            type_id_map.get(to_str(row.get('프로젝트유형'))),
            status,
            div_id_map.get(to_str(row.get('사업주관본부'))),
            user_id_map.get(to_str(row.get('사업주관자번호'))),
            user_id_map.get(to_str(row.get('PM번호'))),
            user_id_map.get(to_str(row.get('영업직원번호'))),
            to_date(row.get('사업제안마감일자')),
            cust_id_map.get(to_str(row.get('고객사명'))),
            None,
            to_str(row.get('원도급사명')) or None,
            to_int(row.get('사업년도')) or None,
            to_date(row.get('예상사업수행시작일자')),
            to_date(row.get('예상사업수행종료일자')),
            to_int(row.get('총사업예산금액')),
            ptype,
            to_int(row.get('예상총매입금액')),
            None,
            to_float(row.get('참여비율')),
            to_int(row.get('참여사업지분금액')),
            to_float(row.get('수주확률')),
            to_int(row.get('예상매출금액')),
            to_int(row.get('실매출금액')),
            to_str(row.get('당사솔루션납품여부')) or 'N',
            to_str(row.get('소프트웨어실적등록여부')) or 'N',
            to_str(row.get('예상경쟁사명')) or None,
            None,
            overview,
            to_str(row.get('상위도메인')) or None,
            to_str(row.get('하위도메인')) or None,
            to_int(row.get('2023년 참여금액')),
            to_int(row.get('2024년 참여금액')),
            to_int(row.get('2025년 참여금액')),
            to_int(row.get('2026년 참여금액')),
            to_int(row.get('2027년 참여금액')),
            to_int(row.get('2028년 참여금액')),
            to_int(row.get('2029년 참여금액')),
            to_int(row.get('2030년 참여금액')),
        ]
        cur.execute(insert_sql, values)
        inserted += 1

    con.commit()
    print(f'[Project] {inserted}건 적재, {skipped}건 스킵')

    # ---- 7) 목표/판관비 초기화 (없는 본부/연도만) ----
    cur.execute('SELECT DISTINCT business_year FROM projects WHERE business_year IS NOT NULL ORDER BY business_year')
    years = [r[0] for r in cur.fetchall()]
    for y in years:
        for div_id in div_id_map.values():
            cur.execute('SELECT id FROM sales_targets WHERE year=? AND division_id=?', (y, div_id))
            if not cur.fetchone():
                cur.execute('INSERT INTO sales_targets (year,division_id,target_revenue,target_profit) VALUES (?,?,0,0)', (y, div_id))
            cur.execute('SELECT id FROM division_expenses WHERE year=? AND division_id=?', (y, div_id))
            if not cur.fetchone():
                cur.execute('INSERT INTO division_expenses (year,division_id,sga,common_cost) VALUES (?,?,0,0)', (y, div_id))
    con.commit()

    print('\n=== 적재 결과 ===')
    cur.execute("SELECT COUNT(*) FROM projects"); print('총 프로젝트:', cur.fetchone()[0])
    cur.execute("SELECT business_year, COUNT(*) FROM projects GROUP BY business_year ORDER BY business_year")
    print('연도별:', cur.fetchall())
    cur.execute("SELECT status, COUNT(*) FROM projects GROUP BY status ORDER BY COUNT(*) DESC")
    print('상태별:', cur.fetchall())
    con.close()
    print('완료.')

if __name__ == '__main__':
    main()
