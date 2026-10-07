const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User');
const { rankCandidates } = require('../utils/matchingEngine');

// POST /api/jobs  (company only, verified)
async function createJob(req, res) {
  try {
    const { title, type, description, requiredSkills, targetDegreePrograms, minBatch, location, isRemote, applicationDeadline } = req.body;
    if (!title || !description) return res.status(400).json({ message: 'title and description are required' });

    const job = await Job.create({
      company: req.user._id,
      title,
      type,
      description,
      requiredSkills,
      targetDegreePrograms,
      minBatch,
      location,
      isRemote,
      applicationDeadline,
    });

    // Automated Candidate Matching Engine: run immediately on creation and
    // pre-suggest the top matches to the company as Application records.
    const candidatePool = await User.find({ role: { $in: ['student', 'alumni'] }, isVerified: true });
    const ranked = rankCandidates(job, candidatePool).filter((r) => r.score >= 40).slice(0, 20);

    if (ranked.length) {
      await Application.insertMany(
        ranked.map((r) => ({
          job: job._id,
          applicant: r.student._id,
          matchScore: r.score,
          status: 'suggested',
        })),
        { ordered: false }
      ).catch(() => {}); // ignore duplicate-key races
    }

    res.status(201).json({ job, suggestedCandidates: ranked.length });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create job', error: err.message });
  }
}

// GET /api/jobs — categorized listing, filterable by degree program / skill / type
async function listJobs(req, res) {
  try {
    const { degreeProgram, skill, type, status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    else filter.status = 'open';
    if (type) filter.type = type;
    if (degreeProgram) filter.targetDegreePrograms = degreeProgram;
    if (skill) filter.requiredSkills = skill;

    const jobs = await Job.find(filter).populate('company', 'name companyProfile').sort({ createdAt: -1 });
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ message: 'Failed to list jobs', error: err.message });
  }
}

// GET /api/jobs/:id
async function getJob(req, res) {
  try {
    const job = await Job.findById(req.params.id).populate('company', 'name companyProfile');
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ job });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load job', error: err.message });
  }
}

// GET /api/jobs/:id/candidates — company views AI-suggested qualified candidates
async function getSuggestedCandidates(req, res) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (String(job.company) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view candidates for this job' });
    }

    const applications = await Application.find({ job: job._id })
      .populate('applicant', 'name email academicProfile studentProfile')
      .sort({ matchScore: -1 });

    res.json({ applications });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load candidates', error: err.message });
  }
}

// POST /api/jobs/:id/apply — student applies directly (in addition to AI suggestions)
async function applyToJob(req, res) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job || job.status !== 'open') return res.status(404).json({ message: 'Job not found or closed' });

    const application = await Application.findOneAndUpdate(
      { job: job._id, applicant: req.user._id },
      { $set: { status: 'applied' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ application });
  } catch (err) {
    res.status(500).json({ message: 'Failed to apply', error: err.message });
  }
}

// PATCH /api/jobs/applications/:id/status — company updates an applicant's status
async function updateApplicationStatus(req, res) {
  try {
    const { status } = req.body;
    const allowed = ['applied', 'shortlisted', 'rejected', 'hired'];
    if (!allowed.includes(status)) return res.status(400).json({ message: `status must be one of ${allowed.join(', ')}` });

    const application = await Application.findById(req.params.id).populate('job');
    if (!application) return res.status(404).json({ message: 'Application not found' });
    if (String(application.job.company) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    application.status = status;
    await application.save();
    res.json({ application });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update application', error: err.message });
  }
}

// GET /api/jobs/my-applications — student views their own applications
async function myApplications(req, res) {
  try {
    const applications = await Application.find({ applicant: req.user._id })
      .populate({ path: 'job', populate: { path: 'company', select: 'name companyProfile' } })
      .sort({ createdAt: -1 });
    res.json({ applications });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load applications', error: err.message });
  }
}

module.exports = {
  createJob,
  listJobs,
  getJob,
  getSuggestedCandidates,
  applyToJob,
  updateApplicationStatus,
  myApplications,
};
