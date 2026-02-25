interface SubjectGradeData {
  subject_name: string;
  coefficient: number;
  average: number | null;
}

interface BulletinPdfData {
  schoolName: string;
  academicYear: string;
  period: string;
  studentName: string;
  studentMatricule: string;
  className: string;
  average: number | null;
  rank: number | null;
  totalStudents: number | null;
  teacherAppreciation: string | null;
  principalAppreciation: string | null;
  adminSigned: boolean;
  subjectGrades: SubjectGradeData[];
}

const getGradeColor = (value: number): string => {
  if (value >= 16) return '#16a34a';
  if (value >= 14) return '#22c55e';
  if (value >= 10) return '#2563eb';
  if (value >= 8) return '#ea580c';
  return '#dc2626';
};

export const generateBulletinHtml = (data: BulletinPdfData): string => {
  const subjectsWithGrades = data.subjectGrades.filter(sg => sg.average !== null);
  const totalCoeff = subjectsWithGrades.reduce((s, sg) => s + sg.coefficient, 0);

  const subjectRows = data.subjectGrades.map(sg => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd;font-weight:500">${sg.subject_name}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center">${sg.coefficient}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center;color:${sg.average !== null ? getGradeColor(sg.average) : '#999'};font-weight:600">
        ${sg.average !== null ? sg.average.toFixed(2) : '-'}
      </td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center;font-weight:600">
        ${sg.average !== null ? (sg.average * sg.coefficient).toFixed(2) : '-'}
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Bulletin - ${data.studentName}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; color: #1a1a1a; font-size: 13px; }
  .header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #1e40af; padding-bottom: 15px; }
  .header h1 { margin: 0; font-size: 22px; color: #1e40af; }
  .header h2 { margin: 5px 0; font-size: 16px; color: #374151; font-weight: 400; }
  .info-grid { display: flex; justify-content: space-between; margin: 15px 0; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
  .info-item { text-align: center; }
  .info-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-value { font-size: 15px; font-weight: 600; color: #1e293b; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th { background: #1e40af; color: white; padding: 10px 8px; text-align: center; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; }
  th:first-child { text-align: left; }
  tr:nth-child(even) { background: #f8fafc; }
  .summary { display: flex; justify-content: center; gap: 30px; margin: 20px 0; padding: 15px; background: #eff6ff; border-radius: 8px; border: 2px solid #1e40af; }
  .summary-item { text-align: center; }
  .summary-label { font-size: 11px; color: #64748b; }
  .summary-value { font-size: 24px; font-weight: 700; color: #1e40af; }
  .appreciation { margin: 12px 0; padding: 12px; border-left: 4px solid #1e40af; background: #f8fafc; border-radius: 0 8px 8px 0; }
  .appreciation-title { font-weight: 600; color: #1e40af; margin-bottom: 5px; font-size: 12px; text-transform: uppercase; }
  .signature-section { display: flex; justify-content: space-between; margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0; }
  .signature-box { text-align: center; width: 45%; }
  .signature-line { border-top: 1px solid #94a3b8; margin-top: 50px; padding-top: 5px; font-size: 11px; color: #64748b; }
  .stamp { color: #16a34a; font-weight: 600; font-size: 12px; margin-top: 5px; }
  @media print { body { padding: 0; } }
</style></head><body>
  <div class="header">
    <h1>${data.schoolName}</h1>
    <h2>Bulletin de Notes - ${data.period}</h2>
    <p style="margin:3px 0;color:#64748b;font-size:12px">Année Académique : ${data.academicYear}</p>
  </div>

  <div class="info-grid">
    <div class="info-item"><div class="info-label">Élève</div><div class="info-value">${data.studentName}</div></div>
    <div class="info-item"><div class="info-label">Matricule</div><div class="info-value">${data.studentMatricule}</div></div>
    <div class="info-item"><div class="info-label">Classe</div><div class="info-value">${data.className || '-'}</div></div>
    <div class="info-item"><div class="info-label">Rang</div><div class="info-value">${data.rank && data.totalStudents ? `${data.rank}/${data.totalStudents}` : '-'}</div></div>
  </div>

  <table>
    <thead><tr><th style="text-align:left">Matière</th><th>Coef.</th><th>Moyenne /20</th><th>Moy. Coef.</th></tr></thead>
    <tbody>${subjectRows}</tbody>
    <tfoot>
      <tr style="background:#1e40af;color:white;font-weight:700">
        <td style="padding:10px 8px;border:1px solid #1e40af">TOTAL</td>
        <td style="padding:10px 8px;border:1px solid #1e40af;text-align:center">${totalCoeff}</td>
        <td style="padding:10px 8px;border:1px solid #1e40af;text-align:center;font-size:16px">${data.average !== null ? data.average.toFixed(2) : '-'}</td>
        <td style="padding:10px 8px;border:1px solid #1e40af;text-align:center"></td>
      </tr>
    </tfoot>
  </table>

  <div class="summary">
    <div class="summary-item"><div class="summary-label">Moyenne Générale</div><div class="summary-value" style="color:${data.average ? getGradeColor(data.average) : '#999'}">${data.average !== null ? data.average.toFixed(2) : '-'}/20</div></div>
    ${data.rank ? `<div class="summary-item"><div class="summary-label">Classement</div><div class="summary-value">${data.rank}<span style="font-size:14px;color:#64748b">/${data.totalStudents}</span></div></div>` : ''}
  </div>

  ${data.teacherAppreciation ? `
  <div class="appreciation">
    <div class="appreciation-title">Appréciation du Professeur Principal</div>
    <p style="margin:0;color:#334155">${data.teacherAppreciation}</p>
  </div>` : ''}

  ${data.principalAppreciation ? `
  <div class="appreciation">
    <div class="appreciation-title">Appréciation du Chef d'Établissement</div>
    <p style="margin:0;color:#334155">${data.principalAppreciation}</p>
  </div>` : ''}

  <div class="signature-section">
    <div class="signature-box">
      <div style="font-weight:600;font-size:12px">Le Professeur Principal</div>
      <div class="signature-line">Signature</div>
    </div>
    <div class="signature-box">
      <div style="font-weight:600;font-size:12px">Le Chef d'Établissement</div>
      ${data.adminSigned ? '<div class="stamp">✓ Signé</div>' : ''}
      <div class="signature-line">Signature et Cachet</div>
    </div>
  </div>
</body></html>`;
};

export const printBulletin = (data: BulletinPdfData) => {
  const html = generateBulletinHtml(data);
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
};
