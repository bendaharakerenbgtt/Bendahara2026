import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\iqii\Downloads\Bendahara\Admin\All-Transaksi.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if 'applymutationfilters' in line.lower() or 'activefiltertype' in line.lower() or 'function filter' in line.lower():
            safe_line = line.strip().encode('ascii', errors='replace').decode('ascii')
            print(f"All-Transaksi.html:{idx+1}: {safe_line[:120]}")
