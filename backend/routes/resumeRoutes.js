const express = require('express');
const { generateResume } = require('../controllers/resumeController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/generate', protect, generateResume);

module.exports = router;
