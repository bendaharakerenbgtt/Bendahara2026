import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://script.google.com/macros/s/AKfycbwgPyFKrGIxLvzf93uBuKRdlT7yYINKc6C4AOMjji-Iw05QcuKTGrfehpCKpplRauBu/exec?action=get_all_data"

print("Fetching from Web App...")
try:
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
        html = response.read().decode('utf-8')
        print("Response received:")
        data = json.loads(html)
        print(f"Status: {data.get('status')}")
        if data.get('status') == 'success':
            print(f"Anggota count: {len(data.get('anggota', []))}")
            print(f"Transaksi count: {len(data.get('transaksi', []))}")
            print(f"Kas count: {len(data.get('kas', []))}")
            print(f"Proker count: {len(data.get('proker', []))}")
        else:
            print("Message:", data.get('message'))
except Exception as e:
    print("Error fetching:", str(e))
