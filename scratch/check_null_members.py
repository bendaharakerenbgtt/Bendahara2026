import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://script.google.com/macros/s/AKfycbzc4KjFANk2dGnw18Vw07aXlJ8BLJ1-VrAPQ2Oj35v0LnmLennIA19Z5eJIyLl4N1ad/exec?action=get_all_data"

try:
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
        data = json.loads(response.read().decode('utf-8'))
        members = data.get('anggota', [])
        print("Checking members for null/empty values:")
        for idx, m in enumerate(members):
            name = m.get('name')
            nim = m.get('nim')
            if name is None or name == "":
                print(f"Index {idx}: Name is None or empty! ID={m.get('id')}")
            if nim is None or nim == "":
                print(f"Index {idx}: NIM is None or empty! ID={m.get('id')}, Name={name}")
except Exception as e:
    print("Error:", str(e))
