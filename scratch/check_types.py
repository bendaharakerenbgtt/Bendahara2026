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
        if members:
            m = members[0]
            print(f"Sample Member: {m}")
            print(f"Type of name: {type(m.get('name'))}")
            print(f"Type of nim: {type(m.get('nim'))}")
except Exception as e:
    print("Error:", str(e))
