/**
 * AI-Powered CV Generator.
 *
 * generateSummary() calls Gemini (if GEMINI_API_KEY is configured) to write
 * a short professional summary from the student's profile. Without a key it
 * falls back to a template so the feature still works out of the box.
 *
 * buildResumePdf() lays the profile out as an ATS-friendly PDF using pdfkit
 * (single column, standard fonts, no tables/graphics — the layout choices
 * that actually make a PDF parse cleanly through an ATS).
 */
const PDFDocument = require('pdfkit');

async function generateSummary(student) {
  const skills = student.studentProfile?.skills || [];
  const degree = student.academicProfile?.degreeProgram || 'their field';
  const projectCount = student.studentProfile?.projects?.length || 0;

  const fallback = `Motivated ${degree} student${skills.length ? ` with hands-on experience in ${skills.slice(0, 5).join(', ')}` : ''}${projectCount ? ` and ${projectCount} completed project${projectCount === 1 ? '' : 's'}` : ''}. Seeking to apply academic training and practical skills in a professional internship or entry-level role.`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const prompt = `Write a concise, ATS-friendly 2-3 sentence professional resume summary (no headings, no markdown) for a ${degree} student. Skills: ${skills.join(', ') || 'not specified'}. Bio: ${student.studentProfile?.bio || 'not specified'}. Return only the summary text.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || fallback;
  } catch (err) {
    console.error('[nexvia] Gemini summary generation failed, using fallback:', err.message);
    return fallback;
  }
}

function buildResumePdf(student, summary) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const sp = student.studentProfile || {};
  const ap = student.academicProfile || {};

  doc.font('Helvetica-Bold').fontSize(20).text(student.name);
  doc.font('Helvetica').fontSize(10).fillColor('#333')
    .text(`${student.email}${ap.degreeProgram ? '  |  ' + ap.degreeProgram : ''}${ap.department ? '  |  ' + ap.department : ''}`);
  doc.moveDown(1);

  section(doc, 'Professional Summary');
  doc.font('Helvetica').fontSize(11).fillColor('#000').text(summary, { align: 'left' });
  doc.moveDown(1);

  if (sp.skills?.length) {
    section(doc, 'Skills');
    doc.font('Helvetica').fontSize(11).text(sp.skills.join(', '));
    doc.moveDown(1);
  }

  if (sp.education?.length) {
    section(doc, 'Education');
    sp.education.forEach((e) => {
      doc.font('Helvetica-Bold').fontSize(11).text(`${e.qualification || ''} — ${e.institution || ''}`);
      doc.font('Helvetica').fontSize(10).fillColor('#333').text(e.year || '');
      doc.fillColor('#000').moveDown(0.5);
    });
    doc.moveDown(0.5);
  }

  if (sp.experience?.length) {
    section(doc, 'Experience');
    sp.experience.forEach((e) => {
      doc.font('Helvetica-Bold').fontSize(11).text(`${e.title || ''} — ${e.organization || ''}`);
      doc.font('Helvetica').fontSize(10).fillColor('#333').text(`${e.startDate || ''} – ${e.endDate || 'Present'}`);
      if (e.description) doc.fillColor('#000').fontSize(10).text(e.description);
      doc.moveDown(0.5);
    });
    doc.moveDown(0.5);
  }

  if (sp.projects?.length) {
    section(doc, 'Projects');
    sp.projects.forEach((p) => {
      doc.font('Helvetica-Bold').fontSize(11).text(p.title || '');
      if (p.techStack?.length) doc.font('Helvetica').fontSize(9).fillColor('#333').text(`Tech: ${p.techStack.join(', ')}`);
      if (p.description) doc.fillColor('#000').fontSize(10).text(p.description);
      if (p.link) doc.fillColor('#1a5fb4').fontSize(9).text(p.link, { link: p.link, underline: true });
      doc.fillColor('#000').moveDown(0.5);
    });
  }

  return doc;
}

function section(doc, title) {
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a1a').text(title.toUpperCase());
  doc.moveTo(doc.x, doc.y + 2).lineTo(doc.page.width - doc.page.margins.right, doc.y + 2).strokeColor('#cccccc').stroke();
  doc.moveDown(0.5);
}

module.exports = { generateSummary, buildResumePdf };
