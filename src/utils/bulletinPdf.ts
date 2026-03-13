interface SubjectGradeData {
  subject_name: string;
  coefficient: number;
  average: number | null;
}

export interface BulletinPdfData {
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
  if (value >= 16) return '#059669';
  if (value >= 14) return '#16a34a';
  if (value >= 10) return '#2563eb';
  if (value >= 8) return '#ea580c';
  return '#dc2626';
};

const getGradeBg = (value: number): string => {
  if (value >= 16) return '#ecfdf5';
  if (value >= 14) return '#f0fdf4';
  if (value >= 10) return '#eff6ff';
  if (value >= 8) return '#fff7ed';
  return '#fef2f2';
};

const getMention = (avg: number): string => {
  if (avg >= 16) return 'Très Bien';
  if (avg >= 14) return 'Bien';
  if (avg >= 12) return 'Assez Bien';
  if (avg >= 10) return 'Passable';
  return 'Insuffisant';
};

export const generateBulletinHtml = (data: BulletinPdfData): string => {
  const subjectsWithGrades = data.subjectGrades.filter(sg => sg.average !== null);
  const totalCoeff = subjectsWithGrades.reduce((s, sg) => s + sg.coefficient, 0);
  const totalCoeffAll = data.subjectGrades.reduce((s, sg) => s + sg.coefficient, 0);

  const subjectRows = data.subjectGrades.map((sg, i) => {
    const bgColor = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const gradeDisplay = sg.average !== null
      ? `<span style="display:inline-block;padding:3px 10px;border-radius:6px;background:${getGradeBg(sg.average)};color:${getGradeColor(sg.average)};font-weight:700;font-size:14px">${sg.average.toFixed(2)}</span>`
      : '<span style="color:#94a3b8">—</span>';
    const coeffGrade = sg.average !== null
      ? `<span style="font-weight:600;color:#334155">${(sg.average * sg.coefficient).toFixed(2)}</span>`
      : '<span style="color:#94a3b8">—</span>';

    return `
    <tr style="background:${bgColor}">
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:500;color:#1e293b;font-size:13px">${sg.subject_name}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:13px">${sg.coefficient}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${gradeDisplay}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${coeffGrade}</td>
    </tr>`;
  }).join('');

  const mention = data.average !== null ? getMention(data.average) : '';
  const mentionColor = data.average !== null ? getGradeColor(data.average) : '#999';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Bulletin - ${data.studentName}</title>
<style>
  @page { size: A4; margin: 12mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', -apple-system, Arial, sans-serif; color: #1e293b; font-size: 13px; line-height: 1.5; padding: 0; }
  
  .page { max-width: 210mm; margin: 0 auto; padding: 20px 24px; }
  
  /* Header */
  .header { text-align: center; padding-bottom: 16px; margin-bottom: 18px; position: relative; }
  .header::after { content: ''; position: absolute; bottom: 0; left: 10%; right: 10%; height: 3px; background: linear-gradient(90deg, transparent, #1e40af, #3b82f6, #1e40af, transparent); border-radius: 2px; }
  .school-name { font-size: 24px; font-weight: 800; color: #1e293b; letter-spacing: -0.5px; margin-bottom: 2px; }
  .subtitle { font-size: 15px; color: #1e40af; font-weight: 600; margin: 4px 0; letter-spacing: 1px; text-transform: uppercase; }
  .year-badge { display: inline-block; padding: 3px 16px; background: #1e40af; color: white; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 6px; }
  
  /* Student Info */
  .info-bar { display: flex; gap: 0; margin: 16px 0; border-radius: 10px; overflow: hidden; border: 1.5px solid #e2e8f0; }
  .info-cell { flex: 1; padding: 10px 14px; text-align: center; border-right: 1px solid #e2e8f0; }
  .info-cell:last-child { border-right: none; }
  .info-cell .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; font-weight: 600; }
  .info-cell .value { font-size: 14px; font-weight: 700; color: #1e293b; margin-top: 2px; }
  
  /* Table */
  .grades-table { width: 100%; border-collapse: collapse; margin: 16px 0; border-radius: 10px; overflow: hidden; border: 1.5px solid #e2e8f0; }
  .grades-table thead th { background: linear-gradient(135deg, #1e293b, #334155); color: white; padding: 11px 8px; text-align: center; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; }
  .grades-table thead th:first-child { text-align: left; padding-left: 14px; }
  .grades-table tfoot td { background: linear-gradient(135deg, #1e40af, #2563eb); color: white; font-weight: 700; padding: 11px 8px; text-align: center; font-size: 13px; }
  .grades-table tfoot td:first-child { text-align: left; padding-left: 14px; }
  
  /* Summary */
  .summary-grid { display: flex; gap: 12px; margin: 18px 0; }
  .summary-card { flex: 1; text-align: center; padding: 14px 10px; border-radius: 10px; border: 1.5px solid #e2e8f0; }
  .summary-card.main { background: linear-gradient(135deg, #eff6ff, #dbeafe); border-color: #93c5fd; }
  .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 600; }
  .summary-card .value { font-size: 26px; font-weight: 800; margin-top: 2px; }
  .summary-card .sub { font-size: 11px; color: #64748b; margin-top: 2px; }
  
  /* Appreciation */
  .appreciation { margin: 10px 0; padding: 12px 16px; border-radius: 8px; background: #f8fafc; border-left: 4px solid #3b82f6; }
  .appreciation .title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #1e40af; font-weight: 700; margin-bottom: 4px; }
  .appreciation p { color: #334155; font-size: 13px; font-style: italic; }
  
  /* Signatures */
  .signatures { display: flex; justify-content: space-between; margin-top: 28px; padding-top: 16px; }
  .sig-box { width: 42%; text-align: center; }
  .sig-title { font-size: 11px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.5px; }
  .sig-line { border-top: 1px dashed #94a3b8; margin-top: 48px; padding-top: 6px; font-size: 10px; color: #94a3b8; }
  .sig-stamp { display: inline-block; margin-top: 8px; padding: 3px 12px; background: #dcfce7; color: #16a34a; border-radius: 4px; font-size: 11px; font-weight: 700; border: 1px solid #86efac; }
  
  /* Footer */
  .footer { text-align: center; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; }
  
  @media print { body { padding: 0; } .page { padding: 0; } }
</style></head><body>
<div class="page">
  <div class="header">
    <div class="school-name">${data.schoolName}</div>
    <div class="subtitle">Bulletin de Notes — ${data.period}</div>
    <div class="year-badge">Année ${data.academicYear}</div>
  </div>

  <div class="info-bar">
    <div class="info-cell">
      <div class="label">Nom de l'élève</div>
      <div class="value">${data.studentName}</div>
    </div>
    <div class="info-cell">
      <div class="label">Matricule</div>
      <div class="value">${data.studentMatricule}</div>
    </div>
    <div class="info-cell">
      <div class="label">Classe</div>
      <div class="value">${data.className || '—'}</div>
    </div>
    <div class="info-cell">
      <div class="label">Classement</div>
      <div class="value">${data.rank && data.totalStudents ? `${data.rank}<span style="font-weight:400;color:#64748b;font-size:12px">/${data.totalStudents}</span>` : '—'}</div>
    </div>
  </div>

  <table class="grades-table">
    <thead>
      <tr>
        <th style="text-align:left;padding-left:14px;width:40%">Matière</th>
        <th style="width:15%">Coefficient</th>
        <th style="width:22%">Moyenne / 20</th>
        <th style="width:23%">Moy. Coeff.</th>
      </tr>
    </thead>
    <tbody>${subjectRows}</tbody>
    <tfoot>
      <tr>
        <td>TOTAL GÉNÉRAL</td>
        <td style="text-align:center">${totalCoeffAll}</td>
        <td style="text-align:center;font-size:16px">${data.average !== null ? data.average.toFixed(2) : '—'}</td>
        <td style="text-align:center">${data.average !== null && totalCoeff > 0 ? (subjectsWithGrades.reduce((s, sg) => s + (sg.average! * sg.coefficient), 0)).toFixed(2) : '—'}</td>
      </tr>
    </tfoot>
  </table>

  <div class="summary-grid">
    <div class="summary-card main">
      <div class="label">Moyenne Générale</div>
      <div class="value" style="color:${data.average !== null ? getGradeColor(data.average) : '#94a3b8'}">${data.average !== null ? data.average.toFixed(2) : '—'}<span style="font-size:14px;font-weight:400;color:#64748b">/20</span></div>
      ${data.average !== null ? `<div class="sub" style="color:${mentionColor};font-weight:700">Mention : ${mention}</div>` : ''}
    </div>
    ${data.rank ? `
    <div class="summary-card">
      <div class="label">Rang</div>
      <div class="value" style="color:#1e293b">${data.rank}<span style="font-size:14px;font-weight:400;color:#64748b">e</span></div>
      <div class="sub">sur ${data.totalStudents} élèves</div>
    </div>` : ''}
    <div class="summary-card">
      <div class="label">Matières évaluées</div>
      <div class="value" style="color:#1e293b">${subjectsWithGrades.length}<span style="font-size:14px;font-weight:400;color:#64748b">/${data.subjectGrades.length}</span></div>
      <div class="sub">Total coeff. ${totalCoeffAll}</div>
    </div>
  </div>

  ${data.teacherAppreciation ? `
  <div class="appreciation">
    <div class="title">📝 Appréciation du Professeur Principal</div>
    <p>${data.teacherAppreciation}</p>
  </div>` : ''}

  ${data.principalAppreciation ? `
  <div class="appreciation" style="border-left-color:#059669;margin-top:8px">
    <div class="title" style="color:#059669">📋 Appréciation du Chef d'Établissement</div>
    <p>${data.principalAppreciation}</p>
  </div>` : ''}

  <div class="signatures">
    <div class="sig-box">
      <div class="sig-title">Le Professeur Principal</div>
      <div class="sig-line">Signature</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Le Chef d'Établissement</div>
      ${data.adminSigned ? '<div class="sig-stamp">✓ Visé et Approuvé</div>' : ''}
      <div class="sig-line">Signature & Cachet</div>
    </div>
  </div>

  <div class="footer">
    ${data.schoolName} — Année académique ${data.academicYear} — Document généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
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
