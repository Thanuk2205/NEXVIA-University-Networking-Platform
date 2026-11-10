const jwt = require('jsonwebtoken');
const User = require('../models/User');

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// POST /api/auth/register
async function register(req, res) {
  try {
    const { name, email, password, role, academicProfile, companyProfile } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists' });

    const allowedRoles = ['student', 'alumni', 'company', 'faculty']; // admin accounts are provisioned separately
    const finalRole = allowedRoles.includes(role) ? role : 'student';

    const user = await User.create({
      name,
      email,
      password,
      role: finalRole,
      academicProfile: finalRole === 'company' ? undefined : academicProfile,
      companyProfile: finalRole === 'company' ? companyProfile : undefined,
      // Companies, faculty and alumni require admin verification before full access;
      // students self-verify via university email domain checks (kept simple here).
      isVerified: finalRole === 'student',
      verificationStatus: finalRole === 'student' ? 'approved' : 'pending',
    });

    const token = signToken(user);
    res.status(201).json({ token, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'email and password are required' });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (!user.isActive) return res.status(403).json({ message: 'This account has been deactivated' });

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
}

// GET /api/auth/me
async function me(req, res) {
  res.json({ user: req.user.toSafeObject() });
}

module.exports = { register, login, me };
