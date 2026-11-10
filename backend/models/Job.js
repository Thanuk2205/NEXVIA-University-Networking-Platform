const mongoose = require('mongoose');

// Functional Requirement: Company portal for creating job postings and
// defining target skills/qualifications; feeds the automated matching engine.
const JobSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ['internship', 'full-time', 'part-time', 'contract'], default: 'internship' },
    description: { type: String, required: true },

    requiredSkills: [{ type: String, trim: true }],
    targetDegreePrograms: [{ type: String, trim: true }],
    minBatch: { type: String }, // e.g. only batches >= this year

    location: { type: String, trim: true },
    isRemote: { type: Boolean, default: false },
    applicationDeadline: { type: Date },

    status: { type: String, enum: ['open', 'closed', 'draft'], default: 'open' },
  },
  { timestamps: true }
);

JobSchema.index({ requiredSkills: 1 });
JobSchema.index({ targetDegreePrograms: 1 });
JobSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Job', JobSchema);
