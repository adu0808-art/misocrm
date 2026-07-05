# -*- coding: utf-8 -*-
"""
260630_영업현황 관련 데이터.xlsx 의 '매입(프로젝트예상매입내역)' 시트 → project_purchases.
프로젝트코드로 현재 DB와 매칭. project_purchases 테이블만 비우고 삽입.
"""
import sqlite3, os, sys, re
import pandas as pd

sys.stdout.reconfigure(encoding='utf-8')
XLSX = r'C:/Users/miso-ceo/Documents/카카오톡 받은 파일/260630_영업현황 관련 데이터.xlsx'
DB   = os.path.join(os.path.dirname(__file__), '..', 'db', 'crm.db')

def N(v):
    if v is None or (isinstance(v,float) and pd.isna(v)): return 0
    if isinstance(v,str):
        v=re.sub(r'[^\d.\-]','',v)
        if v in ('','-','.'): return 0
        try: return int(float(v))
        except: return 0
    try: return int(round(float(v)))
    except: return 0

def D(v):
    if v is None or (isinstance(v,float) and pd.isna(v)): return None
    if isinstance(v,str):
        s=v.strip(); return s[:10] if s else None
    try: return v.strftime('%Y-%m-%d')
    except: return None

def S(v):
    if v is None or (isinstance(v,float) and pd.isna(v)): return None
    s=str(v).strip()
    if not s or s.lower()=='nan': return None
    return s.replace('&amp;','&')

def YN(v):
    return 'Y' if S(v)=='Y' else 'N'

def main():
    xl = pd.ExcelFile(XLSX)
    mp = pd.read_excel(xl, sheet_name='매입 (프로젝트예상매입내역)')

    con = sqlite3.connect(DB); con.execute('PRAGMA foreign_keys=OFF;')
    cur = con.cursor()
    dbcodes = {r[0]: r[1] for r in cur.execute('SELECT project_code, id FROM projects')}

    cur.execute('DELETE FROM project_purchases')
    cur.execute("DELETE FROM sqlite_sequence WHERE name='project_purchases'")
    con.commit()
    print('[Clean] project_purchases 비움')

    PF=['project_id','purchase_code','payment_due_date','purchase_amount','vat','total_amount',
        'vendor','description','invoice_number','invoice_issued','invoice_date','paid']
    ins=f"INSERT INTO project_purchases ({','.join(PF)}) VALUES ({','.join('?'*len(PF))})"
    mp = mp.sort_values(by=['프로젝트코드'], kind='stable')
    c=0; sk=0
    for _,r in mp.iterrows():
        pid = dbcodes.get(S(r['프로젝트코드']))
        if not pid: sk+=1; continue
        amt = N(r['예상매입금액'])
        cur.execute(ins, [
            pid, None, D(r['지급예정일자']), amt, 0, amt,
            S(r['예상매입업체']), S(r['예상매입기타내역']),
            S(r['세금계산서발행번호']), YN(r['세금계산서발행여부']),
            D(r['세금계산서발행일자']), YN(r['실지급여부'])
        ]); c+=1
    con.commit()
    print(f'[매입→project_purchases] {c}건 (orphan {sk})')
    print('  총 매입금액:', f"{cur.execute('SELECT COALESCE(SUM(purchase_amount),0) FROM project_purchases').fetchone()[0]:,}")
    print('  미지급(paid=N):', cur.execute("SELECT COUNT(*) FROM project_purchases WHERE paid='N'").fetchone()[0])
    con.close(); print('완료.')

if __name__=='__main__':
    main()
