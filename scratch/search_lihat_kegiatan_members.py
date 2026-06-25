import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\iqii\Downloads\Bendahara\lihat-kegiatan.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if 'anggota' in line.lower() or 'members' in line.lower() or 'pengurus' in line.lower() or 'nim' in line.lower():
            safe_line = line.strip().encode('ascii', errors='replace').decode('ascii')
            print(f"lihat-kegiatan.html:{idx+1}: {safe_line[:120]}")
