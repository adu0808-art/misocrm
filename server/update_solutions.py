# -*- coding: utf-8 -*-
"""이미지(솔루션 마스터 37개) 기준으로 solutions 업데이트/추가.
컬럼: code,name,base_consumer_price,recommended_price,max_discount,cogs,internal_cost,standard_price,is_sellable,is_internal
DB에만 있고 이미지에 없는 코드(BP/NO/QV/SQ/WP/WT)는 납품참조가 있어 유지."""
import sqlite3, os, sys
sys.stdout.reconfigure(encoding='utf-8')
DB = os.path.join(os.path.dirname(__file__), '..', 'db', 'crm.db')

# (code, name, base, recommended, max_discount, cogs, internal_cost, standard_price, sellable, internal)
DATA = [
 ('AD','Smart AID',100000000,80000000,0,0,30000000,0,'Y','Y'),
 ('AI','SmartAI(KSB)',300000000,150000000,0,0,30000000,0,'Y','Y'),
 ('AL','SmartAL',150000000,120000000,0,0,30000000,0,'Y','Y'),
 ('AQ','SmartALQC',100000000,80000000,0,0,30000000,0,'Y','Y'),
 ('AT','ACTic',200000000,150000000,40,0,50000000,200000000,'Y','Y'),
 ('CD','SmartCDRS',200000000,100000000,0,0,20000000,0,'Y','Y'),
 ('CF','Smart CRF',100000000,50000000,0,0,10000000,0,'Y','Y'),
 ('CR','CRaaS',300000000,200000000,50,0,50000000,200000000,'Y','Y'),
 ('DR','Smart DRB',100000000,50000000,0,0,10000000,0,'Y','Y'),
 ('DX','Daxi',0,0,0,0,0,0,'Y','Y'),
 ('E$','기타솔루션',1,1,0,0,1,0,'Y','N'),
 ('EP','MISO ePRO',100000000,50000000,0,0,10000000,0,'Y','Y'),
 ('ET','ETL 솔루션',0,0,0,0,27000000,0,'Y','N'),
 ('H1','미소HR1',100000000,50000000,0,0,10000000,0,'Y','Y'),
 ('H2','미소HR2',6000000,3000000,0,0,1000000,0,'Y','Y'),
 ('KP','Smart KPI',100000000,50000000,0,0,10000000,0,'Y','Y'),
 ('LP','LogPresso',0,0,0,0,0,0,'Y','N'),
 ('MB','MisoBot',35000000,7000000,0,0,10000000,0,'Y','Y'),
 ('MD','MISO DynaCon',100000000,50000000,0,0,10000000,0,'Y','Y'),
 ('MS','MediScan',100000000,70000000,0,0,40000000,0,'Y','Y'),
 ('OL','MISO OpenLab',200000000,100000000,0,0,20000000,0,'Y','Y'),
 ('QA','Qlik Sense Anlz',720000,0,0,0,0,0,'Y','N'),
 ('QC','Qlik Compose',0,0,0,0,0,0,'Y','N'),
 ('QG','Qlik Catalog',0,0,0,0,0,0,'Y','N'),
 ('QL','Qlik Analytics Platform',90000000,90000000,0,0,0,0,'Y','N'),
 ('QN','Qlik Nprinting',0,0,0,0,0,0,'Y','N'),
 ('QP','Qlik Sense Pro',1260000,0,0,0,0,0,'Y','N'),
 ('QR','Qlik Replicate',0,0,0,0,0,0,'Y','N'),
 ('QT','Qlik Sense Capacity',1800000,0,0,0,0,0,'Y','N'),
 ('SB','SmartBig',300000000,200000000,50,0,50000000,200000000,'Y','Y'),
 ('SC','SmartCDW',100000000,50000000,0,0,10000000,0,'Y','Y'),
 ('SD','SmartDataView',0,0,0,0,0,0,'Y','Y'),
 ('SP','숨플',20000000,20000000,0,0,10000000,0,'Y','Y'),
 ('SR','SmartBLUR',100000000,50000000,0,0,10000000,0,'Y','Y'),
 ('SS','SmartSpider',100000000,70000000,0,0,20000000,0,'Y','Y'),
 ('SW','SmartView',50000000,37500000,0,0,10000000,0,'Y','Y'),
 ('TA','SmartTA(v2.0)',150000000,100000000,0,0,20000000,0,'Y','Y'),
]

def main():
    con=sqlite3.connect(DB); cur=con.cursor()
    updated=0; inserted=[]
    for (code,name,base,rec,disc,cogs,ic,sp,sell,intn) in DATA:
        row=cur.execute('SELECT id FROM solutions WHERE code=?',(code,)).fetchone()
        if row:
            cur.execute('''UPDATE solutions SET name=?,base_consumer_price=?,recommended_price=?,
                max_discount=?,cogs=?,internal_cost=?,standard_price=?,is_sellable=?,is_internal=?,active=1
                WHERE id=?''',(name,base,rec,disc,cogs,ic,sp,sell,intn,row[0]))
            updated+=1
        else:
            cur.execute('''INSERT INTO solutions (code,name,base_consumer_price,recommended_price,
                max_discount,cogs,internal_cost,standard_price,is_sellable,is_internal,active)
                VALUES (?,?,?,?,?,?,?,?,?,?,1)''',(code,name,base,rec,disc,cogs,ic,sp,sell,intn))
            inserted.append(code)
    con.commit()
    total=cur.execute('SELECT COUNT(*) FROM solutions').fetchone()[0]
    print(f'업데이트: {updated}건')
    print(f'신규 추가: {len(inserted)}건 -> {inserted}')
    print(f'전체 솔루션: {total}개')
    con.close()

if __name__=='__main__':
    main()
