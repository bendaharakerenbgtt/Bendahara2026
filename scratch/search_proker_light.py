import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\iqii\Downloads\Bendahara\Admin\Kelola-Proker.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if 'light-mode' in line.lower() or 'light' in line.lower():
            if idx > 70 and idx < 150:
                safe_line = line.strip().encode('ascii', errors='replace').decode('ascii')
                print(f"Kelola-Proker.html:{idx+1}: {safe_line[:120]}")
