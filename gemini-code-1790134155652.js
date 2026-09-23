/**
 * weighing-engine.js
 * ENGINE LOGIKA BISNIS AUTOMASI DOKUMEN WEIGHING
 * Tidak mengandung logika PDF, murni untuk memproses data angka.
 */

// Config sederhana untuk prototype
const productConfig = {
    "LKPTA": {
        cartonWeight: 0.200
    },
    "LKJTA": {
        cartonWeight: 0.200
    }
};

/**
 * Fungsi utama pemrosesan data weighing
 * @param {Array} data - Array of objects [{row: 1, weight: 14.431}, ...]
 * @param {String} productCode - Kode produk untuk mendapatkan config (misal: "LKPTA")
 * @returns {Object} Hasil analisis lengkap
 */
function processWeighing(data, productCode) {
    // 1. Dapatkan config produk
    const config = productConfig[productCode];
    if (!config) {
        throw new Error(`Kode Produk "${productCode}" tidak ditemukan dalam konfigurasi.`);
    }

    const cartonWeight = config.cartonWeight;

    // 2. Filter data valid (numeric, > 0, bukan string/NA/kosong)
    const validData = [];
    data.forEach(item => {
        const w = Number(item.weight);
        if (!isNaN(w) && w > 0) {
            validData.push({
                row: item.row,
                weight: w,
                originalIndex: item.row // menyimpan nomor baris asli
            });
        }
    });

    if (validData.length === 0) {
        throw new Error("Tidak ada data weighing yang valid untuk diproses.");
    }

    // 3. Cari Berat Terendah (minWeight)
    let minWeight = validData[0].weight;
    validData.forEach(item => {
        if (item.weight < minWeight) {
            minWeight = item.weight;
        }
    });

    // 4. Cari Reference(s)
    const references = [];
    const referenceIndices = []; // index di dalam array validData
    validData.forEach((item, index) => {
        if (item.weight === minWeight) {
            references.push(item);
            referenceIndices.push(index);
        }
    });

    // 5. Buat Group / Window untuk masing-masing reference
    const groups = [];
    
    referenceIndices.forEach(refIndex => {
        const N = validData.length;
        let leftTake = 5;
        let rightTake = 5;

        // Aturan Sliding Window sesuai permintaan:
        if (refIndex === 0) {
            // ATURAN PALING ATAS
            leftTake = 0;
            rightTake = 9;
        } else if (refIndex === N - 1) {
            // ATURAN PALING BAWAH
            leftTake = 9;
            rightTake = 0;
        } else {
            // Jika salah satu sisi kurang dari 5, alihkan ke sisi lain (Total elemen 10 selain reference = 11)
            if (refIndex < 5) {
                leftTake = refIndex;
                rightTake = 10 - leftTake;
            } else if (N - 1 - refIndex < 5) {
                rightTake = N - 1 - refIndex;
                leftTake = 10 - rightTake;
            }
        }

        // Pastikan tidak mengambil lebih dari data yang tersedia
        leftTake = Math.min(leftTake, refIndex);
        rightTake = Math.min(rightTake, N - 1 - refIndex);

        const startIndex = refIndex - leftTake;
        const endIndex = refIndex + rightTake;

        const groupData = validData.slice(startIndex, endIndex + 1);
        
        groups.push({
            reference: validData[refIndex],
            data: groupData
        });
    });

    // 6. Gabungkan seluruh data dari multiple groups (Unique Rows)
    const combinedMap = new Map();
    groups.forEach(group => {
        group.data.forEach(item => {
            combinedMap.set(item.row, item);
        });
    });

    // Urutkan kembali berdasarkan row
    const combinedRows = Array.from(combinedMap.values()).sort((a, b) => a.row - b.row);

    // 7. Cari Berat MB Terbesar dari combined group
    let maxWeight = combinedRows[0].weight;
    combinedRows.forEach(item => {
        if (item.weight > maxWeight) {
            maxWeight = item.weight;
        }
    });

    // 8. Hitung Berat Batas Verifikasi
    // Pastikan presisi floating point JS aman (3 desimal)
    const verificationLimit = parseFloat((maxWeight - cartonWeight).toFixed(3));
    const maxWeightFixed = maxWeight.toFixed(3);
    const cartonWeightFixed = cartonWeight.toFixed(3);
    const verificationLimitFixed = verificationLimit.toFixed(3);
    
    const verificationFormula = `${maxWeightFixed} - ${cartonWeightFixed} = ${verificationLimitFixed} KG`;

    // 9. Kesimpulan
    let conclusion = "";
    let conclusionReason = "";

    if (minWeight > verificationLimit) {
        conclusion = "TIDAK DILAKUKAN VERIFIKASI";
        conclusionReason = "Karena berat terendah lebih besar dengan berat batas verifikasi.";
    } else {
        conclusion = "DILAKUKAN VERIFIKASI";
        conclusionReason = "Karena berat terendah tidak lebih besar dengan berat batas verifikasi.";
    }

    // 10. Kembalikan Result
    return {
        minWeight,
        references,
        groups,
        combinedRows,
        maxWeight,
        cartonWeight,
        verificationLimit,
        verificationFormula,
        conclusion,
        conclusionReason
    };
}

// Export jika menggunakan Node.js/Modul, tapi biarkan tersedia di global scope untuk browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { processWeighing, productConfig };
}