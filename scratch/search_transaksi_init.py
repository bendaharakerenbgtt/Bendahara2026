import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\iqii\Downloads\Bendahara\Admin\All-Transaksi.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if 'domcontentloaded' in line.lower() or 'window.onload' in line.lower() or 'document.getElementById(\'in_tanggal\')' in line:
            safe_line = line.strip().encode('ascii', errors='replace').decode('ascii')
            print(f"All-Transaksi.html:{idx+1}: {safe_line[:120]}")
