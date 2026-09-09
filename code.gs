// ============================================================
// GOOGLE APPS SCRIPT — DANAIMIP BACKEND (MIGRASI 3 SHEET - V4)
// Paste seluruh kode ini ke Google Apps Script editor Anda.
// Hapus semua kode lama dan paste ini agar tidak ada duplikasi fungsi!
// ============================================================

// ============================================================
// FUNGSI UNTUK OTORISASI GOOGLE DRIVE
// Jalankan fungsi ini langsung di editor Apps Script (pilih testDriveAccess lalu klik Run/Jalankan)
// untuk memicu popup otorisasi Google Drive (Authorization Required -> Izinkan).
// ============================================================
function testDriveAccess() {
  Logger.log("Memulai uji coba izin Google Drive...");
  const folderName = "bukti transaksi";
  let folder = null;
  const folders = DriveApp.getFoldersByName(folderName);
  while (folders.hasNext()) {
    const f = folders.next();
    if (!f.isTrashed()) {
      folder = f;
      break;
    }
  }
  if (!folder) {
    folder = DriveApp.createFolder(folderName);
    Logger.log("Folder '" + folderName + "' berhasil dibuat di Google Drive Anda!");
  } else {
    Logger.log("Folder '" + folderName + "' ditemukan (ID: " + folder.getId() + ")");
  }

  // Buat file tes mini untuk memastikan izin tulis
  const dummyBlob = Utilities.newBlob("test-permission-check", "text/plain", "test_drive_permission.txt");
  const testFile = folder.createFile(dummyBlob);
  Logger.log("File tes berhasil dibuat! ID: " + testFile.getId());
  testFile.setTrashed(true); // Langsung hapus file tes ke tempat sampah
  Logger.log("OTORISASI GOOGLE DRIVE 100% SUKSES DAN SIAP DIGUNAKAN!");
}

const SHEET_NAME_ANGGOTA     = "anggota";
const SHEET_NAME_TRANSAKSI   = "transaksi";
const SHEET_NAME_KEGIATAN    = "kegiatan";

// Default header fallback jika spreadsheet kosong/tidak memiliki header
const defaultTransactionHeaders = [
  "id_transaksi", "tanggal", "divisi", "kategori", "uraian", "unit", 
  "harga_satuan", "jumlah", "id_anggota", "id_kegiatan", "jenis", 
  "metode", "keterangan", "created_at", "updated_at"
];

const defaultProkerHeaders = [
  "id_kegiatan", "jenis", "nama_kegiatan", "anggaran", "pemasukan", 
  "pengeluaran", "realisasi", "keterangan", "divisi", "id_anggota", 
  "estimasi_tanggal", "tahun", "status", "created_at", "updated_at"
];

const defaultAnggotaHeaders = [
  "id_anggota", "nim", "nama", "divisi", "jabatan", "created_at", "updated_at", "is_active"
];

// ============================================================
// GET REQUEST — Ambil semua data & Hubungkan Ke Data Base Baru
// ============================================================
function doGet(e) {
  const action = e.parameter.action;
  const callback = e.parameter.callback; // JSONP support

  try {
    let result;
    if (action === "get_all_data") {
      result = getAllData(callback);
    } else if (action === "get_raw_rows") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);
      const data = sheet.getDataRange().getValues();
      result = jsonResponse({ status: "success", data: data.slice(0, 200) }, callback);
    } else if (action === "diagnose_sheets") {
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
      result = jsonResponse({ status: "success", data: diag }, callback);
    } else if (action === "test_drive_and_version") {
      let driveStatus = "OK";
      let folderId = "";
      try {
        const folders = DriveApp.getFoldersByName("bukti transaksi");
        while (folders.hasNext()) {
          const f = folders.next();
          if (!f.isTrashed()) {
            folderId = f.getId();
            break;
          }
        }
        if (!folderId) {
          driveStatus = "DriveApp aktif, folder 'bukti transaksi' belum ada.";
        }
      } catch (e) {
        driveStatus = "ERROR: " + e.toString();
      }
      result = jsonResponse({
        status: "success",
        script_version: "2026-09-08_v7_fix_kas_payment_logic",
        drive_status: driveStatus,
        folder_id: folderId
      }, callback);
    } else {
      result = jsonResponse({ status: "error", message: "Action tidak dikenal: " + action }, callback);
    }
    return result;
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() }, callback);
  }
}

function getAllData(callback) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

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
  removeDeprecatedColumns(transaksiSheet, ["catatan"]);
  const transaksiRaw   = sheetToJson(transaksiSheet);
  const transaksiData  = transaksiRaw.map(t => {
    const ketRaw       = getVal(t, "keterangan");
    const catatanRaw   = getVal(t, "catatan") || "";
    const uraianRaw    = getVal(t, "uraian") || "";
    const buktiRaw     = getVal(t, "bukti") || "";
    const ketVal       = (ketRaw !== undefined && ketRaw !== null && String(ketRaw).trim() !== "")
      ? String(ketRaw).trim()
      : (catatanRaw || "");
    const catatanVal   = catatanRaw;
    let proofUrl = "";
    
    // Extract URL or base64 if present in bukti, keterangan, catatan, or uraian
    const candidates = [buktiRaw, ketVal, catatanVal, uraianRaw];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!c) continue;
      const cStr = c.toString().trim();
      const urlMatch = cStr.match(/https?:\/\/[^\s)]+/);
      if (urlMatch) {
        proofUrl = urlMatch[0];
        break;
      } else if (cStr.startsWith("data:image")) {
        proofUrl = cStr;
        break;
      }
    }
    
    // Default status_reimburse jika kolomnya tidak ada di database baru atau kosong
    let statusReimburse = getVal(t, "status_reimburse");
    if (statusReimburse === undefined || statusReimburse === null || statusReimburse.toString().trim() === "") {
      statusReimburse = "Tidak Perlu";
    }
    
    const uraianVal = (uraianRaw !== undefined && uraianRaw !== null && String(uraianRaw).trim() !== "")
      ? String(uraianRaw).trim()
      : ketVal;
    const rawJumlah = getVal(t, "jumlah") !== undefined ? getVal(t, "jumlah") : getVal(t, "nominal");
    const jumlahVal = parseFormattedNumber(rawJumlah);
    const rawHargaSatuan = getVal(t, "harga_satuan") !== undefined ? getVal(t, "harga_satuan") : getVal(t, "harga satuan");
    
    const rawTanggal = getVal(t, "tanggal");
    const formattedTanggal = formatDateStandard(rawTanggal);
    
    return {
      id: (getVal(t, "id_transaksi") !== undefined ? getVal(t, "id_transaksi") : (getVal(t, "id") || "")).toString(),
      tanggal: formattedTanggal,
      divisi: (() => {
        const d = getVal(t, "divisi");
        return (d !== undefined && d !== null && d.toString().trim() !== "") ? d.toString().trim() : "NULL";
      })(),
      kategori: String(getVal(t, "kategori") || "Umum").trim(),
      uraian: String(uraianVal || "").trim(),
      keterangan: String(ketVal || "").trim(),
      unit: (() => {
        const u = getVal(t, "unit");
        return (u !== undefined && u !== null && u.toString().trim() !== "") ? u.toString().trim() : "NULL";
      })(),
      harga_satuan: parseFormattedNumber(rawHargaSatuan),
      jumlah: jumlahVal,
      nominal: jumlahVal, // Compatibility alias for frontend
      user_id: getVal(t, "id_anggota") !== undefined ? getVal(t, "id_anggota") : (getVal(t, "user_id") || ""),
      proker_id: (() => {
        const val = getVal(t, "id_kegiatan") !== undefined ? getVal(t, "id_kegiatan") : getVal(t, "proker_id");
        if (val === undefined || val === null) return "";
        const valStr = val.toString().trim();
        return valStr.toLowerCase() === "null" ? "" : valStr;
      })(),
      jenis: String(getVal(t, "jenis") || "Keluar").trim(),
      metode: String(getVal(t, "metode") || "Tunai").trim(),
      catatan: String((getVal(t, "catatan") !== undefined && getVal(t, "catatan") !== null ? getVal(t, "catatan") : ketVal) || "").trim(), // Compatibility alias for frontend
      bukti: proofUrl,
      status_reimburse: String(statusReimburse || "Tidak Perlu").trim(),
      nama_pic_pengeluar: String(getVal(t, "nama_pic_pengeluar") || "").trim(),
      created_at: getVal(t, "created_at") || "",
      updated_at: getVal(t, "updated_at") || ""
    };
  });

  // 3. Sheet KEGIATAN → Peta ke format front-end (proker)
  const kegiatanSheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_KEGIATAN);
  const kegiatanRaw   = sheetToJson(kegiatanSheet);
  const prokerData    = kegiatanRaw.map(k => {
    const idKegiatan = (getVal(k, "id_kegiatan") !== undefined ? getVal(k, "id_kegiatan") : (getVal(k, "id") || "")).toString();
    
    // Hitung pemasukan & pengeluaran dinamis dari transaksiData untuk proker ini
    let dynamicIn = 0;
    let dynamicOut = 0;
    transaksiData.forEach(tx => {
      if (tx.proker_id && tx.proker_id.toString().trim() === idKegiatan.trim()) {
        const val = Number(tx.jumlah !== undefined ? tx.jumlah : tx.nominal) || 0;
        if (tx.jenis === "Masuk") {
          dynamicIn += val;
        } else if (tx.jenis === "Keluar") {
          dynamicOut += val;
        }
      }
    });

    const rawPemasukan = getVal(k, "pemasukan");
    const rawPengeluaran = getVal(k, "pengeluaran");
    const rawRealisasi = getVal(k, "realisasi");

    const pemasukanVal = (rawPemasukan !== undefined && rawPemasukan !== null && rawPemasukan !== "" && Number(rawPemasukan) > 0)
      ? parseFormattedNumber(rawPemasukan)
      : dynamicIn;

    const pengeluaranVal = (rawPengeluaran !== undefined && rawPengeluaran !== null && rawPengeluaran !== "" && Number(rawPengeluaran) > 0)
      ? parseFormattedNumber(rawPengeluaran)
      : dynamicOut;

    let realisasiVal = 0;
    if (rawRealisasi !== undefined && rawRealisasi !== null && rawRealisasi !== "" && Number(rawRealisasi) > 0) {
      realisasiVal = parseFormattedNumber(rawRealisasi);
    } else {
      realisasiVal = pengeluaranVal;
    }

    let statusVal = getVal(k, "status") || "Running";
    if (statusVal.toString().trim() === "Berjalan") {
      statusVal = "Running";
    }

    const namaKegiatan = (getVal(k, "nama_kegiatan") !== undefined && getVal(k, "nama_kegiatan") !== "") 
      ? getVal(k, "nama_kegiatan") 
      : (getVal(k, "nama_proker") || "");
      
    const rawAnggaran = (getVal(k, "anggaran") !== undefined && getVal(k, "anggaran") !== "") 
      ? getVal(k, "anggaran") 
      : getVal(k, "estimasi_dana");
    const anggaranVal = parseFormattedNumber(rawAnggaran);

    const cleanMemberId = cleanAnggotaId(getVal(k, "id_anggota"));

    return {
      id: idKegiatan,
      id_kegiatan: idKegiatan,
      jenis: getVal(k, "jenis") || "Program Kerja",
      nama_kegiatan: namaKegiatan,
      nama_proker: namaKegiatan, // Compatibility alias for frontend
      anggaran: anggaranVal,
      estimasi_dana: anggaranVal, // Compatibility alias for frontend
      pemasukan: pemasukanVal,
      pengeluaran: pengeluaranVal,
      realisasi: realisasiVal,
      keterangan: getVal(k, "keterangan") || "",
      divisi: getVal(k, "divisi") || "",
      id_anggota: cleanMemberId,
      estimasi_tanggal: getVal(k, "estimasi_tanggal") || "",
      tahun: getVal(k, "tahun") || "",
      status: statusVal,
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
      const isApproved = (t.status_reimburse === "Tidak Perlu");
      return isApproved && isIuranKasTransaction(t) && isTransactionForMember(t, member);
    });

    // Urutkan transaksi berdasarkan ID transaksi secara kronologis
    memberTxList.sort((a, b) => {
      const idA = a.id ? a.id.toString() : "";
      const idB = b.id ? b.id.toString() : "";
      return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
    });

    const unpaidMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    const allocatedMonths = [];

    // Pass 1: Alokasikan transaksi yang menyebutkan bulan secara eksplisit di keterangan, catatan, atau uraian
    memberTxList.forEach(t => {
      const combinedText = (t.keterangan || "") + " " + (t.catatan || "") + " " + (t.uraian || "");
      const extracted = extractMonthsFromText(combinedText);
      extracted.forEach(bulan => {
        if (unpaidMonths.indexOf(bulan) !== -1) {
          allocatedMonths.push({ bulan: bulan, txId: t.id });
          const idx = unpaidMonths.indexOf(bulan);
          unpaidMonths.splice(idx, 1);
        }
      });
    });

    // Pass 2: Transaksi kas iuran yang tidak mencantumkan bulan secara eksplisit
    memberTxList.forEach(t => {
      const combinedText = (t.keterangan || "") + " " + (t.catatan || "") + " " + (t.uraian || "");
      const extracted = extractMonthsFromText(combinedText);
      if (extracted.length === 0) {
        const nominal = Number(t.nominal) || 0;
        const count = Math.floor(nominal / 10000);
        for (let i = 0; i < count; i++) {
          if (unpaidMonths.length > 0) {
            const bulan = unpaidMonths.shift();
            allocatedMonths.push({ bulan: bulan, txId: t.id });
          }
        }
      }
    });

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
  }, callback);
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
    if (action === "cancel_kas_month")          return cancelKasMonth(payload);
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

  removeDeprecatedColumns(sheet, ["catatan"]);
  healSheetHeaders(sheet, defaultTransactionHeaders);

  const uraianInput = p.uraian !== undefined ? p.uraian : (p.keterangan || "");
  const rawNominal = p.jumlah !== undefined ? p.jumlah : p.nominal;
  const parsedJumlah = parseFormattedNumber(rawNominal);

  const cleanDivisi = (p.divisi && p.divisi.toString().trim() !== "" && p.divisi.toString().trim().toUpperCase() !== "NULL")
    ? p.divisi.toString().trim()
    : "NULL";

  const rawProker = p.proker_id !== undefined ? p.proker_id : p.id_kegiatan;
  const cleanProkerId = (rawProker && rawProker.toString().trim() !== "" && rawProker.toString().trim().toUpperCase() !== "NULL")
    ? rawProker.toString().trim()
    : "NULL";

  const rawJenis = (p.jenis || "").toString().trim().toLowerCase();
  const isKeluar = (rawJenis === "keluar");

  const catLower = (p.kategori || "").toLowerCase().trim();
  const ketLower = (uraianInput || "").toLowerCase().trim();

  // Kas bulanan pengurus HANYA untuk pemasukan iuran anggota (TIDAK PERNAH untuk pengeluaran)
  const isKasPayment = !isKeluar && (
    catLower === "kas" ||
    catLower.startsWith("kas") ||
    catLower === "kas bulanan" || 
    catLower === "kas pengurus" || 
    catLower === "iuran kas" || 
    catLower === "uang kas" ||
    ketLower.includes("pembayaran uang kas") ||
    ketLower.includes("pembayaran kas") ||
    ketLower.includes("iuran kas pengurus") ||
    p.is_kas === true
  );

  const isIncome = isKasPayment || 
                   rawJenis === "masuk" ||
                   catLower.includes("htm") || 
                   catLower.includes("donasi") || 
                   ketLower.includes("htm") || 
                   ketLower.includes("donasi");

  const jenis = isKeluar ? "Keluar" : (isIncome ? "Masuk" : (p.jenis || "Keluar"));
  const today = new Date().toISOString().substring(0, 10);

  let driveUrl = "";
  if (p.bukti && p.bukti.toString().trim().startsWith("data:")) {
    const nextId = getNextTransactionId(sheet);
    driveUrl = saveImageToDrive(p.bukti, nextId);
  } else {
    driveUrl = p.bukti || "";
  }

  const memberName = getMemberNameById(ss, p.user_id);

  if (isKasPayment && parsedJumlah > 10000) {
    let months = [];
    const match = (uraianInput || "").match(/\(([^)]+)\)/);
    if (match) {
      months = match[1].split(",").map(b => b.trim());
    } else {
      const unpaid = getUnpaidMonthsForMember(ss, p.user_id);
      const count = Math.round(parsedJumlah / 10000);
      for (let i = 0; i < count; i++) {
        if (unpaid.length > 0) {
          months.push(unpaid.shift());
        } else {
          months.push("Kas");
        }
      }
    }

    let lastInsertedId = null;
    months.forEach((m) => {
      const newId = getNextTransactionId(sheet);
      const baseKet = (memberName ? "Kas " + memberName : (uraianInput || "Kas Anggota")) + " (" + m + ")";
      const finalKet = baseKet + (driveUrl ? " (Bukti: " + driveUrl + ")" : "");

      const txObj = {
        id_transaksi: newId,
        id: newId,
        tanggal: p.tanggal || today,
        divisi: cleanDivisi,
        kategori: "Kas",
        uraian: baseKet,
        keterangan: finalKet,
        unit: p.unit || "NULL",
        harga_satuan: 10000,
        jumlah: 10000,
        nominal: 10000,
        id_anggota: p.user_id !== undefined ? p.user_id : "",
        user_id: p.user_id !== undefined ? p.user_id : "",
        id_kegiatan: cleanProkerId,
        proker_id: cleanProkerId,
        jenis: jenis,
        metode: p.metode || "Tunai",
        status_reimburse: p.status_reimburse || "Tidak Perlu",
        nama_pic_pengeluar: p.nama_pic_pengeluar !== undefined ? p.nama_pic_pengeluar : "",
        created_at: today,
        updated_at: today
      };

      appendRowByHeader(sheet, txObj, defaultTransactionHeaders);
      lastInsertedId = newId;
    });

    kirimNotifikasiFirebaseV1(
      "Transaksi Masuk!",
      "Pembayaran kas baru dari " + (memberName || "Anggota") + " senilai Rp " + Number(parsedJumlah).toLocaleString('id-ID')
    );

    return jsonResponse({ status: "success", id: lastInsertedId });
  }

  const newId = getNextTransactionId(sheet);

  const hasExplicitUraian = (p.uraian !== undefined && p.uraian !== null && String(p.uraian).trim() !== "");
  let cleanUraian = hasExplicitUraian
    ? String(p.uraian).trim()
    : (p.keterangan ? String(p.keterangan).trim() : "Tanpa Uraian");

  let ketTambahan = "";
  if (hasExplicitUraian) {
    // Caller deliberately provided uraian, so p.keterangan is the optional note
    const rawKet = (p.keterangan !== undefined && p.keterangan !== null) ? String(p.keterangan).trim() : "";
    if (rawKet !== "" && rawKet.toLowerCase() !== cleanUraian.toLowerCase()) {
      ketTambahan = rawKet;
    }
  } else {
    // Legacy / caller only passed keterangan
    ketTambahan = (p.keterangan !== undefined && p.keterangan !== null) ? String(p.keterangan).trim() : cleanUraian;
  }

  let finalKet = ketTambahan;
  if (isKasPayment) {
    let m = "Kas";
    const monthsFound = extractMonthsFromText(uraianInput);
    if (monthsFound.length > 0) {
      m = monthsFound[0];
    } else {
      const unpaid = getUnpaidMonthsForMember(ss, p.user_id);
      if (unpaid.length > 0) {
        m = unpaid[0];
      }
    }
    const baseKas = (memberName ? "Kas " + memberName : (uraianInput || "Kas Anggota")) + " (" + m + ")";
    cleanUraian = baseKas;
    finalKet = baseKas;
  }

  if (driveUrl) {
    if (finalKet && !finalKet.includes("Bukti:")) {
      finalKet += " (Bukti: " + driveUrl + ")";
    } else if (!finalKet) {
      finalKet = "(Bukti: " + driveUrl + ")";
    }
  }

  const txObj = {
    id_transaksi: newId,
    id: newId,
    tanggal: p.tanggal || today,
    divisi: cleanDivisi,
    kategori: isKasPayment ? "Kas" : (p.kategori || "Umum"),
    uraian: cleanUraian,
    keterangan: finalKet,
    unit: p.unit || "NULL",
    harga_satuan: parseFormattedNumber(p.harga_satuan),
    jumlah: parsedJumlah,
    nominal: parsedJumlah,
    id_anggota: p.user_id !== undefined ? p.user_id : "",
    user_id: p.user_id !== undefined ? p.user_id : "",
    id_kegiatan: cleanProkerId,
    proker_id: cleanProkerId,
    jenis: jenis,
    metode: p.metode || "Tunai",
    status_reimburse: p.status_reimburse || "Tidak Perlu",
    nama_pic_pengeluar: p.nama_pic_pengeluar !== undefined ? p.nama_pic_pengeluar : "",
    created_at: today,
    updated_at: today
  };

  appendRowByHeader(sheet, txObj, defaultTransactionHeaders);

  // Kirim notifikasi Firebase FCM (HTTP v1)
  const notifTitle = (jenis === "Masuk") ? "Transaksi Masuk!" : "Transaksi Keluar!";
  const notifMsg = ((jenis === "Masuk") ? "Pemasukan: " : "Pengeluaran: ") + (txObj.uraian || txObj.keterangan) + " senilai Rp " + Number(parsedJumlah).toLocaleString('id-ID');
  kirimNotifikasiFirebaseV1(notifTitle, notifMsg);

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
// KAS PENGURUS — Batalkan Kas Bulan Tertentu Secara Aman
// ============================================================
function cancelKasMonth(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);
  const txId  = p.id ? p.id.toString().trim() : "";
  const bulan = p.bulan ? p.bulan.toString().trim() : "";
  const userId = p.user_id ? p.user_id.toString().trim() : "";

  if (!txId) {
    return jsonResponse({ status: "error", message: "ID Transaksi tidak valid atau kosong." });
  }

  const data = sheetToJson(sheet);
  const tx = data.find(r => safeCompareIds(getVal(r, "id_transaksi") || getVal(r, "id"), txId));
  if (!tx) {
    return jsonResponse({ status: "error", message: "Transaksi dengan ID " + txId + " tidak ditemukan di spreadsheet." });
  }

  // 1. Validasi Keamanan Ketat: Pastikan benar-benar transaksi Iuran Kas
  const tMapped = {
    id: txId,
    jenis: getVal(tx, "jenis"),
    proker_id: getVal(tx, "id_kegiatan") || getVal(tx, "proker_id"),
    kategori: getVal(tx, "kategori"),
    uraian: getVal(tx, "uraian"),
    keterangan: getVal(tx, "keterangan"),
    catatan: getVal(tx, "catatan"),
    user_id: getVal(tx, "id_anggota") || getVal(tx, "user_id"),
    nominal: parseFormattedNumber(getVal(tx, "nominal"))
  };

  if (!isIuranKasTransaction(tMapped)) {
    return jsonResponse({ 
      status: "error", 
      message: "DITOLAK: Transaksi " + txId + " (" + (tMapped.uraian || tMapped.keterangan) + ") bukan transaksi iuran kas pengurus! Transaksi operasional/kegiatan tidak boleh dihapus dari menu kelola kas." 
    });
  }

  // 2. Validasi Anggota jika dikirimkan
  if (userId && tMapped.user_id && !safeCompareIds(tMapped.user_id, userId)) {
    return jsonResponse({ 
      status: "error", 
      message: "DITOLAK: Transaksi " + txId + " bukan milik anggota yang dipilih!" 
    });
  }

  // 3. Penanganan Transaksi Multi-Bulan vs Single-Bulan
  const nominal = tMapped.nominal;
  const combinedText = (tMapped.keterangan || "") + " " + (tMapped.catatan || "") + " " + (tMapped.uraian || "");
  const extractedMonths = extractMonthsFromText(combinedText);

  // Jika transaksi hanya bernilai <= 10.000 atau hanya mencakup 1 bulan: Hapus baris transaksi
  if (nominal <= 10000 || extractedMonths.length <= 1) {
    const deleted = deleteRowById(sheet, txId);
    return jsonResponse({ 
      status: deleted ? "success" : "error", 
      message: deleted ? "Transaksi kas bulan " + bulan + " (" + txId + ") berhasil dihapus." : "Gagal menghapus baris transaksi." 
    });
  } else {
    // Jika transaksi mencakup beberapa bulan (misal Rp 20.000 untuk 2 bulan):
    // JANGAN HAPUS BARIS! Cukup kurangi nominal 10.000 dan hapus bulan tersebut dari keterangan agar bulan lain tetap aman!
    const newNominal = Math.max(0, nominal - 10000);
    let newKet = tMapped.keterangan || "";
    if (bulan) {
      newKet = newKet.replace(new RegExp("\\b" + bulan + "\\b[,\\s]*", "gi"), "")
                     .replace(/,\s*\)/g, ")")
                     .replace(/\(\s*,/g, "(")
                     .replace(/\(\s*\)/g, "")
                     .trim();
    }
    updateColumnById(sheet, txId, "nominal", newNominal);
    updateColumnById(sheet, txId, "jumlah", newNominal);
    updateColumnById(sheet, txId, "keterangan", newKet);
    return jsonResponse({ 
      status: "success", 
      message: "Kas bulan " + bulan + " dibatalkan. Transaksi " + txId + " disesuaikan menjadi Rp " + newNominal.toLocaleString('id-ID') + " agar riwayat bulan lainnya tetap aman." 
    });
  }
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

  normalizeProkerSheet(sheet);

  const lastRow = sheet.getLastRow();
  const newId = lastRow <= 1 ? 1 : Number(sheet.getRange(lastRow, 1).getValue() || 0) + 1;
  const today = new Date().toISOString().substring(0, 10);

  const namaKegiatan = p.nama_kegiatan || p.nama_proker || "";
  const anggaranVal = parseFormattedNumber(p.anggaran !== undefined ? p.anggaran : p.estimasi_dana);

  const prokerObj = {
    id_kegiatan: newId,
    jenis: p.jenis || "Program Kerja",
    nama_kegiatan: namaKegiatan,
    anggaran: anggaranVal,
    estimasi_dana: anggaranVal,
    pemasukan: parseFormattedNumber(p.pemasukan || 0),
    pengeluaran: parseFormattedNumber(p.pengeluaran || 0),
    realisasi: parseFormattedNumber(p.realisasi || 0),
    keterangan: p.keterangan || "",
    divisi: p.divisi || "",
    id_anggota: cleanAnggotaId(p.id_anggota || ""),
    estimasi_tanggal: p.estimasi_tanggal || "",
    tahun: p.tahun || new Date().getFullYear().toString(),
    status: p.status || "Running",
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

  normalizeProkerSheet(sheet);

  const namaVal = p.nama_kegiatan !== undefined ? p.nama_kegiatan : p.nama_proker;
  if (namaVal !== undefined) {
    updateColumnById(sheet, p.id, "nama_kegiatan", namaVal);
    updateColumnById(sheet, p.id, "nama_proker", namaVal);
  }
  const anggaranVal = p.anggaran !== undefined ? p.anggaran : p.estimasi_dana;
  if (anggaranVal !== undefined) {
    updateColumnById(sheet, p.id, "anggaran", parseFormattedNumber(anggaranVal));
    updateColumnById(sheet, p.id, "estimasi_dana", parseFormattedNumber(anggaranVal));
  }
  if (p.pemasukan        !== undefined) updateColumnById(sheet, p.id, "pemasukan", parseFormattedNumber(p.pemasukan));
  if (p.pengeluaran      !== undefined) updateColumnById(sheet, p.id, "pengeluaran", parseFormattedNumber(p.pengeluaran));
  if (p.realisasi        !== undefined) updateColumnById(sheet, p.id, "realisasi", parseFormattedNumber(p.realisasi));
  if (p.keterangan       !== undefined) updateColumnById(sheet, p.id, "keterangan", p.keterangan);
  if (p.jenis            !== undefined) updateColumnById(sheet, p.id, "jenis", p.jenis);
  if (p.divisi           !== undefined) updateColumnById(sheet, p.id, "divisi", p.divisi);
  if (p.id_anggota       !== undefined) updateColumnById(sheet, p.id, "id_anggota", p.id_anggota);
  if (p.estimasi_tanggal !== undefined) updateColumnById(sheet, p.id, "estimasi_tanggal", p.estimasi_tanggal);
  if (p.tahun            !== undefined) updateColumnById(sheet, p.id, "tahun", p.tahun);

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
  const target = key.toString().trim().toLowerCase();
  const keyUnderscore = target.replace(/ /g, "_");
  const keySpace = target.replace(/_/g, " ");
  
  if (obj[keyUnderscore] !== undefined && obj[keyUnderscore] !== "") return obj[keyUnderscore];
  if (obj[keySpace] !== undefined && obj[keySpace] !== "") return obj[keySpace];
  if (obj[target] !== undefined && obj[target] !== "") return obj[target];
  
  for (let k in obj) {
    const kClean = k.toString().trim().toLowerCase();
    const kUnderscore = kClean.replace(/ /g, "_");
    const kSpace = kClean.replace(/_/g, " ");
    if (kClean === target || kUnderscore === keyUnderscore || kSpace === keySpace) {
      if (obj[k] !== undefined && obj[k] !== "") return obj[k];
    }
  }
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
    if (h === "bukti") {
      const b = getVal(obj, "bukti");
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
      // Cari kolom keterangan, catatan, atau bukti untuk mendeteksi file Drive
      const ketCol = headers.indexOf("keterangan");
      const catatanCol = headers.indexOf("catatan");
      const buktiCol = headers.indexOf("bukti");
      let fileUrl = "";
      if (ketCol !== -1) fileUrl = data[i][ketCol];
      if (!fileUrl && catatanCol !== -1) fileUrl = data[i][catatanCol];
      if (!fileUrl && buktiCol !== -1) fileUrl = data[i][buktiCol];
      
      // Jika ditemukan URL file Drive, hapus filenya jika tidak digunakan oleh baris lain
      if (fileUrl) {
        const fileIdToDelete = extractDriveFileId(fileUrl.toString());
        if (fileIdToDelete) {
          let isShared = false;
          for (let r = 1; r < data.length; r++) {
            if (r === i) continue; // Lewati baris yang sedang dihapus
            let otherUrl = "";
            if (ketCol !== -1) otherUrl = data[r][ketCol];
            if (!otherUrl && catatanCol !== -1) otherUrl = data[r][catatanCol];
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
    const tMapped = {
      id: getVal(t, "id_transaksi") !== undefined ? getVal(t, "id_transaksi") : (getVal(t, "id") || ""),
      user_id: getVal(t, "id_anggota") !== undefined ? getVal(t, "id_anggota") : (getVal(t, "user_id") || ""),
      proker_id: getVal(t, "id_kegiatan") !== undefined ? getVal(t, "id_kegiatan") : (getVal(t, "proker_id") || ""),
      jenis: getVal(t, "jenis") || "",
      kategori: getVal(t, "kategori") || "",
      uraian: getVal(t, "uraian") || "",
      keterangan: getVal(t, "keterangan") || "",
      catatan: getVal(t, "catatan") || "",
      status_reimburse: getVal(t, "status_reimburse") || "",
      nominal: parseFormattedNumber(getVal(t, "nominal"))
    };
    
    const isApproved = (tMapped.status_reimburse === "Tidak Perlu");
    return isApproved && isIuranKasTransaction(tMapped) && isTransactionForMember(tMapped, member);
  });

  memberTxList.sort((a, b) => {
    const idA = (getVal(a, "id_transaksi") !== undefined ? getVal(a, "id_transaksi") : (getVal(a, "id") || "")).toString();
    const idB = (getVal(b, "id_transaksi") !== undefined ? getVal(b, "id_transaksi") : (getVal(b, "id") || "")).toString();
    return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Pass 1: Alokasikan transaksi yang menyebutkan bulan secara eksplisit
  memberTxList.forEach(t => {
    const ket = getVal(t, "keterangan") || "";
    const cat = getVal(t, "catatan") || "";
    const ur  = getVal(t, "uraian") || "";
    const combinedText = ket + " " + cat + " " + ur;
    const extracted = extractMonthsFromText(combinedText);
    extracted.forEach(bulan => {
      if (unpaidMonths.indexOf(bulan) !== -1) {
        allocatedMonths.push(bulan);
        const idx = unpaidMonths.indexOf(bulan);
        unpaidMonths.splice(idx, 1);
      }
    });
  });

  // Pass 2: Transaksi kas iuran tanpa bulan eksplisit
  memberTxList.forEach(t => {
    const ket = getVal(t, "keterangan") || "";
    const cat = getVal(t, "catatan") || "";
    const ur  = getVal(t, "uraian") || "";
    const combinedText = ket + " " + cat + " " + ur;
    const extracted = extractMonthsFromText(combinedText);
    if (extracted.length === 0) {
      const nominal = parseFormattedNumber(getVal(t, "nominal"));
      const count = Math.floor(nominal / 10000);
      for (let i = 0; i < count; i++) {
        if (unpaidMonths.length > 0) {
          const bulan = unpaidMonths.shift();
          allocatedMonths.push(bulan);
        }
      }
    }
  });

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

/** Bungkus response JSON, support JSONP jika callback diberikan */
function jsonResponse(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(callback)) {
    // JSONP: wrap in callback(data); - bypass CORS restriction
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/** Edit detail transaksi dari All-Transaksi.html */
function editTransaction(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);
  
  if (p.uraian     !== undefined) updateColumnById(sheet, p.id, "uraian", p.uraian);
  if (p.keterangan !== undefined) updateColumnById(sheet, p.id, "keterangan", p.keterangan);
  if (p.nominal    !== undefined) updateColumnById(sheet, p.id, "nominal", parseFormattedNumber(p.nominal));
  if (p.metode     !== undefined) updateColumnById(sheet, p.id, "metode", p.metode);
  
  return jsonResponse({ status: "success" });
}

/** Auto-remove deprecated columns (e.g. 'catatan' from sheet transaksi) */
function removeDeprecatedColumns(sheet, deprecatedColNames) {
  if (!sheet) return;
  try {
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return;
    
    const headerRange = sheet.getRange(1, 1, 1, lastCol);
    const existingHeaders = headerRange.getValues()[0].map(h => h.toString().trim().toLowerCase());
    
    // Iterate backwards so deleting a column does not alter previous indices
    for (let i = existingHeaders.length - 1; i >= 0; i--) {
      const colName = existingHeaders[i];
      if (deprecatedColNames.indexOf(colName) !== -1) {
        sheet.deleteColumn(i + 1);
        Logger.log("Removed deprecated column: " + colName + " at index " + (i + 1));
      }
    }
  } catch (err) {
    Logger.log("Error removing deprecated columns: " + err.toString());
  }
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

/** Clean id_anggota value if it was mistakenly formatted as a Date in Google Sheets */
function cleanAnggotaId(val) {
  if (val === undefined || val === null) return "";
  if (typeof val === 'number') return Math.floor(val).toString();
  if (val instanceof Date) {
    if (val.getFullYear() <= 1900) {
      const date = val.getDate();
      return date.toString();
    }
  }
  const str = val.toString().trim();
  if (str === "") return "";
  const dateMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/1900$/);
  if (dateMatch) {
    const m = parseInt(dateMatch[1], 10);
    const d = parseInt(dateMatch[2], 10);
    if (m === 1) return d.toString();
    return m.toString();
  }
  return str;
}

/** Normalize sheet kegiatan to match exact 15-column defaultProkerHeaders order, clean date formats, and auto-populate financial columns */
function normalizeProkerSheet(sheet, transaksiData) {
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.appendRow(defaultProkerHeaders);
    return;
  }

  const rawValues = sheet.getDataRange().getValues();
  if (rawValues.length === 0) return;

  const currentHeaders = rawValues[0].map(h => h.toString().trim().toLowerCase());

  // Build row objects mapping old/new header names
  const rowObjects = [];
  for (let r = 1; r < rawValues.length; r++) {
    const row = rawValues[r];
    const isBlank = row.every(v => v === "" || v === null || v === undefined);
    if (isBlank) continue;

    const obj = {};
    currentHeaders.forEach((h, colIdx) => {
      if (h) {
        let key = h;
        if (h === "nama_proker" || h === "nama proker") key = "nama_kegiatan";
        if (h === "estimasi_dana" || h === "estimasi dana" || h === "rab") key = "anggaran";
        if (h === "user_id") key = "id_anggota";
        
        if (obj[key] === undefined || obj[key] === "" || obj[key] === null) {
          obj[key] = row[colIdx];
        }
      }
    });
    rowObjects.push(obj);
  }

  sheet.clearContents();
  sheet.clearFormats();

  const newMatrix = [defaultProkerHeaders];
  rowObjects.forEach(obj => {
    const idKegiatan = (getVal(obj, "id_kegiatan") !== undefined && getVal(obj, "id_kegiatan") !== "" ? getVal(obj, "id_kegiatan") : (getVal(obj, "id") || "")).toString();

    // Hitung pemasukan & pengeluaran dinamis dari transaksiData untuk proker ini
    let dynamicIn = 0;
    let dynamicOut = 0;
    if (Array.isArray(transaksiData)) {
      transaksiData.forEach(tx => {
        if (tx.proker_id && tx.proker_id.toString().trim() === idKegiatan.trim()) {
          const val = Number(tx.jumlah !== undefined ? tx.jumlah : tx.nominal) || 0;
          if (tx.jenis === "Masuk") {
            dynamicIn += val;
          } else if (tx.jenis === "Keluar") {
            dynamicOut += val;
          }
        }
      });
    }

    const rawPemasukan = getVal(obj, "pemasukan");
    const rawPengeluaran = getVal(obj, "pengeluaran");
    const rawRealisasi = getVal(obj, "realisasi");

    const pemasukanVal = (rawPemasukan !== undefined && rawPemasukan !== null && rawPemasukan !== "" && Number(rawPemasukan) > 0)
      ? parseFormattedNumber(rawPemasukan)
      : dynamicIn;

    const pengeluaranVal = (rawPengeluaran !== undefined && rawPengeluaran !== null && rawPengeluaran !== "" && Number(rawPengeluaran) > 0)
      ? parseFormattedNumber(rawPengeluaran)
      : dynamicOut;

    let realisasiVal = 0;
    if (rawRealisasi !== undefined && rawRealisasi !== null && rawRealisasi !== "" && Number(rawRealisasi) > 0) {
      realisasiVal = parseFormattedNumber(rawRealisasi);
    } else {
      realisasiVal = pengeluaranVal;
    }

    const rawAnggaran = (getVal(obj, "anggaran") !== undefined && getVal(obj, "anggaran") !== "") 
      ? getVal(obj, "anggaran") 
      : getVal(obj, "estimasi_dana");
    const anggaranVal = parseFormattedNumber(rawAnggaran);

    const formattedAnggaran = anggaranVal > 0 ? "Rp" + anggaranVal.toLocaleString('id-ID') : (rawAnggaran || "");
    const formattedPemasukan = pemasukanVal > 0 ? "Rp" + pemasukanVal.toLocaleString('id-ID') : "";
    const formattedPengeluaran = pengeluaranVal > 0 ? "Rp" + pengeluaranVal.toLocaleString('id-ID') : "";
    const formattedRealisasi = realisasiVal > 0 ? "Rp" + realisasiVal.toLocaleString('id-ID') : "";

    const newRow = defaultProkerHeaders.map(h => {
      if (h === "id_kegiatan") return idKegiatan;
      if (h === "nama_kegiatan") return getVal(obj, "nama_kegiatan") || getVal(obj, "nama_proker") || "";
      if (h === "anggaran") return formattedAnggaran;
      if (h === "pemasukan") return formattedPemasukan;
      if (h === "pengeluaran") return formattedPengeluaran;
      if (h === "realisasi") return formattedRealisasi;
      if (h === "id_anggota") return cleanAnggotaId(getVal(obj, "id_anggota"));

      let val = getVal(obj, h);
      return val !== undefined ? val : "";
    });
    newMatrix.push(newRow);
  });

  sheet.getRange(1, 1, newMatrix.length, defaultProkerHeaders.length).setValues(newMatrix);
  
  // Format id_anggota column (Column 10 / J) as Plain Text
  if (newMatrix.length > 1) {
    sheet.getRange(2, 10, newMatrix.length - 1, 1).setNumberFormat("@");
  }
}

/** Decode base64 dan simpan ke Google Drive folder 'bukti transaksi' */
function saveImageToDrive(base64Data, transactionId) {
  if (!base64Data) return "";
  const base64Str = base64Data.toString().trim();
  if (!base64Str.startsWith("data:")) {
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
    const ext = contentType.split(";")[0].split("/")[1] || "jpg";
    const blob = Utilities.newBlob(decoded, contentType, "bukti_" + transactionId + "." + ext);
    
    const folderName = "bukti transaksi";
    let folder = null;
    const folders = DriveApp.getFoldersByName(folderName);
    while (folders.hasNext()) {
      const f = folders.next();
      if (!f.isTrashed()) {
        folder = f;
        break;
      }
    }
    if (!folder) {
      folder = DriveApp.createFolder(folderName);
    }
    
    const file = folder ? folder.createFile(blob) : DriveApp.createFile(blob);
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

/** 
 * Verifikasi apakah transaksi benar-benar iuran kas pengurus/anggota:
 * - Jenis HARUS "Masuk"
 * - Tidak terikat pada proker tertentu (bukan HTM/donasi proker)
 * - Bukan transaksi penyesuaian/selisih saldo/operasional umum
 * - Kategori kas ATAU keterangan/uraian memuat indikasi kas/iuran
 */
function isIuranKasTransaction(t) {
  if (!t) return false;

  // 1. Jenis arus kas HARUS "Masuk"
  const jenis = (t.jenis !== undefined && t.jenis !== null) ? t.jenis.toString().trim().toLowerCase() : "";
  if (jenis !== "masuk") return false;

  // 2. Tidak boleh terikat pada kegiatan/proker spesifik
  const prokerId = (t.proker_id !== undefined && t.proker_id !== null) 
    ? t.proker_id.toString().trim() 
    : ((t.id_kegiatan !== undefined && t.id_kegiatan !== null) ? t.id_kegiatan.toString().trim() : "");
  if (prokerId !== "" && prokerId !== "0" && prokerId !== "NULL") return false;

  // 3. Filter teks keterangan, uraian, dan catatan
  const uraian = (t.uraian || "").toString().trim().toLowerCase();
  const ket = (t.keterangan || "").toString().trim().toLowerCase();
  const catat = (t.catatan || "").toString().trim().toLowerCase();
  const combined = uraian + " " + ket + " " + catat;

  // Kecualikan penyesuaian selisih bulatan, saldo awal, turunan, dan transaksi non-iuran
  if (combined.includes("penyesuaian") || 
      combined.includes("selisih") || 
      combined.includes("pembulatan") || 
      combined.includes("saldo awal") || 
      combined.includes("turunan") ||
      combined.includes("qris & mdr") ||
      combined.includes("e-statement")) {
    return false;
  }

  // 4. Kategori atau uraian/keterangan harus merujuk pada iuran kas
  const catLower = (t.kategori || "").toString().trim().toLowerCase();
  const isExplicitKasCat = (
    catLower === "kas" || 
    catLower === "kas pengurus" || 
    catLower === "kas pengerus" || 
    catLower === "kas bulanan" || 
    catLower === "uang kas" || 
    catLower === "iuran kas"
  );

  const isExplicitKasText = (
    combined.includes("kas ") || 
    combined.startsWith("kas") || 
    combined.includes("iuran") || 
    combined.includes("bayar kas") || 
    combined.includes("uang kas")
  );

  return isExplicitKasCat && isExplicitKasText;
}

/** Periksa apakah transaksi ditujukan untuk anggota tertentu secara aman */
function isTransactionForMember(t, member) {
  if (t.user_id && safeCompareIds(t.user_id, member.id)) {
    return true;
  }
  
  // Jika user_id kosong, coba lakukan pencocokan nama di kolom keterangan / uraian
  const tUserIdStr = t.user_id ? t.user_id.toString().trim().toUpperCase() : "";
  if (!t.user_id || tUserIdStr === "" || tUserIdStr === "NULL" || tUserIdStr === "0") {
    const combined = ((t.keterangan || "") + " " + (t.uraian || "")).toLowerCase();
    const nameLower = (member.name || "").toLowerCase().trim();
    if (!nameLower) return false;

    // 1. Cek nama lengkap
    if (combined.includes(nameLower)) return true;

    // 2. Cek bagian nama (abaikan awalan umum seperti muhammad / ahmad jika ada nama berikutnya)
    const commonPrefixes = ["muhammad", "mohammad", "m.", "muh.", "ahmad", "achmad"];
    const parts = nameLower.split(/\s+/).filter(p => p.length >= 3);
    const distinctiveParts = parts.filter(p => !commonPrefixes.includes(p));

    if (distinctiveParts.length > 0) {
      const matchDistinctive = distinctiveParts.some(dp => {
        const regex = new RegExp("\\b" + escapeRegExp(dp) + "\\b", "i");
        return regex.test(combined);
      });
      if (matchDistinctive) return true;
    } else if (parts.length > 0) {
      const regex = new RegExp("\\b" + escapeRegExp(parts[0]) + "\\b", "i");
      if (regex.test(combined)) return true;
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

/** Bersihkan kolom duplikat/kosong secara aman dari kanan ke kiri berdasarkan header */
function cleanDuplicateColumns(ss) {
  try {
    const sheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_TRANSAKSI);
    if (!sheet) return;
    const lastCol = sheet.getLastColumn();
    if (lastCol <= 1) return;
    
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const seen = new Set();
    
    for (let c = lastCol - 1; c >= 0; c--) {
      const header = headers[c] ? headers[c].toString().trim().toLowerCase() : "";
      if (header === "" || seen.has(header)) {
        sheet.deleteColumn(c + 1);
        Logger.log("Menghapus kolom duplikat/kosong di posisi " + (c + 1) + ": '" + headers[c] + "'");
      } else {
        seen.add(header);
      }
    }
    SpreadsheetApp.flush();
  } catch (err) {
    Logger.log("Gagal membersihkan kolom duplikat: " + err.toString());
  }
}

/** Mengonversi berbagai format tanggal ke format standar YYYY-MM-DD */
function formatDateStandard(dateVal) {
  if (dateVal === undefined || dateVal === null || dateVal === "") return "";
  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return "";
    const yyyy = dateVal.getFullYear();
    const mm = String(dateVal.getMonth() + 1).padStart(2, '0');
    const dd = String(dateVal.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const str = dateVal.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }
  const parts = str.split(/[\/\-\.]/);
  if (parts.length >= 3) {
    let day, month, year;
    if (parts[0].length === 4) {
      year = parts[0];
      month = parts[1].padStart(2, '0');
      day = parts[2].padStart(2, '0');
    } else if (parts[2].length === 4) {
      year = parts[2];
      day = parts[0].padStart(2, '0');
      month = parts[1].padStart(2, '0');
    }
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  }
  return str;
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


