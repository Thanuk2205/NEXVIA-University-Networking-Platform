const mongoose = require('mongoose');

// Targeted Notification Engine: faculty/admins dispatch alerts scoped to a
// slice of the academic hierarchy (Faculty/Department/Degree/Batch) or broadcast.
const NotificationSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['internship', 'academic', 'event', 'deadline', 'general'],
      default: 'general',
    },

    // Empty field on the target = "all values" for that field (broadcast scope).
    target: {
      faculty: { type: String, trim: true },
      department: { type: String, trim: true },
      degreeProgram: { type: String, trim: true },
      batch: { type: String, trim: true },
    },

    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

NotificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
