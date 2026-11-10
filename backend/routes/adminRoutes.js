const express = require('express');
const { listUsers, verifyUser, setActiveStatus, getStats } = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect, authorize('admin'));

router.get('/users', listUsers);
router.patch('/users/:id/verify', verifyUser);
router.patch('/users/:id/deactivate', setActiveStatus);
router.get('/stats', getStats);

module.exports = router;
