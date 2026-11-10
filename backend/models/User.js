const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Hierarchical Academic Mapping: Faculty -> Department -> Degree Program -> Batch
// This sub-document is what powers targeted notifications and candidate matching.
const AcademicProfileSchema = new mongoose.Schema(
  {
    faculty: { type: String, trim: true },
    department: { type: String, trim: true },
    degreeProgram: { type: String, trim: true },
    batch: { type: String, trim: true }, // e.g. "2022"
  },
  { _id: false }
);

const StudentProfileSchema = new mongoose.Schema(
  {
    skills: [{ type: String, trim: true }],
    education: [
      {
        institution: String,
        qualification: String,
        year: String,
      },
    ],
    experience: [
      {
        title: String,
        organization: String,
        description: String,
        startDate: String,
        endDate: String,
      },
    ],
    projects: [
      {
        title: String,
        description: String,
        techStack: [String],
        link: String,
      },
    ],
    bio: { type: String, trim: true, maxlength: 1000 },
    resumeUrl: { type: String },
  },
  { _id: false }
);

const CompanyProfileSchema = new mongoose.Schema(
  {
    companyName: { type: String, trim: true },
    industry: { type: String, trim: true },
    website: { type: String, trim: true },
    description: { type: String, trim: true },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },

    role: {
      type: String,
      enum: ['student', 'alumni', 'company', 'faculty', 'admin'],
      required: true,
      default: 'student',
    },

    // Verification / Role-Based Security (Objective: Enforce Role-Based Security & Verification)
    isVerified: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    academicProfile: AcademicProfileSchema, // used by student / alumni / faculty
    studentProfile: StudentProfileSchema, // used by student / alumni
    companyProfile: CompanyProfileSchema, // used by company

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ 'academicProfile.faculty': 1, 'academicProfile.department': 1, 'academicProfile.degreeProgram': 1, 'academicProfile.batch': 1 });
UserSchema.index({ role: 1 });

UserSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

UserSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
