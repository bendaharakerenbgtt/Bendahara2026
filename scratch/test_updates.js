const URL = "https://script.google.com/macros/s/AKfycbwgPyFKrGIxLvzf93uBuKRdlT7yYINKc6C4AOMjji-Iw05QcuKTGrfehpCKpplRauBu/exec";

async function testActions() {
  console.log("--- Testing Web App Actions ---");
  
  try {
    const res = await fetch(URL, {
      method: "POST",
      body: JSON.stringify({ action: "edit_member", id: "1", nama: "Hafiz Alfariz" })
    });
    console.log("edit_member response:", await res.text());
  } catch (e) {
    console.error("edit_member ERROR:", e);
  }

  try {
    const res = await fetch(URL, {
      method: "POST",
      body: JSON.stringify({ action: "edit_transaction", id: "1", keterangan: "Test Edit Keterangan" })
    });
    console.log("edit_transaction response:", await res.text());
  } catch (e) {
    console.error("edit_transaction ERROR:", e);
  }
}

testActions();
