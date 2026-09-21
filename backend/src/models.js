import mongoose from "mongoose";

const { Schema, model, models } = mongoose;
const options = { timestamps: true, versionKey: false };

const contactSchema = new Schema({
  phone: { type: String, trim: true, maxlength: 30 },
  linkedIn: { type: String, trim: true, maxlength: 300 },
  github: { type: String, trim: true, maxlength: 300 },
  portfolio: { type: String, trim: true, maxlength: 300 }
}, { _id: false });

const skillSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  level: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" }
}, { _id: false });

const achievementSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 150 },
  issuer: { type: String, trim: true, maxlength: 150 },
  date: Date,
  description: { type: String, trim: true, maxlength: 1000 },
  certificateUrl: { type: String, trim: true, maxlength: 500 }
}, { _id: true });

const educationSchema = new Schema({
  institution: { type: String, required: true, trim: true, maxlength: 200 },
  qualification: { type: String, required: true, trim: true, maxlength: 200 },
  field: { type: String, trim: true, maxlength: 150 },
  startDate: Date,
  endDate: Date,
  result: { type: String, trim: true, maxlength: 80 }
}, { _id: true });

const experienceSchema = new Schema({
  organization: { type: String, required: true, trim: true, maxlength: 200 },
  role: { type: String, required: true, trim: true, maxlength: 150 },
  startDate: Date,
  endDate: Date,
  current: { type: Boolean, default: false },
  description: { type: String, trim: true, maxlength: 1500 }
}, { _id: true });

const projectSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 1500 },
  technologies: [{ type: String, trim: true, maxlength: 80 }],
  url: { type: String, trim: true, maxlength: 500 }
}, { _id: true });

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: ["student", "alumni", "admin", "employer"] },
  status: { type: String, enum: ["pending", "active", "suspended"], default: "pending", index: true },
  emailVerified: { type: Boolean, default: false },
  lastLoginAt: Date,
  refreshTokenHash: { type: String, select: false },
  passwordChangedAt: Date
}, options);

const studentProfileSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  registrationNumber: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
  fullName: { type: String, required: true, trim: true, maxlength: 150 },
  university: { type: String, default: "University of Vavuniya", trim: true, maxlength: 200 },
  faculty: { type: String, required: true, trim: true, maxlength: 150 },
  department: { type: String, required: true, trim: true, maxlength: 150 },
  degree: { type: String, required: true, trim: true, maxlength: 150 },
  academicYear: { type: Number, min: 1, max: 8 },
  graduationYear: { type: Number, min: 2000, max: 2200 },
  bio: { type: String, trim: true, maxlength: 1000 },
  profileImageUrl: { type: String, trim: true, maxlength: 500 },
  contact: contactSchema,
  skills: [skillSchema],
  achievements: [achievementSchema],
  education: [educationSchema],
  experience: [experienceSchema],
  projects: [projectSchema],
  profileVisibility: { type: String, enum: ["private", "university", "employers"], default: "university" },
  profileCompleted: { type: Boolean, default: false }
}, options);

const alumniProfileSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  registrationNumber: { type: String, unique: true, sparse: true, uppercase: true, trim: true, maxlength: 40 },
  fullName: { type: String, required: true, trim: true, maxlength: 150 },
  degree: { type: String, required: true, trim: true, maxlength: 150 },
  department: { type: String, trim: true, maxlength: 150 },
  graduationYear: { type: Number, required: true, min: 1950, max: 2200 },
  currentOrganization: { type: String, trim: true, maxlength: 200 },
  currentPosition: { type: String, trim: true, maxlength: 150 },
  bio: { type: String, trim: true, maxlength: 1000 },
  profileImageUrl: { type: String, trim: true, maxlength: 500 },
  contact: contactSchema,
  skills: [skillSchema],
  achievements: [achievementSchema],
  education: [educationSchema],
  experience: [experienceSchema],
  willingToMentor: { type: Boolean, default: false }
}, options);

const employerProfileSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  organizationName: { type: String, required: true, trim: true, maxlength: 200 },
  organizationType: { type: String, trim: true, maxlength: 100 },
  industry: { type: String, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000 },
  website: { type: String, trim: true, maxlength: 500 },
  contactPerson: { type: String, trim: true, maxlength: 150 },
  contactPhone: { type: String, trim: true, maxlength: 30 },
  logoUrl: { type: String, trim: true, maxlength: 500 },
  verified: { type: Boolean, default: false, index: true }
}, options);

const targetingSchema = new Schema({
  degrees: [{ type: String, trim: true, maxlength: 150 }],
  departments: [{ type: String, trim: true, maxlength: 150 }],
  faculties: [{ type: String, trim: true, maxlength: 150 }],
  academicYears: [{ type: Number, min: 1, max: 8 }],
  requiredSkills: [{ type: String, trim: true, lowercase: true, maxlength: 80 }],
  minimumSkillMatches: { type: Number, min: 0, default: 1 }
}, { _id: false });

const opportunitySchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, trim: true, maxlength: 10000 },
  organizationName: { type: String, required: true, trim: true, maxlength: 200 },
  type: { type: String, required: true, enum: ["internship", "job", "academic", "event", "other"], index: true },
  workMode: { type: String, enum: ["onsite", "remote", "hybrid"], default: "onsite" },
  location: { type: String, trim: true, maxlength: 200 },
  eligibility: { type: String, trim: true, maxlength: 3000 },
  requiredSkills: [{ type: String, trim: true, lowercase: true, maxlength: 80 }],
  relevantDegrees: [{ type: String, trim: true, maxlength: 150 }],
  applicationMethod: { type: String, enum: ["internal", "external", "email"], default: "external" },
  applicationUrl: { type: String, trim: true, maxlength: 500 },
  applicationEmail: { type: String, lowercase: true, trim: true, maxlength: 254 },
  deadline: { type: Date, required: true, index: true },
  posterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  targeting: targetingSchema,
  status: { type: String, enum: ["draft", "published", "closed", "archived"], default: "draft", index: true },
  publishedAt: Date
}, options);

opportunitySchema.index({ title: "text", description: "text", organizationName: "text" });
opportunitySchema.index({ status: 1, type: 1, deadline: 1 });
opportunitySchema.index({ "targeting.degrees": 1, "targeting.academicYears": 1 });
opportunitySchema.index({ requiredSkills: 1 });

const applicationSchema = new Schema({
  opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  cvDocumentId: { type: Schema.Types.ObjectId, ref: "CvDocument" },
  coverLetter: { type: String, trim: true, maxlength: 5000 },
  status: { type: String, enum: ["submitted", "reviewing", "shortlisted", "accepted", "rejected", "withdrawn"], default: "submitted", index: true },
  appliedAt: { type: Date, default: Date.now },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date
}, options);
applicationSchema.index({ opportunityId: 1, studentId: 1 }, { unique: true });

const savedOpportunitySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", required: true }
}, options);
savedOpportunitySchema.index({ userId: 1, opportunityId: 1 }, { unique: true });

const postSchema = new Schema({
  authorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  content: { type: String, required: true, trim: true, maxlength: 5000 },
  category: { type: String, enum: ["opportunity", "career_tip", "alumni_experience", "academic", "event", "announcement"], required: true, index: true },
  mediaUrls: [{ type: String, trim: true, maxlength: 500 }],
  linkedOpportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity" },
  status: { type: String, enum: ["published", "hidden", "removed"], default: "published", index: true },
  editedAt: Date
}, options);
postSchema.index({ createdAt: -1, status: 1 });
postSchema.index({ content: "text" });

const commentSchema = new Schema({
  postId: { type: Schema.Types.ObjectId, ref: "Post", required: true, index: true },
  authorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  content: { type: String, required: true, trim: true, maxlength: 1500 },
  status: { type: String, enum: ["published", "hidden", "removed"], default: "published" },
  editedAt: Date
}, options);
commentSchema.index({ postId: 1, createdAt: 1 });

const reactionSchema = new Schema({
  postId: { type: Schema.Types.ObjectId, ref: "Post", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["like", "helpful", "celebrate"], default: "like" }
}, options);
reactionSchema.index({ postId: 1, userId: 1 }, { unique: true });

const notificationSchema = new Schema({
  recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["opportunity", "application", "community", "announcement", "system"], required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  entityType: { type: String, enum: ["opportunity", "application", "post", "none"], default: "none" },
  entityId: Schema.Types.ObjectId,
  channels: [{ type: String, enum: ["in_app", "email"] }],
  readAt: Date,
  emailStatus: { type: String, enum: ["not_requested", "queued", "sent", "failed"], default: "not_requested" },
  emailSentAt: Date
}, options);
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });

const dispatchSchema = new Schema({
  opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  criteria: targetingSchema,
  matchedUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  matchedCount: { type: Number, min: 0, default: 0 },
  emailQueuedCount: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ["processing", "completed", "failed"], default: "processing" },
  completedAt: Date
}, options);

const cvDocumentSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 150 },
  template: { type: String, enum: ["classic", "modern", "minimal"], default: "classic" },
  content: { type: Schema.Types.Mixed, required: true },
  aiProvider: { type: String, enum: ["gemini", "none"], default: "none" },
  generatedByAI: { type: Boolean, default: false },
  sourceProfileUpdatedAt: Date,
  pdfUrl: { type: String, trim: true, maxlength: 500 }
}, options);
cvDocumentSchema.index({ studentId: 1, updatedAt: -1 });

const auditLogSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  action: { type: String, required: true, trim: true, maxlength: 120 },
  entityType: { type: String, required: true, trim: true, maxlength: 80 },
  entityId: Schema.Types.ObjectId,
  metadata: Schema.Types.Mixed,
  ipAddress: { type: String, maxlength: 64 }
}, { ...options, timestamps: { createdAt: true, updatedAt: false } });
auditLogSchema.index({ createdAt: -1 });

export const User = models.User || model("User", userSchema);
export const StudentProfile = models.StudentProfile || model("StudentProfile", studentProfileSchema);
export const AlumniProfile = models.AlumniProfile || model("AlumniProfile", alumniProfileSchema);
export const EmployerProfile = models.EmployerProfile || model("EmployerProfile", employerProfileSchema);
export const Opportunity = models.Opportunity || model("Opportunity", opportunitySchema);
export const Application = models.Application || model("Application", applicationSchema);
export const SavedOpportunity = models.SavedOpportunity || model("SavedOpportunity", savedOpportunitySchema);
export const Post = models.Post || model("Post", postSchema);
export const Comment = models.Comment || model("Comment", commentSchema);
export const Reaction = models.Reaction || model("Reaction", reactionSchema);
export const Notification = models.Notification || model("Notification", notificationSchema);
export const Dispatch = models.Dispatch || model("Dispatch", dispatchSchema);
export const CvDocument = models.CvDocument || model("CvDocument", cvDocumentSchema);
export const AuditLog = models.AuditLog || model("AuditLog", auditLogSchema);

export const allModels = [
  User, StudentProfile, AlumniProfile, EmployerProfile, Opportunity,
  Application, SavedOpportunity, Post, Comment, Reaction, Notification,
  Dispatch, CvDocument, AuditLog
];
