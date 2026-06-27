// ============================================================
// GOOGLE APPS SCRIPT — DANAIMIP BACKEND (MIGRASI 3 SHEET - V4)
// Paste seluruh kode ini ke Google Apps Script editor Anda.
// Hapus semua kode lama dan paste ini agar tidak ada duplikasi fungsi!
// ============================================================

// ============================================================
// FUNGSI UNTUK OTORISASI GOOGLE DRIVE
// Jalankan fungsi ini sekali saja di editor (klik Run/Jalankan) 
// untuk memunculkan popup izin akses Google Drive!
// ============================================================
function testDriveAccess() {
  const folders = DriveApp.getFoldersByName("bukti transaksi");
  Logger.log("Akses Drive OK! Ada folder: " + folders.hasNext());
}

const SHEET_NAME_ANGGOTA     = "anggota";
const SHEET_NAME_TRANSAKSI   = "transaksi";
const SHEET_NAME_KEGIATAN    = "kegiatan";

// Default header fallback jika spreadsheet kosong/tidak memiliki header
const defaultTransactionHeaders = [
  "id_transaksi", "tanggal", "keterangan", "id_anggota", "id_kegiatan", 
  "jenis", "metode", "kategori", "nominal", "catatan", "status_reimburse", "created_at", "updated_at"
];

const defaultProkerHeaders = [
  "id_kegiatan", "nama_kegiatan", "jenis", "divisi", "id_anggota", 
  "estimasi_tanggal", "tahun", "status", "estimasi_dana", "created_at", "updated_at"
];

const defaultAnggotaHeaders = [
  "id_anggota", "nim", "nama", "divisi", "jabatan", "created_at", "updated_at", "is_active"
];

// ============================================================
// GET REQUEST — Ambil semua data & Hubungkan Ke Data Base Baru
// ============================================================
function doGet(e) {
  const action = e.parameter.action;

  try {
    if (action === "get_all_data") {
      return getAllData();
    }
    if (action === "get_raw_rows") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);
      const data = sheet.getDataRange().getValues();
      return jsonResponse({ status: "success", data: data.slice(0, 200) });
    }
    if (action === "diagnose_sheets") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheets = ss.getSheets();
      const diag = {};
      sheets.forEach(s => {
        const name = s.getName();
        const r = s.getDataRange().getValues();
        diag[name] = {
          headers: (r[0] || []).map(h => h.toString()),
          firstRow: (r[1] || []).map(v => v.toString())
        };
      });
      return jsonResponse({ status: "success", data: diag });
    }
    return jsonResponse({ status: "error", message: "Action tidak dikenal: " + action });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

function getAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Bersihkan kolom duplikat/korup di kanan transaksi sheet
  cleanDuplicateColumns(ss);

  // Bersihkan baris kosong/korup terlebih dahulu agar database rapi
  purgeEmptyIdRows(ss);

  // 1. Sheet ANGGOTA → Peta ke format front-end { id, nim, name, divisi, jabatan }
  const anggotaSheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_ANGGOTA);
  const anggotaRaw   = sheetToJson(anggotaSheet);
  const anggotaData  = anggotaRaw.map(m => {
    return {
      id: getVal(m, "id_anggota") !== undefined ? getVal(m, "id_anggota") : (getVal(m, "id") || ""),
      nim: getVal(m, "nim") || "",
      name: getVal(m, "nama") !== undefined ? getVal(m, "nama") : (getVal(m, "name") || ""),
      divisi: getVal(m, "divisi") || "",
      jabatan: getVal(m, "jabatan") || "Anggota",
      created_at: getVal(m, "created_at") || "",
      updated_at: getVal(m, "updated_at") || "",
      is_active: getVal(m, "is_active") !== undefined ? (String(getVal(m, "is_active")).toLowerCase() !== "false" && getVal(m, "is_active") !== false) : true
    };
  });

  // 2. Sheet TRANSAKSI → Peta ke format front-end
  const transaksiSheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);
  // Auto-heal sheet headers to make sure status_reimburse exists in the spreadsheet
  healSheetHeaders(transaksiSheet, defaultTransactionHeaders);

  const transaksiRaw   = sheetToJson(transaksiSheet);
  const transaksiData  = transaksiRaw.map(t => {
    const catatanVal   = getVal(t, "catatan") || "";
    let proofUrl = "";
    
    // Extract URL if present in catatan
    const urlMatch = catatanVal.match(/https?:\/\/[^\s)]+/);
    if (urlMatch) {
      proofUrl = urlMatch[0];
    } else if (catatanVal.startsWith("data:image")) {
      proofUrl = catatanVal;
    } else {
      proofUrl = getVal(t, "bukti") || "";
    }
    
    // Default status_reimburse jika kolomnya tidak ada di database baru atau kosong
    let statusReimburse = getVal(t, "status_reimburse");
    if (statusReimburse === undefined || statusReimburse === null || statusReimburse.toString().trim() === "") {
      statusReimburse = "Tidak Perlu";
    }
    
    // Keep the original raw value of catatan to show description details (e.g. month info)
    const cleanCatatan = catatanVal;
    
    return {
      id: getVal(t, "id_transaksi") !== undefined ? getVal(t, "id_transaksi") : (getVal(t, "id") || ""),
      tanggal: getVal(t, "tanggal") || "",
      keterangan: getVal(t, "keterangan") || "",
      user_id: getVal(t, "id_anggota") !== undefined ? getVal(t, "id_anggota") : (getVal(t, "user_id") || ""),
      proker_id: (() => {
        const val = getVal(t, "id_kegiatan") !== undefined ? getVal(t, "id_kegiatan") : getVal(t, "proker_id");
        if (val === undefined || val === null) return "";
        const valStr = val.toString().trim();
        return valStr.toLowerCase() === "null" ? "" : valStr;
      })(),
      jenis: getVal(t, "jenis") || "Keluar",
      metode: getVal(t, "metode") || "Tunai",
      kategori: getVal(t, "kategori") || "Umum",
      nominal: parseFormattedNumber(getVal(t, "nominal")),
      catatan: cleanCatatan,
      bukti: proofUrl,
      status_reimburse: statusReimburse,
      nama_pic_pengeluar: getVal(t, "nama_pic_pengeluar") || "",
      created_at: getVal(t, "created_at") || "",
      updated_at: getVal(t, "updated_at") || ""
    };
  });

  // 3. Sheet KEGIATAN → Peta ke format front-end (proker)
  const kegiatanSheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_KEGIATAN);
  const kegiatanRaw   = sheetToJson(kegiatanSheet);
  const prokerData    = kegiatanRaw.map(k => {
    let statusVal = getVal(k, "status") || "Running";
    if (statusVal.toString().trim() === "Berjalan") {
      statusVal = "Running";
    }
    return {
      id: getVal(k, "id_kegiatan") !== undefined ? getVal(k, "id_kegiatan") : (getVal(k, "id") || ""),
      nama_proker: getVal(k, "nama_kegiatan") !== undefined ? getVal(k, "nama_kegiatan") : (getVal(k, "nama_proker") || ""),
      status: statusVal,
      estimasi_dana: parseFormattedNumber(getVal(k, "estimasi_dana")),
      jenis: getVal(k, "jenis") || "",
      divisi: getVal(k, "divisi") || "",
      id_anggota: getVal(k, "id_anggota") || "",
      estimasi_tanggal: getVal(k, "estimasi_tanggal") || "",
      tahun: getVal(k, "tahun") || "",
      created_at: getVal(k, "created_at") || "",
      updated_at: getVal(k, "updated_at") || ""
    };
  });

  // 4. Generate KAS array secara dinamis dari transaksi kas bulanan yang telah diverifikasi
  const kasData = [];
  let kasIdCounter = 1;

  anggotaData.forEach(member => {
    // Ambil semua transaksi kas yang disetujui untuk anggota ini
    const memberTxList = transaksiData.filter(t => {
      const catLower = (t.kategori || "").toLowerCase();
      const ketLower = (t.keterangan || "").toLowerCase();
      const isKas = catLower.includes("kas pengurus") || 
                    catLower.includes("kas pengerus") || 
                    catLower.includes("kas bulanan") || 
                    catLower === "uang kas" || 
                    catLower === "kas" ||
                    ketLower.includes("kas pengurus") ||
                    ketLower.includes("kas pengerus") ||
                    ketLower.includes("bayar kas") ||
                    ketLower.startsWith("kas ");
      const isApproved = (t.status_reimburse === "Tidak Perlu");
      return isKas && isApproved && isTransactionForMember(t, member);
    });

    // Urutkan transaksi berdasarkan ID transaksi secara kronologis
    memberTxList.sort((a, b) => {
      const idA = a.id ? a.id.toString() : "";
      const idB = b.id ? b.id.toString() : "";
      return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
    });

    const unpaidMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    const allocatedMonths = [];

    // Pass 1: Alokasikan transaksi yang menyebutkan bulan secara eksplisit di keterangan atau catatan
    memberTxList.forEach(t => {
      const combinedText = (t.keterangan || "") + " " + (t.catatan || "");
      const extracted = extractMonthsFromText(combinedText);
      extracted.forEach(bulan => {
        if (unpaidMonths.indexOf(bulan) !== -1) {
          allocatedMonths.push({ bulan: bulan, txId: t.id });
          const idx = unpaidMonths.indexOf(bulan);
          unpaidMonths.splice(idx, 1);
        }
      });
    });

    // Pass 2: Jumlahkan nominal dari transaksi tanpa bulan eksplisit
    let totalNominalWithoutMonths = 0;
    memberTxList.forEach(t => {
      const combinedText = (t.keterangan || "") + " " + (t.catatan || "");
      const extracted = extractMonthsFromText(combinedText);
      if (extracted.length === 0) {
        totalNominalWithoutMonths += (Number(t.nominal) || 0);
      }
    });

    // Hitung berapa bulan yang dibayar dari nominal gabungan (1 bulan = Rp10.000)
    const count = Math.floor(totalNominalWithoutMonths / 10000);
    for (let i = 0; i < count; i++) {
      if (unpaidMonths.length > 0) {
        const bulan = unpaidMonths.shift();
        // Asosiasikan dengan transaksi non-spesifik pertama yang berkontribusi
        const associatedTx = memberTxList.find(t => {
          const combinedText = (t.keterangan || "") + " " + (t.catatan || "");
          return extractMonthsFromText(combinedText).length === 0;
        });
        const txId = associatedTx ? associatedTx.id : "";
        allocatedMonths.push({ bulan: bulan, txId: txId });
      }
    }

    // Generate objek kas untuk kompatibilitas frontend
    allocatedMonths.forEach(item => {
      kasData.push({
        id: kasIdCounter++,
        transaksi_id: item.txId,
        user_id: member.id,
        bulan: item.bulan,
        nominal_bulan: 10000
      });
    });
  });

  return jsonResponse({
    status: "success",
    anggota:   anggotaData,
    transaksi: transaksiData,
    kas:       kasData,
    proker:    prokerData
  });
}

// ============================================================
// POST REQUEST — Semua operasi CRUD
// ============================================================
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action  = payload.action;

    if (action === "insert_transaction")        return insertTransaction(payload);
    if (action === "delete_transaction")        return deleteTransaction(payload);
    if (action === "edit_transaction")          return editTransaction(payload);
    if (action === "approve_transaction")       return approveTransaction(payload);
    if (action === "reject_transaction")        return rejectTransaction(payload);
    if (action === "insert_proker")             return insertProker(payload);
    if (action === "edit_proker")               return editProker(payload);
    if (action === "update_proker_status")      return updateProkerStatus(payload);
    if (action === "delete_proker")             return deleteProker(payload);
    if (action === "edit_transaction_relation") return editTransactionRelation(payload);
    if (action === "insert_member")             return insertMember(payload);
    if (action === "edit_member")               return editMember(payload);

    return jsonResponse({ status: "error", message: "Action tidak dikenal: " + action });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// ============================================================
// TRANSAKSI — Insert (Dinamis sesuai header kolom)
// ============================================================
function insertTransaction(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);

  // Auto-heal sheet headers to make sure status_reimburse exists in the spreadsheet
  healSheetHeaders(sheet, defaultTransactionHeaders);

  // Tentukan jenis otomatis dari kategori
  const catLower = (p.kategori || "").toLowerCase();
  const ketLower = (p.keterangan || "").toLowerCase();
  const isKasPayment = catLower.includes("kas pengurus") || 
                       catLower.includes("kas pengerus") || 
                       catLower.includes("kas bulanan") || 
                       catLower === "uang kas" || 
                       catLower === "kas" ||
                       ketLower.includes("kas pengurus") ||
                       ketLower.includes("kas pengerus") ||
                       ketLower.includes("bayar kas") ||
                       ketLower.startsWith("kas ");

  const isIncome = isKasPayment || 
                   catLower.includes("htm") || 
                   catLower.includes("donasi") || 
                   ketLower.includes("htm") || 
                   ketLower.includes("donasi");

  const jenis = p.jenis || (isIncome ? "Masuk" : "Keluar");
  const today = new Date().toISOString().substring(0, 10);

  // Save image to Google Drive if it's base64
  let driveUrl = "";
  if (p.bukti && p.bukti.toString().startsWith("data:image")) {
    const nextId = getNextTransactionId(sheet);
    driveUrl = saveImageToDrive(p.bukti, nextId);
  } else {
    driveUrl = p.bukti || "";
  }

  const memberName = getMemberNameById(ss, p.user_id);
  const parsedNominal = parseFormattedNumber(p.nominal);

  // Jika ini adalah pembayaran kas bulanan, dan nominalnya lebih besar dari 10.000,
  // pecah transaksi ini menjadi entri terpisah masing-masing Rp10.000 (satu baris per bulan).
  if (isKasPayment && parsedNominal > 10000) {
    let months = [];
    const match = (p.keterangan || "").match(/\(([^)]+)\)/);
    if (match) {
      months = match[1].split(",").map(b => b.trim());
    } else {
      // Jika tidak ada bulan eksplisit, cari bulan yang belum dibayar untuk member ini
      const unpaid = getUnpaidMonthsForMember(ss, p.user_id);
      const count = Math.round(parsedNominal / 10000);
      for (let i = 0; i < count; i++) {
        if (unpaid.length > 0) {
          months.push(unpaid.shift());
        } else {
          months.push("Kas"); // fallback label jika lunas
        }
      }
    }

    let lastInsertedId = null;
    months.forEach((m) => {
      // Generate ID otomatis per sub-transaksi secara cerdas (mendukung prefix "TRX" dll)
      const newId = getNextTransactionId(sheet);

      // Keterangan: "Kas [Name]"
      const finalKet = memberName ? "Kas " + memberName : (p.keterangan || "Kas Anggota");
      // Catatan: "Kas Bulan [Bulan] (Bukti: [Drive URL])"
      const finalCatatan = "Kas Bulan " + m + (driveUrl ? " (Bukti: " + driveUrl + ")" : "");

      const txObj = {
        id_transaksi: newId,
        id: newId,
        tanggal: p.tanggal || today,
        keterangan: finalKet,
        id_anggota: p.user_id !== undefined ? p.user_id : "",
        user_id: p.user_id !== undefined ? p.user_id : "",
        proker_id: p.proker_id !== undefined ? p.proker_id : "",
        jenis: jenis,
        metode: p.metode || "Tunai",
        kategori: "Kas Pengurus",
        nominal: 10000, // Simpan Rp10.000 per baris
        catatan: finalCatatan,
        status_reimburse: p.status_reimburse || "Belum",
        nama_pic_pengeluar: p.nama_pic_pengeluar !== undefined ? p.nama_pic_pengeluar : "",
        created_at: today,
        updated_at: today
      };

      appendRowByHeader(sheet, txObj, defaultTransactionHeaders);
      lastInsertedId = newId;
    });

    // Kirim notifikasi Firebase FCM (HTTP v1)
    kirimNotifikasiFirebaseV1(
      "Transaksi Masuk!",
      "Pembayaran kas baru dari " + (memberName || "Anggota") + " senilai Rp " + Number(parsedNominal).toLocaleString('id-ID')
    );

    return jsonResponse({ status: "success", id: lastInsertedId });
  }

  // Fallback normal untuk transaksi non-kas atau nominal <= 10.000
  const newId = getNextTransactionId(sheet);

  let finalKet = p.keterangan || "";
  let finalCatatan = p.catatan || "";
  if (driveUrl) {
    if (finalCatatan) {
      finalCatatan += " (Bukti: " + driveUrl + ")";
    } else {
      finalCatatan = driveUrl;
    }
  }

  if (isKasPayment) {
    finalKet = memberName ? "Kas " + memberName : (p.keterangan || "Kas Anggota");
    
    // Extract month for normal single payment
    let m = "Kas";
    const monthsFound = extractMonthsFromText(p.keterangan);
    if (monthsFound.length > 0) {
      m = monthsFound[0];
    } else {
      const unpaid = getUnpaidMonthsForMember(ss, p.user_id);
      if (unpaid.length > 0) {
        m = unpaid[0];
      }
    }
    finalCatatan = "Kas Bulan " + m + (driveUrl ? " (Bukti: " + driveUrl + ")" : "");
  }

  const txObj = {
    id_transaksi: newId,
    id: newId,
    tanggal: p.tanggal || today,
    keterangan: finalKet,
    id_anggota: p.user_id !== undefined ? p.user_id : "",
    user_id: p.user_id !== undefined ? p.user_id : "",
    proker_id: p.proker_id !== undefined ? p.proker_id : "",
    jenis: jenis,
    metode: p.metode || "Tunai",
    kategori: isKasPayment ? "Kas Pengurus" : (p.kategori || "Umum"),
    nominal: parsedNominal,
    catatan: finalCatatan,
    status_reimburse: p.status_reimburse || "Belum",
    nama_pic_pengeluar: p.nama_pic_pengeluar !== undefined ? p.nama_pic_pengeluar : "",
    created_at: today,
    updated_at: today
  };

  appendRowByHeader(sheet, txObj, defaultTransactionHeaders);

  // Kirim notifikasi Firebase FCM (HTTP v1)
  kirimNotifikasiFirebaseV1(
    "Transaksi Masuk!",
    "Ada transaksi baru: " + txObj.keterangan + " senilai Rp " + Number(parsedNominal).toLocaleString('id-ID')
  );

  return jsonResponse({ status: "success", id: newId });
}

// ============================================================
// TRANSAKSI — Delete
// ============================================================
function deleteTransaction(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);
  const deleted = deleteRowById(sheet, p.id);
  return jsonResponse({ status: deleted ? "success" : "error", message: deleted ? "Dihapus" : "ID tidak ditemukan" });
}

// ============================================================
// TRANSAKSI — Approve (ubah status_reimburse → "Tidak Perlu")
// ============================================================
function approveTransaction(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);
  const updated = updateColumnById(sheet, p.id, "status_reimburse", "Tidak Perlu");
  return jsonResponse({ status: updated ? "success" : "error" });
}

// ============================================================
// TRANSAKSI — Reject (hapus transaksi)
// ============================================================
function rejectTransaction(p) {
  return deleteTransaction(p);
}

// ============================================================
// TRANSAKSI — Edit relasi proker/kategori
// ============================================================
function editTransactionRelation(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);

  if (p.kategori !== undefined) updateColumnById(sheet, p.id, "kategori", p.kategori);
  if (p.proker_id !== undefined) updateColumnById(sheet, p.id, "proker_id", p.proker_id);

  return jsonResponse({ status: "success" });
}

// ============================================================
// PROKER / KEGIATAN — Insert
// ============================================================
function insertProker(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_KEGIATAN);

  const lastRow = sheet.getLastRow();
  const newId = lastRow <= 1 ? 1 : Number(sheet.getRange(lastRow, 1).getValue() || 0) + 1;
  const today = new Date().toISOString().substring(0, 10);

  const prokerObj = {
    id_kegiatan: newId,
    nama_kegiatan: p.nama_proker || "",
    jenis: p.jenis || "Program Kerja",
    divisi: p.divisi || "",
    id_anggota: p.id_anggota || "",
    estimasi_tanggal: p.estimasi_tanggal || "",
    tahun: p.tahun || new Date().getFullYear().toString(),
    status: p.status || "Running",
    estimasi_dana: parseFormattedNumber(p.estimasi_dana),
    created_at: today,
    updated_at: today
  };

  appendRowByHeader(sheet, prokerObj, defaultProkerHeaders);

  return jsonResponse({ status: "success", id: newId });
}

// ============================================================
// PROKER / KEGIATAN — Edit
// ============================================================
function editProker(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_KEGIATAN);

  if (p.nama_proker       !== undefined) updateColumnById(sheet, p.id, "nama_kegiatan", p.nama_proker);
  if (p.estimasi_dana     !== undefined) updateColumnById(sheet, p.id, "estimasi_dana", parseFormattedNumber(p.estimasi_dana));
  if (p.jenis             !== undefined) updateColumnById(sheet, p.id, "jenis", p.jenis);
  if (p.divisi            !== undefined) updateColumnById(sheet, p.id, "divisi", p.divisi);
  if (p.id_anggota        !== undefined) updateColumnById(sheet, p.id, "id_anggota", p.id_anggota);
  if (p.estimasi_tanggal  !== undefined) updateColumnById(sheet, p.id, "estimasi_tanggal", p.estimasi_tanggal);
  if (p.tahun             !== undefined) updateColumnById(sheet, p.id, "tahun", p.tahun);

  return jsonResponse({ status: "success" });
}

// ============================================================
// PROKER / KEGIATAN — Update status
// ============================================================
function updateProkerStatus(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_KEGIATAN);
  const updated = updateColumnById(sheet, p.id, "status", p.status);
  return jsonResponse({ status: updated ? "success" : "error" });
}

// ============================================================
// PROKER / KEGIATAN — Delete
// ============================================================
function deleteProker(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_KEGIATAN);
  const deleted = deleteRowById(sheet, p.id);
  return jsonResponse({ status: deleted ? "success" : "error" });
}


// ============================================================
// HELPER FUNCTIONS (ROBUST & DYNAMIC BY COLUMN HEADER)
// ============================================================

/** Dapatkan sheet secara case-insensitive */
function getSheetByNameCaseInsensitive(ss, name) {
  if (!ss) return null;
  const sheets = ss.getSheets();
  const target = name.toLowerCase();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === target) {
      return sheets[i];
    }
  }
  return ss.getSheetByName(name); // fallback
}

/** Dapatkan indeks kolom ID yang benar berdasarkan nama sheet */
function getIdColumnIndex(headers, sheet) {
  const sheetName = sheet ? sheet.getName().toLowerCase() : "";
  let targetIdHeader = "";
  if (sheetName.includes("transaksi")) {
    targetIdHeader = "id_transaksi";
  } else if (sheetName.includes("kegiatan") || sheetName.includes("proker")) {
    targetIdHeader = "id_kegiatan";
  } else if (sheetName.includes("anggota") || sheetName.includes("user")) {
    targetIdHeader = "id_anggota";
  }
  
  if (targetIdHeader) {
    const idx = headers.indexOf(targetIdHeader);
    if (idx !== -1) return idx;
  }
  
  const exactId = headers.indexOf("id");
  if (exactId !== -1) return exactId;
  
  for (const key of ["id_transaksi", "id_kegiatan", "id_anggota"]) {
    const idx = headers.indexOf(key);
    if (idx !== -1) return idx;
  }
  
  const prefixId = headers.findIndex(h => h.startsWith("id_") || h.startsWith("id "));
  if (prefixId !== -1) return prefixId;
  
  return headers.findIndex(h => h.includes("id"));
}

/** Dapatkan nilai dari object berdasarkan key case-insensitive dengan spasi/underscore */
function getVal(obj, key) {
  if (!obj) return undefined;
  const target = key.toLowerCase();
  const keyUnderscore = target.replace(/ /g, "_");
  const keySpace = target.replace(/_/g, " ");
  
  if (obj[keyUnderscore] !== undefined) return obj[keyUnderscore];
  if (obj[keySpace] !== undefined) return obj[keySpace];
  if (obj[target] !== undefined) return obj[target];
  
  return undefined;
}

/** Konversi sheet ke array of objects berdasarkan baris header secara dinamis */
function sheetToJson(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase());
  const idCol = getIdColumnIndex(headers, sheet);
  
  const result = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    // Abaikan jika baris sepenuhnya kosong
    const isBlank = row.every(val => val === "" || val === null || val === undefined);
    if (isBlank) continue;
    
    // Abaikan jika kolom ID utama kosong (mencegah formatted/empty rows terbaca)
    let idVal = "";
    if (idCol !== -1) {
      idVal = row[idCol] !== undefined && row[idCol] !== null ? row[idCol].toString().trim() : "";
    } else {
      idVal = row[0] !== undefined && row[0] !== null ? row[0].toString().trim() : "";
    }
    if (idVal === "") {
      continue;
    }
    
    const obj = {};
    headers.forEach((h, i) => { 
      if (h !== "") {
        obj[h] = row[i]; 
      }
    });
    result.push(obj);
  }
  return result;
}

/** Menulis baris ke sheet berdasarkan pemetaan nama header secara dinamis */
function appendRowByHeader(sheet, obj, defaultHeaders) {
  if (!sheet) return;
  
  let headers = [];
  const lastCol = sheet.getLastColumn();
  if (lastCol > 0) {
    headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim().toLowerCase());
  }
  
  // Jika sheet kosong / tidak memiliki header, buat baris headernya
  if (headers.length === 0 && defaultHeaders) {
    sheet.appendRow(defaultHeaders);
    headers = defaultHeaders.map(h => h.toString().trim().toLowerCase());
  }
  
  // Buat baris data baru sesuai urutan header
  const rowData = headers.map(h => {
    const val = getVal(obj, h);
    if (val !== undefined) return val;
    
    // Aliases fallbacks
    if (h === "catatan" || h === "bukti") {
      const b = getVal(obj, "bukti") || getVal(obj, "catatan");
      if (b !== undefined) return b;
    }
    if (h === "id_anggota" || h === "id anggota" || h === "user_id") {
      const u = getVal(obj, "user_id") || getVal(obj, "id_anggota") || getVal(obj, "id anggota");
      if (u !== undefined) return u;
    }
    if (h === "id_transaksi" || h === "id transaksi" || h === "id") {
      const t = getVal(obj, "id_transaksi") || getVal(obj, "id transaksi") || getVal(obj, "id");
      if (t !== undefined) return t;
    }
    if (h === "id_kegiatan" || h === "id kegiatan" || h === "proker_id" || h === "proker id") {
      const k = getVal(obj, "id_kegiatan") || getVal(obj, "proker_id") || getVal(obj, "proker id");
      if (k !== undefined) return k;
    }
    
    return "";
  });
  
  sheet.appendRow(rowData);
}

/** Hapus baris berdasarkan nilai kolom ID secara dinamis */
function deleteRowById(sheet, id) {
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return false;
  
  const headers = data[0].map(h => h.toString().trim().toLowerCase());
  const idCol = getIdColumnIndex(headers, sheet);
  if (idCol === -1) return false;

  for (let i = data.length - 1; i >= 1; i--) {
    if (safeCompareIds(data[i][idCol], id)) {
      // Cari kolom catatan atau bukti untuk mendeteksi file Drive
      const catatanCol = headers.indexOf("catatan");
      const buktiCol = headers.indexOf("bukti");
      let fileUrl = "";
      if (catatanCol !== -1) fileUrl = data[i][catatanCol];
      if (!fileUrl && buktiCol !== -1) fileUrl = data[i][buktiCol];
      
      // Jika ditemukan URL file Drive, hapus filenya jika tidak digunakan oleh baris lain
      if (fileUrl) {
        const fileIdToDelete = extractDriveFileId(fileUrl.toString());
        if (fileIdToDelete) {
          let isShared = false;
          for (let r = 1; r < data.length; r++) {
            if (r === i) continue; // Lewati baris yang sedang dihapus
            let otherUrl = "";
            if (catatanCol !== -1) otherUrl = data[r][catatanCol];
            if (!otherUrl && buktiCol !== -1) otherUrl = data[r][buktiCol];
            if (otherUrl) {
              const otherFileId = extractDriveFileId(otherUrl.toString());
              if (otherFileId === fileIdToDelete) {
                isShared = true;
                break;
              }
            }
          }
          if (!isShared) {
            deleteDriveFileByUrl(fileUrl.toString());
          } else {
            Logger.log("File Drive tidak dihapus karena masih digunakan oleh baris lain: " + fileIdToDelete);
          }
        }
      }

      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

/** Ekstrak file ID dari URL Google Drive secara aman */
function extractDriveFileId(url) {
  if (!url) return "";
  const urlStr = url.toString().trim();
  const matchD = urlStr.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (matchD) return matchD[1];
  const matchId = urlStr.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId) return matchId[1];
  return "";
}

/** Hapus file di Google Drive berdasarkan URL-nya */
function deleteDriveFileByUrl(url) {
  if (!url) return;
  try {
    const fileId = extractDriveFileId(url);
    if (fileId) {
      const file = DriveApp.getFileById(fileId);
      file.setTrashed(true);
      Logger.log("File berhasil dipindahkan ke sampah: " + fileId);
    }
  } catch (e) {
    Logger.log("Gagal menghapus file dari Drive: " + e.toString());
  }
}

/** Update nilai satu kolom pada baris yang id-nya cocok secara dinamis */
function updateColumnById(sheet, id, colName, newValue) {
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return false;
  
  const headers = data[0].map(h => h.toString().trim().toLowerCase());
  const idCol = getIdColumnIndex(headers, sheet);
  
  const targetColName = colName.toLowerCase();
  const colUnderscore = targetColName.replace(/ /g, "_");
  const colSpace = targetColName.replace(/_/g, " ");
  
  let col = headers.indexOf(colUnderscore);
  if (col === -1) col = headers.indexOf(colSpace);
  if (col === -1) col = headers.indexOf(targetColName);
  
  // Alias fallback for proker_id / id_kegiatan
  if (col === -1 && (targetColName === "proker_id" || targetColName === "proker id" || targetColName === "id_kegiatan" || targetColName === "id kegiatan")) {
    col = headers.indexOf("id_kegiatan");
    if (col === -1) col = headers.indexOf("proker_id");
  }
  
  if (idCol === -1 || col === -1) return false;

  for (let i = 1; i < data.length; i++) {
    if (safeCompareIds(data[i][idCol], id)) {
      sheet.getRange(i + 1, col + 1).setValue(newValue);
      return true;
    }
  }
  return false;
}

/** Bandingkan ID secara aman mengabaikan decimal float .0 dan whitespace */
function safeCompareIds(idA, idB) {
  if (idA === undefined || idA === null || idB === undefined || idB === null) return false;
  const strA = idA.toString().trim().replace(/\.0+$/, "");
  const strB = idB.toString().trim().replace(/\.0+$/, "");
  if (strA === "" || strB === "") return false;
  return strA === strB;
}

/** Dapatkan sisa bulan belum bayar atau pending untuk anggota */
function getUnpaidMonthsForMember(ss, memberId) {
  const transaksiSheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);
  const transaksiRaw   = sheetToJson(transaksiSheet);
  
  const memberName = getMemberNameById(ss, memberId);
  const member = { id: memberId, name: memberName };
  
  const unpaidMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  const allocatedMonths = [];

  const memberTxList = transaksiRaw.filter(t => {
    const catLower = (getVal(t, "kategori") || "").toLowerCase();
    const ketLower = (getVal(t, "keterangan") || "").toLowerCase();
    const isKas = catLower.includes("kas pengurus") || 
                  catLower.includes("kas pengerus") || 
                  catLower.includes("kas bulanan") || 
                  catLower === "uang kas" || 
                  catLower === "kas" ||
                  ketLower.includes("kas pengurus") ||
                  ketLower.includes("kas pengerus") ||
                  ketLower.includes("bayar kas") ||
                  ketLower.startsWith("kas ");
                  
    const tMapped = {
      id: getVal(t, "id_transaksi") !== undefined ? getVal(t, "id_transaksi") : (getVal(t, "id") || ""),
      user_id: getVal(t, "id_anggota") !== undefined ? getVal(t, "id_anggota") : (getVal(t, "user_id") || ""),
      keterangan: getVal(t, "keterangan") || "",
      catatan: getVal(t, "catatan") || "",
      nominal: parseFormattedNumber(getVal(t, "nominal"))
    };
    
    return isKas && isTransactionForMember(tMapped, member);
  });

  memberTxList.sort((a, b) => {
    const idA = (getVal(a, "id_transaksi") !== undefined ? getVal(a, "id_transaksi") : (getVal(a, "id") || "")).toString();
    const idB = (getVal(b, "id_transaksi") !== undefined ? getVal(b, "id_transaksi") : (getVal(b, "id") || "")).toString();
    return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
  });

  memberTxList.forEach(t => {
    const ket = getVal(t, "keterangan") || "";
    const cat = getVal(t, "catatan") || "";
    const combinedText = ket + " " + cat;
    const extracted = extractMonthsFromText(combinedText);
    extracted.forEach(bulan => {
      if (unpaidMonths.indexOf(bulan) !== -1) {
        allocatedMonths.push(bulan);
        const idx = unpaidMonths.indexOf(bulan);
        unpaidMonths.splice(idx, 1);
      }
    });
  });

  let totalNominalWithoutMonths = 0;
  memberTxList.forEach(t => {
    const ket = getVal(t, "keterangan") || "";
    const cat = getVal(t, "catatan") || "";
    const combinedText = ket + " " + cat;
    const extracted = extractMonthsFromText(combinedText);
    if (extracted.length === 0) {
      totalNominalWithoutMonths += parseFormattedNumber(getVal(t, "nominal"));
    }
  });

  const count = Math.floor(totalNominalWithoutMonths / 10000);
  for (let i = 0; i < count; i++) {
    if (unpaidMonths.length > 0) {
      const bulan = unpaidMonths.shift();
      allocatedMonths.push(bulan);
    }
  }

  const allMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  return allMonths.filter(m => allocatedMonths.indexOf(m) === -1);
}

/** Dapatkan ID transaksi berikutnya secara otomatis dengan mendeteksi prefix huruf (seperti TRX) */
function getNextTransactionId(sheet) {
  if (!sheet) return "TRX001";
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return "TRX001";
  
  // Baca nilai dari sel ID terakhir (baris terakhir, kolom pertama)
  const lastValStr = sheet.getRange(lastRow, 1).getValue().toString().trim();
  if (lastValStr === "") return "TRX001";
  
  // Regex untuk memisahkan prefix huruf dan angka di belakangnya
  const match = lastValStr.match(/^([A-Za-z]+)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const numStr = match[2];
    const nextNum = parseInt(numStr, 10) + 1;
    
    // Pad angka dengan 0 agar panjangnya minimal sama dengan sebelumnya (misal "009" -> "010")
    const paddedNum = nextNum.toString().padStart(numStr.length, '0');
    return prefix + paddedNum;
  }
  
  // Jika hanya berupa angka biasa
  const lastValNum = Number(lastValStr);
  if (!isNaN(lastValNum)) {
    return (lastValNum + 1).toString();
  }
  
  // Fallback jika format tidak dikenali
  return "TRX" + (lastRow).toString().padStart(3, '0');
}

/** Bungkus response JSON dengan CORS header */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Edit detail transaksi dari All-Transaksi.html */
function editTransaction(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);
  
  if (p.keterangan !== undefined) updateColumnById(sheet, p.id, "keterangan", p.keterangan);
  if (p.nominal    !== undefined) updateColumnById(sheet, p.id, "nominal", parseFormattedNumber(p.nominal));
  if (p.metode     !== undefined) updateColumnById(sheet, p.id, "metode", p.metode);
  
  return jsonResponse({ status: "success" });
}

/** Auto-heal spreadsheet headers to add missing default columns */
function healSheetHeaders(sheet, defaultHeaders) {
  if (!sheet) return;
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    sheet.appendRow(defaultHeaders);
    return;
  }
  
  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  const existingHeaders = headerRange.getValues()[0].map(h => h.toString().trim().toLowerCase());
  
  const missingHeaders = [];
  defaultHeaders.forEach(dh => {
    const dhLower = dh.toLowerCase();
    if (existingHeaders.indexOf(dhLower) === -1) {
      missingHeaders.push(dh);
    }
  });
  
  if (missingHeaders.length > 0) {
    const nextCol = lastCol + 1;
    const writeRange = sheet.getRange(1, nextCol, 1, missingHeaders.length);
    writeRange.setValues([missingHeaders]);
    SpreadsheetApp.flush();
  }
}

/** Decode base64 dan simpan ke Google Drive folder 'bukti transaksi' */
function saveImageToDrive(base64Data, transactionId) {
  if (!base64Data) return "";
  const base64Str = base64Data.toString().trim();
  if (!base64Str.startsWith("data:image")) {
    return base64Str;
  }
  
  try {
    const commaIndex = base64Str.indexOf(",");
    if (commaIndex === -1) {
      return base64Str;
    }
    
    const header = base64Str.substring(0, commaIndex);
    const base64Image = base64Str.substring(commaIndex + 1).replace(/\s/g, "");
    
    let contentType = "image/jpeg";
    const typeMatch = header.match(/data:([^;]+);/);
    if (typeMatch) {
      contentType = typeMatch[1];
    }
    
    const decoded = Utilities.base64Decode(base64Image);
    const ext = contentType.split("/")[1] || "jpg";
    const blob = Utilities.newBlob(decoded, contentType, "bukti_" + transactionId + "." + ext);
    
    const folderName = "bukti transaksi";
    let folder;
    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }
    
    const file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      Logger.log("Sharing restriction: " + e.toString());
    }
    
    const fileId = file.getId();
    return "https://drive.google.com/file/d/" + fileId + "/view?usp=drivesdk";
  } catch (err) {
    Logger.log("Error saving image to Drive: " + err.toString());
    const truncatedBase64 = base64Str.length > 200 ? base64Str.substring(0, 200) + "... (di-truncate)" : base64Str;
    return truncatedBase64 + " [DRIVE_ERROR: " + err.toString() + "]";
  }
}

/** Periksa apakah transaksi ditujukan untuk anggota tertentu secara aman */
function isTransactionForMember(t, member) {
  if (t.user_id && safeCompareIds(t.user_id, member.id)) {
    return true;
  }
  
  // Jika user_id kosong, coba lakukan pencocokan nama di kolom keterangan
  const tUserIdStr = t.user_id ? t.user_id.toString().trim().toUpperCase() : "";
  if (!t.user_id || tUserIdStr === "" || tUserIdStr === "NULL" || tUserIdStr === "0") {
    const ketLower = (t.keterangan || "").toLowerCase();
    const nameLower = (member.name || "").toLowerCase();
    const nameParts = nameLower.split(/\s+/).filter(part => part.length > 2);
    
    if (nameParts.length > 0) {
      const firstName = nameParts[0];
      const regex = new RegExp("\\b" + escapeRegExp(firstName) + "\\b", "i");
      if (regex.test(ketLower)) {
        return true;
      }
    }
  }
  return false;
}

/** Ambil nama anggota berdasarkan ID-nya */
function getMemberNameById(ss, memberId) {
  if (!memberId) return "";
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_ANGGOTA);
  const data = sheetToJson(sheet);
  const member = data.find(m => safeCompareIds(getVal(m, "id_anggota") || getVal(m, "id"), memberId));
  return member ? (getVal(member, "nama") || getVal(member, "name") || "") : "";
}

/** Mengekstrak bulan-bulan Indonesia/Inggris dari teks secara aman */
function extractMonthsFromText(text) {
  const textLower = (text || "").toLowerCase();
  const found = [];
  
  const indonesianMonthsMap = {
    'januari': 'Jan', 'februari': 'Feb', 'maret': 'Mar', 'april': 'Apr', 'mei': 'Mei', 'juni': 'Jun',
    'juli': 'Jul', 'agustus': 'Ags', 'september': 'Sep', 'oktober': 'Okt', 'november': 'Nov', 'desember': 'Des',
    'jan': 'Jan', 'feb': 'Feb', 'mar': 'Mar', 'apr': 'Apr', 'jun': 'Jun', 'jul': 'Jul', 'ags': 'Ags', 'agu': 'Ags',
    'sep': 'Sep', 'okt': 'Okt', 'nov': 'Nov', 'des': 'Des'
  };

  Object.keys(indonesianMonthsMap).forEach(key => {
    const regex = new RegExp("\\b" + escapeRegExp(key) + "\\b", "i");
    if (regex.test(textLower)) {
      const abbrev = indonesianMonthsMap[key];
      if (found.indexOf(abbrev) === -1) {
        found.push(abbrev);
      }
    }
  });

  return found;
}

/** Helper untuk meng-escape karakter regex */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Bersihkan baris-baris transaksi yang id-nya kosong atau baris sepenuhnya kosong */
function purgeEmptyIdRows(ss) {
  try {
    const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toString().trim().toLowerCase());
    const idCol = getIdColumnIndex(headers, sheet);
    if (idCol === -1) return;
    
    let deletedCount = 0;
    // Iterasi dari bawah ke atas agar indeks baris tidak bergeser saat dihapus
    for (let i = data.length - 1; i >= 1; i--) {
      const idVal = data[i][idCol] !== undefined && data[i][idCol] !== null ? data[i][idCol].toString().trim() : "";
      const isRowBlank = data[i].every(val => val === "" || val === null || val === undefined);
      
      if (idVal === "" || isRowBlank) {
        sheet.deleteRow(i + 1);
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      SpreadsheetApp.flush();
      Logger.log("Berhasil menghapus " + deletedCount + " baris kosong/korup.");
    }
  } catch (err) {
    Logger.log("Gagal melakukan purge baris kosong: " + err.toString());
  }
}

/** Bersihkan kolom duplikat yang berada di sebelah kanan (kolom 14 ke atas) */
function cleanDuplicateColumns(ss) {
  try {
    const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);
    if (!sheet) return;
    const lastCol = sheet.getLastColumn();
    if (lastCol <= 13) return; // Tidak ada kolom tambahan
    
    const maxColsToKeep = 13;
    const colsToDelete = lastCol - maxColsToKeep;
    
    sheet.deleteColumns(maxColsToKeep + 1, colsToDelete);
    SpreadsheetApp.flush();
    Logger.log("Berhasil membersihkan " + colsToDelete + " kolom duplikat/tambahan.");
  } catch (err) {
    Logger.log("Gagal membersihkan kolom duplikat: " + err.toString());
  }
}

/** Mengonversi string format mata uang rupiah (contoh: "Rp10,000", "Rp1.920,00") menjadi angka desimal murni secara robust */
function parseFormattedNumber(val) {
  if (val === undefined || val === null) return 0;
  
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val;
  }
  
  var str = val.toString().trim();
  if (str === "") return 0;
  
  // Bersihkan simbol Rp, rp, RP, spasi
  str = str.replace(/[Rr][Pp]\.?/g, "").replace(/\s+/g, "");
  
  var isNegative = false;
  if (str.indexOf("-") === 0) {
    isNegative = true;
    str = str.substring(1);
  } else if (str.indexOf("(") === 0 && str.indexOf(")") === str.length - 1) {
    isNegative = true;
    str = str.substring(1, str.length - 1);
  }
  
  // Deteksi bagian desimal .00 atau ,00 di ujung string (diikuti tepat 2 digit desimal)
  var decimalRegex = /[.,]\d{2}$/;
  var match = str.match(decimalRegex);
  var decimals = "";
  if (match) {
    decimals = match[0];
    str = str.substring(0, str.length - decimals.length);
    decimals = decimals.replace(",", "."); // Standarkan koma ke titik untuk desimal JS
  }
  
  // Bersihkan sisa titik/koma pemisah ribuan
  str = str.replace(/[.,]/g, "");
  
  var num = Number(str + decimals);
  if (isNaN(num)) return 0;
  
  return isNegative ? -num : num;
}

// ============================================================
// ANGGOTA — Insert
// ============================================================
function insertMember(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_ANGGOTA);
  
  healSheetHeaders(sheet, defaultAnggotaHeaders);
  
  const newId = getNextMemberId(sheet);
  const today = new Date().toISOString().substring(0, 10);
  
  const memberObj = {
    id_anggota: newId,
    nim: p.nim || "",
    nama: p.nama || "",
    divisi: p.divisi || "",
    jabatan: p.jabatan || "Anggota",
    created_at: today,
    updated_at: today,
    is_active: "TRUE" // Otomatis TRUE/Aktif saat pertama kali ditambahkan
  };
  
  appendRowByHeader(sheet, memberObj, defaultAnggotaHeaders);
  
  return jsonResponse({ status: "success", id: newId });
}

// ============================================================
// ANGGOTA — Edit
// ============================================================
function editMember(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_ANGGOTA);
  
  const today = new Date().toISOString().substring(0, 10);
  
  if (p.nim       !== undefined) updateColumnById(sheet, p.id, "nim", p.nim);
  if (p.nama      !== undefined) updateColumnById(sheet, p.id, "nama", p.nama);
  if (p.divisi    !== undefined) updateColumnById(sheet, p.id, "divisi", p.divisi);
  if (p.jabatan   !== undefined) updateColumnById(sheet, p.id, "jabatan", p.jabatan);
  if (p.is_active !== undefined) {
    const activeStr = (p.is_active === true || String(p.is_active).toLowerCase() === "true") ? "TRUE" : "FALSE";
    updateColumnById(sheet, p.id, "is_active", activeStr);
  }
  updateColumnById(sheet, p.id, "updated_at", today);
  
  return jsonResponse({ status: "success" });
}

// ============================================================
// ANGGOTA — Helper Generate ID Otomatis
// ============================================================
function getNextMemberId(sheet) {
  if (!sheet) return "M001";
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return "M001";
  
  const lastValStr = sheet.getRange(lastRow, 1).getValue().toString().trim();
  if (lastValStr === "") return "M001";
  
  const match = lastValStr.match(/^([A-Za-z]+)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const numStr = match[2];
    const nextNum = parseInt(numStr, 10) + 1;
    const paddedNum = nextNum.toString().padStart(numStr.length, '0');
    return prefix + paddedNum;
  }
  
  const lastValNum = Number(lastValStr);
  if (!isNaN(lastValNum)) {
    return (lastValNum + 1).toString();
  }
  
  return "M" + (lastRow).toString().padStart(3, '0');
}

// ============================================================
// FIREBASE FCM NOTIFICATION SERVICES (HTTP v1)
// ============================================================

/** Kirim notifikasi Firebase FCM menggunakan HTTP v1 API */
function kirimNotifikasiFirebaseV1(title, body) {
  try {
    const scriptProperties = PropertiesService.getScriptProperties();
    const projectId = scriptProperties.getProperty('FIREBASE_PROJECT_ID');
    const clientEmail = scriptProperties.getProperty('FIREBASE_CLIENT_EMAIL');
    let privateKey = scriptProperties.getProperty('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      Logger.log("Firebase Script Properties belum diset. Silakan set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, dan FIREBASE_PRIVATE_KEY di Setelan Proyek Apps Script.");
      return;
    }

    // Rapikan private key jika baris barunya rusak
    privateKey = privateKey.replace(/\\n/g, '\n');

    const serviceAccount = {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey
    };

    const token = getFcmAccessToken(serviceAccount);
    if (!token) {
      Logger.log("Gagal mendapatkan Access Token FCM.");
      return;
    }

    const url = "https://fcm.googleapis.com/v1/projects/" + serviceAccount.project_id + "/messages:send";
    const payload = {
      "message": {
        "topic": "transaksi",
        "notification": {
          "title": title,
          "body": body
        },
        "android": {
          "priority": "HIGH",
          "notification": {
            "sound": "default",
            "channel_id": "high_importance_channel"
          }
        },
        "apns": {
          "payload": {
            "aps": {
              "sound": "default"
            }
          }
        }
      }
    };

    const options = {
      "method": "post",
      "contentType": "application/json",
      "headers": {
        "Authorization": "Bearer " + token
      },
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    const res = UrlFetchApp.fetch(url, options);
    Logger.log("Respon FCM: " + res.getContentText());
  } catch (err) {
    Logger.log("Error kirimNotifikasiFirebaseV1: " + err.toString());
  }
}

/** Generate OAuth2 Access Token untuk FCM menggunakan Service Account JWT */
function getFcmAccessToken(serviceAccount) {
  const header = JSON.stringify({
    alg: "RS256",
    typ: "JWT"
  });

  const now = Math.floor(Date.now() / 1000);
  const claimSet = JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  });

  const encode = (str) => Utilities.base64EncodeWebSafe(str).replace(/=+$/, "");
  const signatureInput = encode(header) + "." + encode(claimSet);

  const signature = Utilities.computeRsaSha256Signature(signatureInput, serviceAccount.private_key);
  const jwt = signatureInput + "." + Utilities.base64EncodeWebSafe(signature).replace(/=+$/, "");

  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    },
    muteHttpExceptions: true
  });

  const tokenData = JSON.parse(response.getContentText());
  return tokenData.access_token;
}


