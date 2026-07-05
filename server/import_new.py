# -*- coding: utf-8 -*-
"""
260630 영업현황 엑셀 → SQLite 전체 재적재.
- DB 모든 데이터 삭제(단, admin 계정은 로그인 유지를 위해 보존)
- 6개 시트 모두 적재. 코드 기반 참조는 코드로 마스터 생성 + 이름 있으면 반영.
"""
import sqlite3, os, sys, re
import pandas as pd
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')

XLSX = r'C:/Users/miso-ceo/Documents/카카오톡 받은 파일/260630_영업현황 관련 데이터.xlsx'
DB   = os.path.join(os.path.dirname(__file__), '..', 'db', 'crm.db')

# ---------------- 코드 매핑 ----------------
STATUS_MAP  = {0:'기획단계',1:'영업단계',2:'제안단계',3:'수주완료',4:'수행종료',5:'수주실패',6:'사업보류'}
PART_MAP    = {1:'주관',2:'참여',3:'하도',4:'기타'}
TYPE_MAP    = {'P':'일반 프로젝트','M':'유지보수','D':'구축 프로젝트','R':'연구개발','L':'라이선스','V':'기타'}
COLLECT_MAP = {0:'계약금',1:'선금',2:'중도금',3:'잔금',4:'기성금'}
CASH_MAP    = {1:'현금',2:'어음'}
PURC_MAP    = {1:'인건비',2:'외주',3:'솔루션',9:'기타'}
ACT_MAP     = {1:'영업방문',2:'전화상담',3:'이슈등록',4:'리스트등록',5:'기타'}
ROLE_MAP    = {1:'PM',2:'PL',3:'컨설턴트',4:'분석가',6:'개발자',7:'디자이너',8:'QA',9:'운영',10:'기타',11:'지원',99:'기타'}

def I(v):
    if v is None or (isinstance(v,float) and pd.isna(v)): return None
    try: return int(v)
    except: return None

def N(v):  # 금액/수치 → int
    if v is None or (isinstance(v,float) and pd.isna(v)): return 0
    if isinstance(v,str):
        v=re.sub(r'[^\d.\-]','',v)
        if v in ('','-','.'): return 0
        try: return int(float(v))
        except: return 0
    try: return int(round(float(v)))
    except: return 0

def F(v):  # 실수
    if v is None or (isinstance(v,float) and pd.isna(v)): return 0.0
    try: return float(v)
    except: return 0.0

def D(v):  # 날짜 YYYY-MM-DD
    if v is None or (isinstance(v,float) and pd.isna(v)): return None
    if isinstance(v,str):
        v=v.strip()
        return v[:10] if v else None
    try: return v.strftime('%Y-%m-%d')
    except: return None

def S(v):
    if v is None or (isinstance(v,float) and pd.isna(v)): return None
    s=str(v).strip()
    return s if s else None

def YN(v):
    s=S(v)
    return 'Y' if s=='Y' else 'N'

def main():
    xl = pd.ExcelFile(XLSX)
    proj_df = pd.read_excel(xl, sheet_name='프로젝트 기본정보')
    sol_df  = pd.read_excel(xl, sheet_name='솔루션 납품 내역')
    sale_df = pd.read_excel(xl, sheet_name='매출 (대금수급정보)')
    purc_df = pd.read_excel(xl, sheet_name='매입 (프로젝트예상매입내역)')
    res_df  = pd.read_excel(xl, sheet_name='투입내역 (프로젝트투입인력정보)')
    act_df  = pd.read_excel(xl, sheet_name='활동이력')

    con = sqlite3.connect(DB)
    con.execute('PRAGMA foreign_keys=OFF;')
    cur = con.cursor()

    # ---------------- 전체 삭제 (admin 보존) ----------------
    for t in ['activities','project_purchases','project_sales','project_solutions','project_resources',
              'projects','sales_targets','division_expenses','division_monthly_expenses',
              'customer_contacts','sessions','solutions','project_types','customers','divisions']:
        cur.execute(f'DELETE FROM {t}')
        cur.execute(f"DELETE FROM sqlite_sequence WHERE name='{t}'")
    # users: admin만 남기고 삭제
    cur.execute("DELETE FROM users WHERE username != 'admin'")
    con.commit()
    print('[Clean] 전체 데이터 삭제 (admin 계정 보존)')

    # ---------------- 직원명 매핑 (투입내역에서) ----------------
    emp_name = {}
    for _,r in res_df[['투입직원번호','투입직원명']].dropna().iterrows():
        code=I(r['투입직원번호']); nm=S(r['투입직원명'])
        if code and nm: emp_name[code]=nm

    # ---------------- 마스터: 본부 ----------------
    div_codes = sorted({I(x) for x in proj_df['사업주관본부'].dropna().tolist() if I(x) is not None})
    div_id={}
    for i,code in enumerate(div_codes,1):
        cur.execute('INSERT INTO divisions (code,name,sort_order,active) VALUES (?,?,?,1)',
                    (str(code), f'{code}본부', i))
        div_id[code]=cur.lastrowid
    print(f'[Div] {len(div_id)}개')

    # ---------------- 마스터: 사용자(직원) ----------------
    emp_codes=set()
    for c in ['영업직원번호','사업주관자번호','PM번호']:
        emp_codes.update(I(x) for x in proj_df[c].dropna().tolist() if I(x) is not None)
    emp_codes.update(emp_name.keys())
    user_id={}
    for code in sorted(emp_codes):
        nm = emp_name.get(code, f'직원{code}')
        uname=str(code)
        cur.execute('INSERT INTO users (username,name,role,active) VALUES (?,?,?,1)',
                    (uname, nm, 'user'))
        user_id[code]=cur.lastrowid
    print(f'[User] {len(user_id)}명 (+admin)')

    # ---------------- 마스터: 고객사 (고객사번호+원도급사번호) ----------------
    cust_codes=set()
    cust_codes.update(I(x) for x in proj_df['고객사번호'].dropna().tolist() if I(x) is not None)
    cust_codes.update(I(x) for x in proj_df['원도급사번호'].dropna().tolist() if I(x) is not None)
    cust_id={}; cust_name={}
    for code in sorted(cust_codes):
        nm=f'고객사 {code}'
        cur.execute('INSERT INTO customers (name,business_no) VALUES (?,?)', (nm, str(code)))
        cust_id[code]=cur.lastrowid; cust_name[code]=nm
    print(f'[Cust] {len(cust_id)}개')

    # ---------------- 마스터: 프로젝트유형 ----------------
    type_id={}
    for code in [c for c in proj_df['프로젝트종류'].dropna().unique().tolist()]:
        nm=TYPE_MAP.get(code, str(code))
        cur.execute('INSERT INTO project_types (code,name,sort_order,is_internal) VALUES (?,?,0,0)',
                    (str(code), nm))
        type_id[code]=cur.lastrowid
    print(f'[Type] {len(type_id)}개')

    # ---------------- 마스터: 솔루션 ----------------
    sol_codes = sorted({S(x) for x in sol_df['솔루션코드'].dropna().tolist() if S(x)})
    sol_id={}
    for code in sol_codes:
        cur.execute('INSERT INTO solutions (code,name,active) VALUES (?,?,1)', (code, code))
        sol_id[code]=cur.lastrowid
    print(f'[Solution] {len(sol_id)}개')

    # ---------------- 프로젝트 ----------------
    PF=['project_code','project_name','project_type_id','status','division_id','manager_id','pm_id',
        'sales_rep_id','proposal_deadline','customer_id','customer_contact','prime_contractor',
        'business_year','start_date','end_date','total_budget','participation_type','total_purchase',
        'tech_support_date','participation_rate','participation_amount','win_probability',
        'expected_revenue','actual_revenue','has_solution','sw_registered','competitor','intro_channel','overview']
    ins_p=f"INSERT INTO projects ({','.join(PF)}) VALUES ({','.join('?'*len(PF))})"
    proj_id={}
    n=0
    for _,r in proj_df.iterrows():
        code=S(r['프로젝트코드'])
        if not code or code in proj_id: continue
        st=STATUS_MAP.get(I(r['진행상태코드']), '기획단계')
        pt=PART_MAP.get(I(r['참여형태구분코드']), '참여')
        prime_c = I(r['원도급사번호'])
        vals=[
            code, S(r['예상프로젝트명']) or code,
            type_id.get(r['프로젝트종류']), st,
            div_id.get(I(r['사업주관본부'])),
            user_id.get(I(r['사업주관자번호'])),
            user_id.get(I(r['PM번호'])),
            user_id.get(I(r['영업직원번호'])),
            D(r['사업제안마감일자']),
            cust_id.get(I(r['고객사번호'])),
            None,
            cust_name.get(prime_c),
            I(r['사업년도']),
            D(r['예상사업수행시작일자']),
            D(r['예상사업수행종료일자']),
            N(r['총사업예산금액']),
            pt,
            N(r['예상총매입금액']),
            D(r['기술지원확약서제출일자']),
            F(r['참여비율']),
            N(r['참여사업지분금액']),
            F(r['수주확률']),
            N(r['수주예상금액']),
            N(r['실매출금액']),
            YN(r['당사솔루션납품여부']),
            YN(r['소프트웨어실적등록여부']),
            S(r['예상경쟁사명']),
            S(r['소개경로코드']),
            S(r['사업과제개요']),
        ]
        cur.execute(ins_p, vals)
        proj_id[code]=cur.lastrowid; n+=1
    con.commit()
    print(f'[Project] {n}건')

    def pid(row):
        return proj_id.get(S(row['프로젝트코드']))

    # ---------------- 솔루션 납품 ----------------
    SF=['project_id','solution_id','spec','standard_price','quantity','internal_cost','discount_rate',
        'delivery_amount','install_date','contract_issued','notes']
    ins_s=f"INSERT INTO project_solutions ({','.join(SF)}) VALUES ({','.join('?'*len(SF))})"
    cnt=0; skip=0
    for _,r in sol_df.iterrows():
        p=pid(r)
        if not p: skip+=1; continue
        deliv = N(r['솔루션실제납품금액']) or N(r['솔루션예상납품금액'])
        cur.execute(ins_s, [p, sol_id.get(S(r['솔루션코드'])), None,
            N(r['솔루션표준판매단가']), I(r['솔루션납품수량']) or 1, N(r['솔루션내부원가']),
            F(r['솔루션할인율']), deliv, D(r['솔루션설치확인일자']), YN(r['확약서발행여부']),
            S(r['비고'])])
        cnt+=1
    print(f'[Solution납품] {cnt}건 (orphan {skip})')

    # ---------------- 매출 ----------------
    SAF=['project_id','invoice_date','invoice_issued','sales_amount','vat','total_amount','unpaid_balance',
         'collection_type','cash_or_note','payment_due_date','paid','notes']
    ins_sa=f"INSERT INTO project_sales ({','.join(SAF)}) VALUES ({','.join('?'*len(SAF))})"
    cnt=0; skip=0
    for _,r in sale_df.iterrows():
        p=pid(r)
        if not p: skip+=1; continue
        amt=N(r['수금예상금액'])
        cur.execute(ins_sa, [p, D(r['세금계산서발행일자']), YN(r['세금계산서발행여부']), amt, 0, amt,
            N(r['수금후예상잔액']), COLLECT_MAP.get(I(r['수금유형코드']),'기성금'),
            CASH_MAP.get(I(r['현금어음구분코드']),'현금'), D(r['수금예정일자']), YN(r['실입금여부']), None])
        cnt+=1
    print(f'[매출] {cnt}건 (orphan {skip})')

    # ---------------- 매입 ----------------
    PUF=['project_id','purchase_code','payment_due_date','purchase_amount','vat','total_amount','vendor',
         'description','invoice_number','invoice_issued','invoice_date','paid']
    ins_pu=f"INSERT INTO project_purchases ({','.join(PUF)}) VALUES ({','.join('?'*len(PUF))})"
    cnt=0; skip=0
    for _,r in purc_df.iterrows():
        p=pid(r)
        if not p: skip+=1; continue
        amt=N(r['예상매입금액'])
        cur.execute(ins_pu, [p, PURC_MAP.get(I(r['매입유형구분코드']),'기타'), D(r['지급예정일자']), amt, 0, amt,
            S(r['예상매입업체']), S(r['예상매입기타내역']), S(r['세금계산서발행번호']),
            YN(r['세금계산서발행여부']), D(r['세금계산서발행일자']), YN(r['실지급여부'])])
        cnt+=1
    print(f'[매입] {cnt}건 (orphan {skip})')

    # ---------------- 투입내역 ----------------
    RF=['project_id','category','affiliation','name','position','start_date','end_date',
        'participation_rate','effort_mm','total_days','standard_price','internal_cost','discount_rate','internal_total']
    ins_r=f"INSERT INTO project_resources ({','.join(RF)}) VALUES ({','.join('?'*len(RF))})"
    cnt=0; skip=0
    for _,r in res_df.iterrows():
        p=pid(r)
        if not p: skip+=1; continue
        role=ROLE_MAP.get(I(r['투입역할코드']),'팀원')
        aff = '외주' if YN(r['외주여부'])=='Y' else (S(r['투입시부서명']) or '내부')
        cur.execute(ins_r, [p, role, aff, S(r['투입직원명']), S(r['투입시직급명']),
            D(r['투입일자']), D(r['철수일자']), F(r['투입률']), F(r['투입공수']), I(r['투입일수']) or 0,
            N(r['내부표준적용_일단가']), N(r['내부표준적용_일원가']), F(r['할인율']),
            N(r['내부표준총투입원가_일'])])
        cnt+=1
    print(f'[투입내역] {cnt}건 (orphan {skip})')

    # ---------------- 활동이력 ----------------
    AF=['project_id','activity_date','category','post_win_rate','title','content','created_by']
    ins_a=f"INSERT INTO activities ({','.join(AF)}) VALUES ({','.join('?'*len(AF))})"
    cnt=0; skip=0
    for _,r in act_df.iterrows():
        p=pid(r)
        if not p: skip+=1; continue
        cur.execute(ins_a, [p, D(r['활동일자']), ACT_MAP.get(I(r['활동유형구분코드']),'기타'),
            F(r['활동후수주확률']), S(r['활동내역제목']), S(r['활동내역']), None])
        cnt+=1
    print(f'[활동이력] {cnt}건 (orphan {skip})')

    con.commit()

    # ---------------- 요약 ----------------
    print('\n=== 최종 건수 ===')
    for t in ['divisions','users','customers','project_types','solutions','projects',
              'project_solutions','project_sales','project_purchases','project_resources','activities']:
        c=cur.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
        print(f'  {t:20s}: {c:>6,}')
    con.close()
    print('완료.')

if __name__=='__main__':
    main()
