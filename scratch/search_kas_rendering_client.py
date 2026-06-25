import os

with open(r'c:\Users\iqii\Downloads\Bendahara\pembayaran-kas.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if 'anggota' in line.lower() or 'pengurus' in line.lower() or 'render' in line.lower():
            print(f"pembayaran-kas.html:{idx+1}: {line.strip()[:100]}")
