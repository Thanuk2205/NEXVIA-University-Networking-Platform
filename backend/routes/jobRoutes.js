const express = require('express');
const {
  createJob,
  listJobs,
  getJob,
  getSuggestedCandidates,
  applyToJob,
  updateApplicationStatus,
  myApplications,
} = require('../controllers/jobController');
const { protect, authorize, requireVerified } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, listJobs);
router.post('/', protect, authorize('company'), requireVerified, createJob);
router.get('/my-applications', protect, authorize('student', 'alumni'), myApplications);
router.get('/:id', protect, getJob);
router.get('/:id/candidates', protect, authorize('company', 'admin'), getSuggestedCandidates);
router.post('/:id/apply', protect, authorize('student', 'alumni'), applyToJob);
router.patch('/applications/:id/status', protect, authorize('company', 'admin'), updateApplicationStatus);

module.exports = router;
