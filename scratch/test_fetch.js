fetch("https://script.google.com/macros/s/AKfycbwgPyFKrGIxLvzf93uBuKRdlT7yYINKc6C4AOMjji-Iw05QcuKTGrfehpCKpplRauBu/exec?action=get_all_data")
  .then(res => res.json())
  .then(data => {
    console.log("STATUS:", data.status);
    console.log("ANGGOTA:", data.anggota ? data.anggota.length : 0);
    console.log("TRANSAKSI:", data.transaksi ? data.transaksi.length : 0);
    console.log("KAS:", data.kas ? data.kas.length : 0);
    console.log("PROKER:", data.proker ? data.proker.length : 0);
    if (data.anggota && data.anggota.length > 0) {
      console.log("FIRST ANGGOTA:", data.anggota[0]);
    }
  })
  .catch(err => console.error("ERROR:", err));
