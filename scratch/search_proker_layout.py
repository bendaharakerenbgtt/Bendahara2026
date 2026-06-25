import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\iqii\Downloads\Bendahara\Admin\Kelola-Proker.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if 'id="app"' in line.lower() or '<main' in line.lower() or 'id="loading' in line.lower() or 'grid' in line.lower() or 'flex' in line.lower():
            if idx > 150 and idx < 450:
                safe_line = line.strip().encode('ascii', errors='replace').decode('ascii')
                print(f"Kelola-Proker.html:{idx+1}: {safe_line[:120]}")
