import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ExamResult, Student } from '../types/cbt';

export function sortResultsByRank(results: ExamResult[]): ExamResult[] {
  return [...results].sort((a, b) => {
    if (b.final_score !== a.final_score) return b.final_score - a.final_score;
    if (a.cheat_count !== b.cheat_count) return a.cheat_count - b.cheat_count;
    return a.student_name.localeCompare(b.student_name);
  });
}

export function computeResultStats(results: ExamResult[]) {
  if (results.length === 0) {
    return {
      avg: 0,
      highest: 0,
      highestStudent: '-',
      lowest: 0,
      lowestStudent: '-',
      total: 0,
      passRate: 0,
    };
  }
  const sorted = sortResultsByRank(results);
  const sum = sorted.reduce((acc, r) => acc + r.final_score, 0);
  const passed = sorted.filter((r) => r.final_score >= 75).length;
  return {
    avg: Number((sum / sorted.length).toFixed(1)),
    highest: sorted[0].final_score,
    highestStudent: sorted[0].student_name,
    lowest: sorted[sorted.length - 1].final_score,
    lowestStudent: sorted[sorted.length - 1].student_name,
    total: sorted.length,
    passRate: Math.round((passed / sorted.length) * 100),
  };
}

export function exportResultsToExcel(
  results: ExamResult[],
  subjectLabel: string,
  examTitle: string
) {
  const sorted = sortResultsByRank(results);
  const stats = computeResultStats(sorted);

  const rows: (string | number)[][] = [
    ['REKAPITULASI RESMI HASIL UJIAN SEKOLAH (CBT)'],
    ['Judul Ujian', examTitle],
    ['Mata Pelajaran', subjectLabel],
    ['Tanggal Ekspor', new Date().toLocaleString('id-ID')],
    [],
    ['RINGKASAN STATISTIK', 'Rata-Rata', stats.avg, 'Tertinggi', stats.highest, 'Terendah', stats.lowest, 'Ketuntasan (>=75)', `${stats.passRate}%`],
    [],
    ['Rank', 'NISN', 'Nama Siswa', 'Kelas', 'Mata Pelajaran', 'Nilai Akhir', 'Benar', 'Salah', 'Kosong', 'Pelanggaran Tab', 'Status', 'Waktu Selesai'],
  ];

  sorted.forEach((r, idx) => {
    rows.push([
      idx + 1,
      r.student_nisn,
      r.student_name,
      r.student_class,
      r.subject,
      r.final_score,
      r.correct_count,
      r.incorrect_count,
      r.unattempted_count,
      r.cheat_count,
      r.final_score >= 75 ? 'Tuntas' : 'Perlu Remedial',
      r.completed_at,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 15 },
    { wch: 28 },
    { wch: 10 },
    { wch: 24 },
    { wch: 12 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Nilai');
  const safeSubject = subjectLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `Rekap_Nilai_CBT_${safeSubject}.xlsx`);
}

export function exportResultsToPDF(
  results: ExamResult[],
  subjectLabel: string,
  examTitle: string,
  teacherName: string
) {
  const sorted = sortResultsByRank(results);
  const stats = computeResultStats(sorted);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('LEMBAR REKAPITULASI RESMI HASIL UJIAN SEKOLAH', 105, 16, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(examTitle, 105, 22, { align: 'center' });
  doc.text(`Mata Pelajaran: ${subjectLabel}   |   Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 105, 27, { align: 'center' });

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.5);
  doc.line(14, 31, 196, 31);

  autoTable(doc, {
    startY: 35,
    head: [['Rata-Rata', 'Tertinggi', 'Terendah', 'Total Peserta', 'Ketuntasan (>=75)']],
    body: [[
      String(stats.avg),
      `${stats.highest} (${stats.highestStudent})`,
      `${stats.lowest} (${stats.lowestStudent})`,
      `${stats.total} Siswa`,
      `${stats.passRate}%`,
    ]],
    theme: 'grid',
    headStyles: { fillColor: [30, 64, 175], fontSize: 8, halign: 'center' },
    bodyStyles: { fontSize: 8, halign: 'center', fontStyle: 'bold' },
  });

  const finalYAfterSummary = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 55;

  autoTable(doc, {
    startY: finalYAfterSummary + 6,
    head: [['Rank', 'NISN', 'Nama Siswa', 'Kelas', 'Nilai', 'B / S / K', 'Pelanggaran', 'Waktu Selesai']],
    body: sorted.map((r, idx) => [
      idx + 1,
      r.student_nisn,
      r.student_name,
      r.student_class,
      r.final_score,
      `${r.correct_count} / ${r.incorrect_count} / ${r.unattempted_count}`,
      `${r.cheat_count}x`,
      r.completed_at,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 11 },
      1: { cellWidth: 25 },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'center', fontStyle: 'bold', cellWidth: 14 },
      5: { halign: 'center', cellWidth: 22 },
      6: { halign: 'center', cellWidth: 20 },
    },
  });

  const tableEndY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 180;
  const sigY = tableEndY + 14 > 255 ? 25 : tableEndY + 14;
  if (tableEndY + 14 > 255) {
    doc.addPage();
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Mengetahui,', 38, sigY, { align: 'center' });
  doc.text('Kepala Sekolah', 38, sigY + 5, { align: 'center' });
  doc.text('( ........................................ )', 38, sigY + 25, { align: 'center' });

  doc.text('Dibuat Oleh,', 162, sigY, { align: 'center' });
  doc.text(teacherName || 'Guru Mata Pelajaran', 162, sigY + 5, { align: 'center' });
  doc.text('( ........................................ )', 162, sigY + 25, { align: 'center' });

  const safeSubject = subjectLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Laporan_Resmi_CBT_${safeSubject}.pdf`);
}

export function downloadStudentExcelTemplate() {
  const rows = [
    ['NISN', 'Nama Lengkap', 'Kelas', 'Password'],
    ['0081234501', 'Aditya Pratama Putra', 'IX-A', '123'],
    ['0081234502', 'Aisyah Putri Maharani', 'IX-A', '123'],
    ['0081234503', 'Bagas Kurniawan', 'IX-B', '123'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template Siswa');
  XLSX.writeFile(wb, 'Template_Data_Siswa_CBT.xlsx');
}

export async function parseStudentsExcelFile(file: File): Promise<Student[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const imported: Student[] = [];
  raw.forEach((row, index) => {
    const nisn = String(row['NISN'] ?? row['nisn'] ?? row['No Peserta'] ?? '').trim();
    const name = String(row['Nama Lengkap'] ?? row['Nama'] ?? row['name'] ?? '').trim();
    const className = String(row['Kelas'] ?? row['Rombel'] ?? row['class'] ?? 'IX-A').trim();
    const password = String(row['Password'] ?? row['password'] ?? '123').trim() || '123';

    if (nisn && name) {
      imported.push({
        id: `s-imp-${Date.now()}-${index}`,
        nisn,
        name,
        className: className || 'IX-A',
        password,
      });
    }
  });
  return imported;
}

export async function compressImageToDataUrl(file: File, maxBytes = 80 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak valid.'));
      img.onload = () => {
        const maxWidth = 960;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let quality = 0.85;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length * 0.75 > maxBytes && quality > 0.25) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
