const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    matchScore: { type: Number, default: 0 }, // 0-100, set by the matching engine
    status: {
      type: String,
      enum: ['suggested', 'applied', 'shortlisted', 'rejected', 'hired'],
      default: 'applied',
    },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

ApplicationSchema.index({ job: 1, applicant: 1 }, { unique: true });

module.exports = mongoose.model('Application', ApplicationSchema);
