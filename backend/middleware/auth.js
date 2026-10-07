const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies the JWT and attaches the authenticated user to req.user.
async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;

    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Not authorized, user no longer exists or is deactivated' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, token invalid or expired' });
  }
}

// Restricts a route to specific roles, e.g. authorize('admin', 'faculty').
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Role '${req.user ? req.user.role : 'unknown'}' is not permitted to perform this action` });
    }
    next();
  };
}

// Some endpoints (e.g. posting jobs, dispatching notices) additionally
// require the account to have passed admin verification.
function requireVerified(req, res, next) {
  if (!req.user.isVerified) {
    return res.status(403).json({ message: 'Account pending verification. This action is restricted to verified accounts.' });
  }
  next();
}

module.exports = { protect, authorize, requireVerified };
