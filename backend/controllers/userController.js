const User = require('../models/User');

// GET /api/users/profile
async function getProfile(req, res) {
  res.json({ user: req.user.toSafeObject() });
}

// PUT /api/users/profile
async function updateProfile(req, res) {
  try {
    const { name, academicProfile, studentProfile, companyProfile } = req.body;
    const user = req.user;

    if (name) user.name = name;
    if (academicProfile) user.academicProfile = { ...user.academicProfile?.toObject?.(), ...academicProfile };
    if (studentProfile) user.studentProfile = { ...user.studentProfile?.toObject?.(), ...studentProfile };
    if (companyProfile) user.companyProfile = { ...user.companyProfile?.toObject?.(), ...companyProfile };

    await user.save();
    res.json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update profile', error: err.message });
  }
}

// GET /api/users/alumni-network — students/alumni browsing verified alumni for mentorship
async function listAlumniNetwork(req, res) {
  try {
    const { department, degreeProgram } = req.query;
    const filter = { role: 'alumni', isVerified: true };
    if (department) filter['academicProfile.department'] = department;
    if (degreeProgram) filter['academicProfile.degreeProgram'] = degreeProgram;

    const alumni = await User.find(filter).select('name academicProfile studentProfile.bio');
    res.json({ alumni });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load alumni network', error: err.message });
  }
}

module.exports = { getProfile, updateProfile, listAlumniNetwork };
