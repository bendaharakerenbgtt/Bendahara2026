import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://script.google.com/macros/s/AKfycbzc4KjFANk2dGnw18Vw07aXlJ8BLJ1-VrAPQ2Oj35v0LnmLennIA19Z5eJIyLl4N1ad/exec"

print("--- Testing insert_member ---")
payload_insert = {
    "action": "insert_member",
    "nim": "123456789",
    "nama": "Test Member Python",
    "divisi": "Divisi UUS",
    "jabatan": "Anggota"
}

try:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload_insert).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        method='POST'
    )
    with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
        html = response.read().decode('utf-8')
        print("Response received for insert:")
        print(html)
except Exception as e:
    print("Error during insert:", str(e))

print("\n--- Testing edit_member ---")
payload_edit = {
    "action": "edit_member",
    "id": "1", # Hafiz Alfariz
    "nim": "2490444040",
    "nama": "Hafiz Alfariz",
    "divisi": "Pimpinan Utama",
    "jabatan": "Ketua Umum",
    "is_active": False
}

try:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload_edit).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        method='POST'
    )
    with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
        html = response.read().decode('utf-8')
        print("Response received for edit:")
        print(html)
except Exception as e:
    print("Error during edit:", str(e))
