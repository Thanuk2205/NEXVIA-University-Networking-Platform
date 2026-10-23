require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Job = require('../models/Job');
const Post = require('../models/Post');

async function seed() {
  await connectDB();
  console.log('[nexvia] Seeding demo data...');

  await Promise.all([User.deleteMany({}), Job.deleteMany({}), Post.deleteMany({})]);

  const admin = await User.create({
    name: 'Platform Admin',
    email: 'admin@nexvia.lk',
    password: 'admin1234',
    role: 'admin',
    isVerified: true,
    verificationStatus: 'approved',
  });

  const faculty = await User.create({
    name: 'Mr. V. Athiththan',
    email: 'faculty@vau.ac.lk',
    password: 'faculty123',
    role: 'faculty',
    isVerified: true,
    verificationStatus: 'approved',
    academicProfile: { faculty: 'Faculty of Applied Science', department: 'Physical Science', degreeProgram: 'IT', batch: '' },
  });

  const student = await User.create({
    name: 'N.M.S Gunathilake',
    email: 'student@vau.ac.lk',
    password: 'student123',
    role: 'student',
    isVerified: true,
    verificationStatus: 'approved',
    academicProfile: { faculty: 'Faculty of Applied Science', department: 'Physical Science', degreeProgram: 'IT', batch: '2022' },
    studentProfile: {
      skills: ['JavaScript', 'React', 'Node.js', 'MongoDB'],
      bio: 'Final-year IT undergraduate interested in full-stack development.',
      education: [{ institution: 'University of Vavuniya', qualification: 'BSc (Hons) IT', year: '2022-2026' }],
      projects: [{ title: 'NEXVIA', description: 'University networking & career platform', techStack: ['React', 'Node.js', 'MongoDB'] }],
    },
  });

  const company = await User.create({
    name: 'Recruiter',
    email: 'company@example.com',
    password: 'company123',
    role: 'company',
    isVerified: true,
    verificationStatus: 'approved',
    companyProfile: { companyName: 'Acme Tech', industry: 'Software', website: 'https://acme.example.com', description: 'A software company hiring interns.' },
  });

  await Job.create({
    company: company._id,
    title: 'Software Engineering Intern',
    type: 'internship',
    description: 'Work on our web platform using React and Node.js.',
    requiredSkills: ['JavaScript', 'React', 'Node.js'],
    targetDegreePrograms: ['IT'],
    minBatch: '2020',
    location: 'Colombo',
    isRemote: true,
  });

  await Post.create({
    author: student._id,
    content: 'Excited to start building NEXVIA for our final year project!',
    tags: ['project', 'nexvia'],
  });

  console.log('[nexvia] Seed complete. Demo logins:');
  console.log('  admin@nexvia.lk / admin1234');
  console.log('  faculty@vau.ac.lk / faculty123');
  console.log('  student@vau.ac.lk / student123');
  console.log('  company@example.com / company123');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
