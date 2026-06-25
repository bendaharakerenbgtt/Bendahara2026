import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\iqii\Downloads\Bendahara\Admin\Kelola-Proker.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    in_script = False
    for idx, line in enumerate(lines):
        if '<script' in line:
            in_script = True
        if 'const SCRIPT_URL' in line or 'fetch(SCRIPT_URL' in line or 'function tambahProker' in line:
            safe_line = line.strip().encode('ascii', errors='replace').decode('ascii')
            print(f"Kelola-Proker.html:{idx+1}: {safe_line[:120]}")
