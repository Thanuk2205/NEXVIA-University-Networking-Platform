const User = require('../models/User');
const { generateSummary, buildResumePdf } = require('../utils/aiResume');

// GET /api/resume/generate — AI-driven resume builder, streams a PDF
async function generateResume(req, res) {
  try {
    const user = req.user;
    if (!['student', 'alumni'].includes(user.role)) {
      return res.status(403).json({ message: 'Resume generation is available for students and alumni' });
    }

    const summary = await generateSummary(user);
    const doc = buildResumePdf(user, summary);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${user.name.replace(/\s+/g, '_')}_Resume.pdf"`);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate resume', error: err.message });
  }
}

module.exports = { generateResume };
