const express = require('express');
const { createNotification, listMyNotifications, markRead } = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, listMyNotifications);
router.post('/', protect, authorize('faculty', 'admin'), createNotification);
router.patch('/:id/read', protect, markRead);

module.exports = router;
