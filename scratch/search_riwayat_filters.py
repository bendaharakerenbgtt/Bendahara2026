import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\iqii\Downloads\Bendahara\riwayat-transaksi.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if 'filter' in line.lower() or 'search' in line.lower() or 'select id=' in line.lower():
            if idx > 430 and idx < 530:
                safe_line = line.strip().encode('ascii', errors='replace').decode('ascii')
                print(f"riwayat-transaksi.html:{idx+1}: {safe_line[:120]}")
