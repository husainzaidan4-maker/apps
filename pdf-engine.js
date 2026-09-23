/**
 * pdf-engine.js
 * ENGINE PEMROSESAN & MODIFIKASI PDF
 * Menangani ekstraksi (simulasi), anotasi visual (rectangle, highlight), dan pembuatan Summary A4.
 */

// Fungsi utama yang akan dipanggil oleh index.html
async function processPDFFile(file) {
    if (typeof window.PDFLib === 'undefined') {
        throw new Error("Library PDF-lib tidak ditemukan. Pastikan CDN sudah dimuat di index.html.");
    }

    const { PDFDocument, rgb, StandardFonts } = window.PDFLib;

    // 1. Load PDF yang diupload
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    
    // Load Fonts
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // 2. Ekstraksi Informasi Produk & Data Weighing (Simulasi untuk prototype)
    // Dalam production, bagian ini menggunakan pdf.js untuk membaca text layer dan koordinatnya.
    const extractedData = simulatePDFExtraction();
    const productInfo = extractedData.productInfo;
    const weighingData = extractedData.weighingData;

    // 3. Jalankan Business Logic Engine (weighing-engine.js)
    // Asumsi: processWeighing sudah tersedia di global scope dari file sebelumnya
    let logicResult;
    try {
        logicResult = processWeighing(weighingData, productInfo.kodeProduk);
    } catch (error) {
        throw new Error("Gagal memproses data: " + error.message);
    }

    // 4. Proses Halaman Pertama (Untuk memberikan marking)
    const pages = pdfDoc.getPages();
    const firstPage = pages[0]; // Asumsi tabel berat ada di halaman 1

    // Konstanta Visual
    const colorGroupBorder = rgb(0.2, 0.2, 0.8); // Biru untuk border group
    const colorRefBg = rgb(1, 0.9, 0.2); // Kuning transparan untuk reference
    const colorMaxBg = rgb(0.2, 0.8, 0.2); // Hijau transparan untuk max

    // A. Gambar Rectangle untuk setiap Group
    logicResult.groups.forEach(group => {
        const dataInGroup = group.data;
        if (dataInGroup.length === 0) return;

        // Cari Y tertinggi (baris pertama) dan Y terendah (baris terakhir) di group ini
        const startY = dataInGroup[0].y;
        const endY = dataInGroup[dataInGroup.length - 1].y;
        
        // Asumsi tinggi teks adalah 12pt. Rectangle menutupi area tersebut
        const rectHeight = (startY - endY) + 15;
        
        firstPage.drawRectangle({
            x: dataInGroup[0].x - 5, // padding kiri
            y: endY - 3,             // titik bawah (Y PDF dihitung dari bawah)
            width: 60,               // lebar mencakup seluruh angka tanpa terlalu sempit
            height: rectHeight,
            borderColor: colorGroupBorder,
            borderWidth: 1.5,
            color: undefined // Tanpa fill, hanya border
        });
    });

    // B. Gambar Highlight untuk Reference
    logicResult.references.forEach(ref => {
        firstPage.drawRectangle({
            x: ref.x - 3,
            y: ref.y - 2,
            width: 56,
            height: 14,
            color: colorRefBg,
            opacity: 0.5
        });
    });

    // C. Gambar Highlight untuk Maximum Weight di combined group
    const maxItem = logicResult.combinedRows.find(item => item.weight === logicResult.maxWeight);
    if (maxItem) {
        firstPage.drawRectangle({
            x: maxItem.x - 3,
            y: maxItem.y - 2,
            width: 56,
            height: 14,
            color: colorMaxBg,
            opacity: 0.5
        });
    }

    // 5. Tambahkan Halaman Summary A4
    createSummaryPage(pdfDoc, fontRegular, fontBold, productInfo, logicResult, rgb);

    // 6. Return PDF sebagai Blob
    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Fungsi untuk membuat Summary Page A4
 */
function createSummaryPage(pdfDoc, fontRegular, fontBold, productInfo, result, rgb) {
    // Ukuran A4 Portrait (595.28 x 841.89 points)
    const page = pdfDoc.addPage([595.28, 841.89]);
    let currentY = 780; // Mulai dari atas
    const marginX = 50;
    const col2X = 220; // Posisi nilai untuk tabel informasi

    const drawText = (text, x, y, font, size = 11, color = rgb(0,0,0)) => {
        page.drawText(text, { x, y, font, size, color });
    };

    // --- JUDUL ---
    drawText("SUMMARY", marginX, currentY, fontBold, 16);
    currentY -= 40;

    // --- INFORMASI PRODUK ---
    drawText("INFORMASI PRODUK", marginX, currentY, fontBold, 12);
    currentY -= 20;

    const printInfoRow = (label, value) => {
        drawText(label, marginX, currentY, fontRegular);
        drawText(": " + value, col2X, currentY, fontRegular);
        currentY -= 18;
    };

    printInfoRow("Kode Produk", productInfo.kodeProduk);
    printInfoRow("Nama Produk", productInfo.namaProduk);
    printInfoRow("No. Batch", productInfo.noBatch);
    printInfoRow("No. Schedule", productInfo.noSchedule);
    printInfoRow("Isi Per MB", productInfo.isiPerMB);
    printInfoRow("Start Range Penimbangan", productInfo.startRange);
    printInfoRow("End Range Penimbangan", productInfo.endRange);
    printInfoRow("ED", productInfo.ed);
    printInfoRow("MD", productInfo.md);
    printInfoRow("Range Penimbangan", productInfo.rangePenimbangan);
    
    currentY -= 20;

    // --- HASIL PERHITUNGAN ---
    drawText("HASIL PERHITUNGAN", marginX, currentY, fontBold, 12);
    currentY -= 20;

    drawText("Berat Terendah", marginX, currentY, fontRegular);
    drawText(`: ${result.minWeight.toFixed(3)} KG`, col2X, currentY, fontBold);
    currentY -= 25;

    drawText("Berat Batas Verifikasi", marginX, currentY, fontRegular);
    drawText(`: ${result.verificationFormula}`, col2X, currentY, fontBold);
    currentY -= 40;

    // --- KESIMPULAN ---
    drawText("KESIMPULAN", marginX, currentY, fontBold, 12);
    currentY -= 15;

    // Box Kesimpulan
    page.drawRectangle({
        x: marginX,
        y: currentY - 25,
        width: 300,
        height: 30,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
        color: rgb(0.95, 0.95, 0.95)
    });

    const isDilakukan = result.conclusion === "DILAKUKAN VERIFIKASI";
    const conclusionColor = isDilakukan ? rgb(0.8, 0, 0) : rgb(0, 0.5, 0); // Merah jika dilakukan, hijau jika tidak

    drawText(result.conclusion, marginX + 15, currentY - 16, fontBold, 12, conclusionColor);
    currentY -= 45;

    // Alasan
    drawText(result.conclusionReason, marginX, currentY, fontRegular, 11, rgb(0.3, 0.3, 0.3));

    // --- VERIFIKASI OPERATOR ---
    // Posisi di kanan bawah halaman
    const operatorX = 400;
    const operatorY = 150;

    drawText("Verifikasi Operator", operatorX, operatorY, fontRegular, 11);
    
    // Jarak vertikal tanpa box, tanpa garis horizontal, tanpa tanggal
    drawText("(                                )", operatorX - 10, operatorY - 60, fontRegular, 11);
}

/**
 * MOCK DATA GENERATOR
 * Menghasilkan data simulasi untuk keperluan prototipe agar dapat diuji di browser.
 * Data ini dibuat dengan koordinat (x,y) fiktif yang akan dirender tepat di atas PDF yang diupload.
 */
function simulatePDFExtraction() {
    const productInfo = {
        kodeProduk: "LKPTA",
        namaProduk: "PRODUK PROTOTYPE",
        noBatch: "B-88291",
        noSchedule: "SCH-001",
        isiPerMB: "50 PCS",
        startRange: "14.000 KG",
        endRange: "15.000 KG",
        ed: "10/2027",
        md: "10/2024",
        rangePenimbangan: "14.200 - 14.800 KG"
    };

    const weighingData = [];
    let currentY = 700; // Asumsi angka dimulai dari Y=700 pada PDF
    const startX = 100; // Posisi horizontal angka

    // Simulasi 20 baris data weighing
    // Kita buat row 5 sebagai referensi terendah (14.431)
    // Kita buat row 15 sebagai referensi terendah kedua (14.431)
    const weights = [
        14.610, 14.620, 14.615, 14.500, 14.431, // Row 1-5 (Row 5 min)
        14.510, 14.520, 14.630, 14.550, 14.500, // Row 6-10
        14.600, 14.580, 14.590, 14.625, 14.431, // Row 11-15 (Row 15 min)
        14.650, 14.680, 14.700, 14.620, 14.610  // Row 16-20 (Row 18 max: 14.700)
    ];

    weights.forEach((w, index) => {
        weighingData.push({
            row: index + 1,
            weight: w,
            x: startX,
            y: currentY
        });
        currentY -= 15; // Jarak antar baris teks di PDF
    });

    return { productInfo, weighingData };
}