import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\iqii\Downloads\Bendahara\Admin\Kelola-Proker.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if 'function toggletheme' in line.lower():
            for i in range(idx, idx + 25):
                print(f"L{i+1}: {lines[i].strip()}")
