# -*- coding: utf-8 -*-
"""
영업현황내역_20260704 엑셀 → SQLite 전체 재적재 (이름 기반 데이터).
시트: 영업현황(프로젝트) / 대금수급현황(매출) / 솔루션납품정보
DB 모든 데이터 삭제(admin 계정만 보존).
"""
import sqlite3, os, sys, re
import pandas as pd

sys.stdout.reconfigure(encoding='utf-8')
XLSX = r'C:/Users/miso-ceo/Documents/MISO_CRM/영업현황내역_20260704151495.xlsx'
DB   = os.path.join(os.path.dirname(__file__), '..', 'db', 'crm.db')

STATUS_MAP = {'사업/제안보류':'사업보류'}  # 나머지는 그대로
TYPE_CODE  = {'일반 프로젝트':'P','유지보수(인력)':'M','License Renewal':'L','정부 지원 과제':'G','AI바우처 사업':'V'}

def N(v):
    if v is None or (isinstance(v,float) and pd.isna(v)): return 0
    if isinstance(v,str):
        v=re.sub(r'[^\d.\-]','',v)
        if v in ('','-','.'): return 0
        try: return int(float(v))
        except: return 0
    try: return int(round(float(v)))
    except: return 0

def F(v):
    if v is None or (isinstance(v,float) and pd.isna(v)): return 0.0
    if isinstance(v,str):
        s=re.sub(r'[^\d.\-]','',v)
        try: return float(s) if s else 0.0
        except: return 0.0
    try: return float(v)
    except: return 0.0

def I(v):
    if v is None or (isinstance(v,float) and pd.isna(v)): return None
    try: return int(v)
    except: return None

def D(v):
    if v is None or (isinstance(v,float) and pd.isna(v)): return None
    if isinstance(v,str):
        v=v.strip(); return v[:10] if v else None
    try: return v.strftime('%Y-%m-%d')
    except: return None

def S(v):
    if v is None or (isinstance(v,float) and pd.isna(v)): return None
    s=str(v).strip()
    return s if s and s.lower()!='nan' else None

def YN(v):
    return 'Y' if S(v)=='Y' else 'N'

def main():
    xl = pd.ExcelFile(XLSX)
    pj = pd.read_excel(xl, sheet_name='영업현황')
    sa = pd.read_excel(xl, sheet_name='대금수급현황')
    so = pd.read_excel(xl, sheet_name='솔루션납품정보')

    con = sqlite3.connect(DB); con.execute('PRAGMA foreign_keys=OFF;')
    cur = con.cursor()

    for t in ['activities','project_purchases','project_sales','project_solutions','project_resources',
              'projects','sales_targets','division_expenses','division_monthly_expenses',
              'customer_contacts','sessions','solutions','project_types','customers','divisions']:
        cur.execute(f'DELETE FROM {t}'); cur.execute(f"DELETE FROM sqlite_sequence WHERE name='{t}'")
    cur.execute("DELETE FROM users WHERE username != 'admin'")
    con.commit()
    print('[Clean] 전체 삭제 (admin 보존)')

    # 본부
    div_id={}
    for i,name in enumerate(sorted({S(x) for x in pj['사업주관본부'].dropna() if S(x)}),1):
        cur.execute('INSERT INTO divisions (code,name,sort_order,active) VALUES (?,?,?,1)', (f'D{i:03d}',name,i))
        div_id[name]=cur.lastrowid
    print(f'[Div] {len(div_id)}개')

    # 사용자 (영업/주관/PM 이름)
    names=set()
    for c in ['영업직원번호','사업주관자번호','PM번호']:
        names.update(S(x) for x in pj[c].dropna() if S(x))
    user_id={}
    for nm in sorted(names):
        base=re.sub(r'[^a-zA-Z0-9가-힣]','',nm)[:20] or 'user'
        uname=base; k=1
        while cur.execute('SELECT 1 FROM users WHERE username=?',(uname,)).fetchone():
            k+=1; uname=f'{base}{k}'
        cur.execute('INSERT INTO users (username,name,role,active) VALUES (?,?,?,1)',(uname,nm,'user'))
        user_id[nm]=cur.lastrowid
    print(f'[User] {len(user_id)}명 (+admin)')

    # 고객사 (이름 + 기관유형 + 도메인)
    cust_id={}
    for _,r in pj.iterrows():
        nm=S(r['고객사명'])
        if not nm or nm in cust_id: continue
        cur.execute('INSERT INTO customers (name,industry,top_domain,sub_domain) VALUES (?,?,?,?)',
                    (nm, S(r['기관유형']), S(r['상위도메인']), S(r['하위도메인'])))
        cust_id[nm]=cur.lastrowid
    print(f'[Cust] {len(cust_id)}개')

    # 프로젝트유형
    type_id={}
    for nm in pj['프로젝트유형'].dropna().unique():
        nm=S(nm)
        if not nm or nm in type_id: continue
        cur.execute('INSERT INTO project_types (code,name,sort_order,is_internal) VALUES (?,?,0,0)',
                    (TYPE_CODE.get(nm, nm[:2].upper()), nm))
        type_id[nm]=cur.lastrowid
    print(f'[Type] {len(type_id)}개')

    # 솔루션 (솔루션코드)
    sol_id={}
    for code in sorted({S(x) for x in so['솔루션코드'].dropna() if S(x)}):
        cur.execute('INSERT INTO solutions (code,name,active) VALUES (?,?,1)',(code,code))
        sol_id[code]=cur.lastrowid
    print(f'[Solution] {len(sol_id)}개')

    # 프로젝트
    YEARS=[2023,2024,2025,2026,2027,2028,2029,2030]
    PF=['project_code','project_name','project_type_id','status','division_id','manager_id','pm_id',
        'sales_rep_id','proposal_deadline','customer_id','prime_contractor','business_year',
        'start_date','end_date','total_budget','participation_type','total_purchase',
        'participation_rate','participation_amount','win_probability','expected_revenue','actual_revenue',
        'has_solution','sw_registered','competitor','overview','top_domain','sub_domain'] + [f'y{y}' for y in YEARS]
    ins=f"INSERT INTO projects ({','.join(PF)}) VALUES ({','.join('?'*len(PF))})"
    proj_id={}; n=0
    for _,r in pj.iterrows():
        code=S(r['프로젝트코드'])
        if not code or code in proj_id: continue
        st=S(r['진행상태코드']) or '기획단계'; st=STATUS_MAP.get(st, st)
        vals=[code, S(r['예상프로젝트명']) or code,
            type_id.get(S(r['프로젝트유형'])), st,
            div_id.get(S(r['사업주관본부'])),
            user_id.get(S(r['사업주관자번호'])),
            user_id.get(S(r['PM번호'])),
            user_id.get(S(r['영업직원번호'])),
            D(r['사업제안마감일자']), cust_id.get(S(r['고객사명'])),
            S(r['원도급사명']), I(r['사업년도']),
            D(r['예상사업수행시작일자']), D(r['예상사업수행종료일자']),
            N(r['총사업예산금액']), S(r['참여형태구분코드']) or '참여', N(r['예상총매입금액']),
            F(r['참여비율']), N(r['참여사업지분금액']), F(r['수주확률']),
            N(r['예상매출금액']), N(r['실매출금액']),
            YN(r['당사솔루션납품여부']), YN(r['소프트웨어실적등록여부']),
            S(r['예상경쟁사명']), S(r['사업/과제개요']),
            S(r['상위도메인']), S(r['하위도메인'])]
        for y in YEARS:
            col=f'{y}년 참여금액'
            vals.append(N(r[col]) if col in pj.columns else 0)
        cur.execute(ins, vals); proj_id[code]=cur.lastrowid; n+=1
    con.commit()
    print(f'[Project] {n}건')

    def pid(row): return proj_id.get(S(row['프로젝트코드']))

    # 매출 (대금수급현황)
    SAF=['project_id','invoice_date','invoice_issued','sales_amount','vat','total_amount','unpaid_balance',
         'collection_type','cash_or_note','payment_due_date','paid','notes']
    ins_sa=f"INSERT INTO project_sales ({','.join(SAF)}) VALUES ({','.join('?'*len(SAF))})"
    c=0; sk=0
    for _,r in sa.iterrows():
        p=pid(r)
        if not p: sk+=1; continue
        amt=N(r['수금예상금액'])
        cur.execute(ins_sa,[p, D(r['세금계산서발행일자']), YN(r['세금계산서발행여부']), amt, 0, amt,
            N(r['수금후예상잔액']), S(r['수금유형코드']) or '기성금', S(r['현금어음구분코드']) or '현금',
            D(r['수금예정일자']), YN(r['실입금여부']), None]); c+=1
    print(f'[매출] {c}건 (orphan {sk})')

    # 솔루션 납품
    SF=['project_id','solution_id','spec','standard_price','quantity','internal_cost','discount_rate',
        'delivery_amount','install_date','contract_issued','notes']
    ins_s=f"INSERT INTO project_solutions ({','.join(SF)}) VALUES ({','.join('?'*len(SF))})"
    c=0; sk=0
    for _,r in so.iterrows():
        p=pid(r)
        if not p: sk+=1; continue
        vend=S(r.get('SLUTN_PUHS_CTMNY_NM')); memo=S(r['비고'])
        note=' / '.join([x for x in [f'납품업체:{vend}' if vend else None, memo] if x]) or None
        cur.execute(ins_s,[p, sol_id.get(S(r['솔루션코드'])), None, 0, 1, 0, 0,
            N(r['솔루션납품금액']), D(r['솔루션설치확인일자']), YN(r['확약서발행여부']), note]); c+=1
    print(f'[솔루션납품] {c}건 (orphan {sk})')

    con.commit()
    print('\n=== 최종 건수 ===')
    for t in ['divisions','users','customers','project_types','solutions','projects',
              'project_solutions','project_sales','project_purchases','project_resources','activities']:
        print(f'  {t:20s}: {cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]:>6,}')
    con.close(); print('완료.')

if __name__=='__main__':
    main()
