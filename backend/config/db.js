const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/nexvia';
  try {
    await mongoose.connect(uri);
    console.log(`[nexvia] MongoDB connected -> ${mongoose.connection.host}`);
  } catch (err) {
    console.error('[nexvia] MongoDB connection failed:', err.message);
    console.error('[nexvia] Make sure MONGO_URI in .env points to a running MongoDB instance.');
    process.exit(1);
  }
}

module.exports = connectDB;
