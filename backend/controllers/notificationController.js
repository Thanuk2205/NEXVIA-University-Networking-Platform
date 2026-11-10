const Notification = require('../models/Notification');
const User = require('../models/User');

// POST /api/notifications — faculty/admin dispatch a targeted or broadcast alert
async function createNotification(req, res) {
  try {
    const { title, message, category, target } = req.body;
    if (!title || !message) return res.status(400).json({ message: 'title and message are required' });

    const notification = await Notification.create({
      sender: req.user._id,
      title,
      message,
      category,
      target: target || {},
    });

    // Optional real-time push if Socket.io is attached to the app.
    const io = req.app.get('io');
    if (io) io.emit('notification:new', notification);

    res.status(201).json({ notification });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send notification', error: err.message });
  }
}

// GET /api/notifications — returns notifications scoped to the current user's
// academic profile (an empty target field means "everyone" for that field).
async function listMyNotifications(req, res) {
  try {
    const ap = req.user.academicProfile || {};
    const scopeFilter = (field) => [{ [`target.${field}`]: { $exists: false } }, { [`target.${field}`]: '' }, ...(ap[field] ? [{ [`target.${field}`]: ap[field] }] : [])];

    const query = req.user.role === 'admin' || req.user.role === 'faculty'
      ? {}
      : {
          $and: ['faculty', 'department', 'degreeProgram', 'batch'].map((f) => ({ $or: scopeFilter(f) })),
        };

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);

    const notifications = await Notification.find(query)
      .populate('sender', 'name role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load notifications', error: err.message });
  }
}

// PATCH /api/notifications/:id/read
async function markRead(req, res) {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    if (!notification.readBy.some((id) => String(id) === String(req.user._id))) {
      notification.readBy.push(req.user._id);
      await notification.save();
    }
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update notification', error: err.message });
  }
}

module.exports = { createNotification, listMyNotifications, markRead };
