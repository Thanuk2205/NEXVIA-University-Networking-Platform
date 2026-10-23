/**
 * Automated Candidate Matching Engine.
 *
 * Rule-based scoring so the platform works with zero external dependencies.
 * If GEMINI_API_KEY is set, aiResume.js's ranking helper can be layered on
 * top later for semantic matching — this function is the reliable baseline
 * the objective in the proposal actually requires ("suggests relevant
 * student profiles ... based on profile skills, degree tracks and academic
 * achievements").
 */
function scoreCandidate(job, student) {
  let score = 0;
  const reasons = [];

  const studentSkills = (student.studentProfile?.skills || []).map((s) => s.toLowerCase().trim());
  const requiredSkills = (job.requiredSkills || []).map((s) => s.toLowerCase().trim());

  if (requiredSkills.length) {
    const matched = requiredSkills.filter((s) => studentSkills.includes(s));
    const skillScore = (matched.length / requiredSkills.length) * 70; // skills = 70% of score
    score += skillScore;
    if (matched.length) reasons.push(`Matches ${matched.length}/${requiredSkills.length} required skills (${matched.join(', ')})`);
  }

  const degree = student.academicProfile?.degreeProgram;
  if (job.targetDegreePrograms?.length) {
    if (degree && job.targetDegreePrograms.map((d) => d.toLowerCase()).includes(degree.toLowerCase())) {
      score += 20; // degree program match = 20%
      reasons.push(`Degree program (${degree}) matches target`);
    }
  } else {
    score += 10; // no restriction stated, small default credit
  }

  const projectCount = student.studentProfile?.projects?.length || 0;
  const experienceCount = student.studentProfile?.experience?.length || 0;
  const activityScore = Math.min(projectCount + experienceCount, 5) * 2; // up to 10%
  score += activityScore;
  if (projectCount) reasons.push(`${projectCount} listed project(s)`);
  if (experienceCount) reasons.push(`${experienceCount} listed experience entr${experienceCount === 1 ? 'y' : 'ies'}`);

  if (job.minBatch && student.academicProfile?.batch) {
    if (Number(student.academicProfile.batch) < Number(job.minBatch)) {
      score *= 0.5; // penalize batches earlier than what the company asked for
      reasons.push(`Batch ${student.academicProfile.batch} is earlier than requested minimum ${job.minBatch}`);
    }
  }

  return { score: Math.round(Math.min(score, 100)), reasons };
}

/**
 * Ranks a list of candidate students against a job, best match first.
 */
function rankCandidates(job, students) {
  return students
    .map((student) => ({ student, ...scoreCandidate(job, student) }))
    .sort((a, b) => b.score - a.score);
}

module.exports = { scoreCandidate, rankCandidates };
