import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\iqii\Downloads\Bendahara\riwayat-transaksi.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if 'let current' in line or 'var current' in line:
            safe_line = line.strip().encode('ascii', errors='replace').decode('ascii')
            print(f"riwayat-transaksi.html:{idx+1}: {safe_line[:120]}")
