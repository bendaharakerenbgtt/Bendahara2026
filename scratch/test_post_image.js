const testPayload = {
  action: "insert_transaction",
  tanggal: "2026-08-05",
  keterangan: "Test Upload Gambar",
  user_id: "1",
  nominal: 10000,
  metode: "Tunai",
  kategori: "Kas Bulanan",
  status_reimburse: "Tidak Perlu",
  bukti: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
};

fetch("https://script.google.com/macros/s/AKfycbwgPyFKrGIxLvzf93uBuKRdlT7yYINKc6C4AOMjji-Iw05QcuKTGrfehpCKpplRauBu/exec", {
  method: "POST",
  body: JSON.stringify(testPayload)
})
.then(res => res.json())
.then(data => console.log("POST RESPONSE:", data))
.catch(err => console.error("POST ERROR:", err));
