import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

admin_dir = r'c:\Users\iqii\Downloads\Bendahara\Admin'
for fname in os.listdir(admin_dir):
    if not fname.endswith('.html'):
        continue
    fpath = os.path.join(admin_dir, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
        if 'Kelola-Kas.html' in content or 'Kelola-Proker.html' in content:
            print(f"Found reference in {fname}")
