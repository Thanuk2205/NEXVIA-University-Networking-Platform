const User = require('../models/User');
const Job = require('../models/Job');
const Post = require('../models/Post');

// GET /api/admin/users — user & corporate verification queue + directory
async function listUsers(req, res) {
  try {
    const { role, verificationStatus } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (verificationStatus) filter.verificationStatus = verificationStatus;

    const users = await User.find(filter).sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: 'Failed to list users', error: err.message });
  }
}

// PATCH /api/admin/users/:id/verify — approve or reject a pending account
async function verifyUser(req, res) {
  try {
    const { decision } = req.body; // 'approved' | 'rejected'
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.verificationStatus = decision;
    user.isVerified = decision === 'approved';
    await user.save();

    res.json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update verification status', error: err.message });
  }
}

// PATCH /api/admin/users/:id/deactivate — platform moderation
async function setActiveStatus(req, res) {
  try {
    const { isActive } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isActive = !!isActive;
    await user.save();
    res.json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update user status', error: err.message });
  }
}

// GET /api/admin/stats — dashboard summary for academic assessment / oversight
async function getStats(req, res) {
  try {
    const [totalUsers, byRole, openJobs, totalPosts, pendingVerifications] = await Promise.all([
      User.countDocuments(),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      Job.countDocuments({ status: 'open' }),
      Post.countDocuments(),
      User.countDocuments({ verificationStatus: 'pending' }),
    ]);

    res.json({
      totalUsers,
      usersByRole: byRole.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {}),
      openJobs,
      totalPosts,
      pendingVerifications,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load stats', error: err.message });
  }
}

module.exports = { listUsers, verifyUser, setActiveStatus, getStats };
