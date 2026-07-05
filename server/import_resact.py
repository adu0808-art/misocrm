# -*- coding: utf-8 -*-
"""
260630_영업현황 관련 데이터1.xlsx → SQLite 추가 적재.
투입내역 시트 → project_resources
활동이력 시트 → activities
프로젝트는 프로젝트코드로 기존 DB(현재 데이터)와 매칭. 기존 두 테이블만 비우고 삽입.
"""
import sqlite3, os, sys, re
import pandas as pd

sys.stdout.reconfigure(encoding='utf-8')
XLSX = r'C:/Users/miso-ceo/Documents/카카오톡 받은 파일/260630_영업현황 관련 데이터1.xlsx'
DB   = os.path.join(os.path.dirname(__file__), '..', 'db', 'crm.db')

# 활동유형구분코드 → ACT_CATEGORIES (project-detail.js 기준)
ACT_MAP = {1:'영업방문', 2:'전화상담', 3:'이슈등록', 4:'리스트등록', 5:'기타'}

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

def D(v):
    """날짜만(YYYY-MM-DD)"""
    if v is None or (isinstance(v,float) and pd.isna(v)): return None
    if isinstance(v,str):
        s=v.strip(); return s[:10] if s else None
    try: return v.strftime('%Y-%m-%d')
    except: return None

def DT(v):
    """일시(YYYY-MM-DD HH:MM:SS)"""
    if v is None or (isinstance(v,float) and pd.isna(v)): return None
    if isinstance(v,str):
        s=v.strip(); return s[:19] if s else None
    try: return v.strftime('%Y-%m-%d %H:%M:%S')
    except: return None

def S(v):
    if v is None or (isinstance(v,float) and pd.isna(v)): return None
    s=str(v).strip()
    if not s or s.lower()=='nan': return None
    return s.replace('&amp;','&')   # 웹 export HTML 엔티티 복원

def main():
    xl = pd.ExcelFile(XLSX)
    res = pd.read_excel(xl, sheet_name='투입내역')
    act = pd.read_excel(xl, sheet_name='활동이력')

    con = sqlite3.connect(DB); con.execute('PRAGMA foreign_keys=OFF;')
    cur = con.cursor()

    dbcodes = {r[0]: r[1] for r in cur.execute('SELECT project_code, id FROM projects')}
    print(f'[DB] projects={len(dbcodes)}')

    for t in ['project_resources','activities']:
        cur.execute(f'DELETE FROM {t}'); cur.execute(f"DELETE FROM sqlite_sequence WHERE name='{t}'")
    con.commit()
    print('[Clean] project_resources / activities 비움')

    # ---- 투입내역 → project_resources ----
    RF=['project_id','category','affiliation','name','position','start_date','end_date',
        'participation_rate','effort_mm','total_days','standard_price','internal_cost',
        'discount_rate','internal_total','created_at']
    ins_r=f"INSERT INTO project_resources ({','.join(RF)}) VALUES ({','.join('?'*len(RF))})"
    c=0; sk=0
    res = res.sort_values(by=['프로젝트코드'], kind='stable')
    for _,r in res.iterrows():
        pid = dbcodes.get(S(r['프로젝트코드']))
        if not pid: sk+=1; continue
        cur.execute(ins_r, [
            pid, '선택안함', S(r['투입시부서명']), S(r['투입직원명']), S(r['투입시직급명']),
            D(r['투입일자']), D(r['철수일자']),
            F(r['투입률']), F(r['투입공수']), N(r['투입일수']),
            N(r['내부표준적용_월단가']), N(r['내부표준적용_월원가']),
            F(r['할인율']), N(r['내부표준총투입원가_월']),
            DT(r['등록일시'])
        ]); c+=1
    print(f'[투입내역→resources] {c}건 (orphan {sk})')

    # ---- 활동이력 → activities ----
    AF=['project_id','activity_date','category','post_win_rate','title','content','created_by','created_at']
    ins_a=f"INSERT INTO activities ({','.join(AF)}) VALUES ({','.join('?'*len(AF))})"
    c=0; sk=0
    act = act.sort_values(by=['프로젝트코드','활동내역차수'], kind='stable')
    for _,r in act.iterrows():
        pid = dbcodes.get(S(r['프로젝트코드']))
        if not pid: sk+=1; continue
        try: code=int(r['활동유형구분코드'])
        except: code=None
        cat = ACT_MAP.get(code, '기타')
        content = S(r['활동내역'])
        contact = S(r['고객담당자성명'])
        if contact:
            content = (content + f'  (고객담당자: {contact})') if content else f'고객담당자: {contact}'
        cur.execute(ins_a, [
            pid, D(r['활동일자']), cat, F(r['활동후수주확률']),
            S(r['활동내역제목']), content, None, DT(r['등록일자'])
        ]); c+=1
    print(f'[활동이력→activities] {c}건 (orphan {sk})')

    con.commit()
    print('\n=== 최종 건수 ===')
    for t in ['project_resources','activities']:
        print(f'  {t:20s}: {cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]:>6,}')
    con.close(); print('완료.')

if __name__=='__main__':
    main()
