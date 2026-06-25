import os
import sys

# Ensure utf-8 output or replace unencodable chars
sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\iqii\Downloads\Bendahara\Admin\All-Transaksi.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if 'anggota' in line.lower() or 'members' in line.lower() or 'pengurus' in line.lower() or 'id_anggota' in line.lower():
            safe_line = line.strip().encode('ascii', errors='replace').decode('ascii')
            print(f"All-Transaksi.html:{idx+1}: {safe_line[:120]}")
