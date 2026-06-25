import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\iqii\Downloads\Bendahara\Admin\All-Transaksi.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if 'currentmonth' in line.lower() or 'currentsort' in line.lower() or 'currenttype' in line.lower():
            if idx > 1350 and idx < 1395:
                safe_line = line.strip().encode('ascii', errors='replace').decode('ascii')
                print(f"All-Transaksi.html:{idx+1}: {safe_line[:120]}")
