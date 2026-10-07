const express = require('express');
const { getProfile, updateProfile, listAlumniNetwork } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.get('/alumni-network', protect, listAlumniNetwork);

module.exports = router;
