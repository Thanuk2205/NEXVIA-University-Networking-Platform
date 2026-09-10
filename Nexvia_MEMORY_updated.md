# Nexvia Project --- Coding Agent Memory / Context

## 1. Purpose of This File

This file is the persistent project context for **Nexvia**. It is
written for an AI coding agent such as Codex, Cursor Agent, or another
LLM-based software engineering assistant.
The agent should read this file before making architectural, UI,
database, authentication, or feature changes.
The most important rule is:

> **Do not treat Nexvia as a generic social network or a LinkedIn clone.**
> **Nexvia is a university-focused student profile, internship, career**
> **guidance, and opportunity-sharing platform.**

When requirements are unclear, prefer the project goals and constraints
in this document over generic assumptions.

---

# 2. Project Identity

## Project Name

**Nexvia**

## Meaning / Concept

**The Next Way for a Smart Pathway**

## Project Description

**A Smart Student Profile, Internship & Career Guidance Platform**
Nexvia is a university-focused web platform designed to connect:

- Current university students
- University alumni
- University administration
- Employers / opportunity providers

The system allows students to maintain structured academic and career
profiles, discover relevant internships and opportunities, receive
university-admin guidance, interact with the university community, and
generate CVs using AI.
The platform should help students move from their academic profile
toward suitable internship and career opportunities.

---

# 3. Core Problem Nexvia Solves

Students can face several problems:

1. There is no centralized university-focused professional profile.
2. Internship and career opportunities can be communicated through
   scattered channels.
3. Students may miss opportunities that are relevant to their degree,
   skills, or academic background.
4. Creating a professional CV manually can be difficult and
   time-consuming.
5. There is limited space for students and alumni to share
   career-related opportunities and guidance.
6. University administration may not have a targeted mechanism for
   sending opportunities to relevant students.

Nexvia addresses these problems by combining:

- Structured student profiles
- Academic information
- Skills and achievements
- Internship and job opportunities
- Targeted administrative opportunity distribution
- Alumni/community sharing
- AI-assisted CV generation
- Notifications
- University-focused networking

---

# 4. How Nexvia Is Different From LinkedIn

Nexvia may look similar to a professional networking platform, but it
must NOT be implemented or described as simply "LinkedIn for students."

## LinkedIn

LinkedIn is:

- Global
- General-purpose
- Not centered around a specific university degree structure
- Not primarily controlled by university administration
- Not designed around university-specific academic information

## Nexvia

Nexvia is:

- University-focused
- Centered around students and alumni
- Connected to academic information
- Designed for university administration involvement
- Focused on degree/skill-relevant opportunities
- Designed for targeted internship/career communication
- Includes an AI CV generation feature
- Includes a university-focused community/feed

### Important Design Principle

The academic profile should be meaningful to the system.
For example, an opportunity can be matched using:

- Degree/course
- Skills
- Academic achievements
- Other relevant profile information

The system should therefore not behave like a completely generic social
media platform.

---

# 5. Main User Roles

Nexvia currently considers four major user roles.

## 5.1 Student

A student can:

- Register/login
- Create and maintain a profile
- Add academic information
- Add skills
- Add achievements
- View relevant internships/jobs/opportunities
- Apply/follow opportunities depending on the final implementation
- Generate an AI-assisted CV
- View the community feed
- Share relevant career opportunities
- Receive notifications
- Interact with other permitted users

Student profiles are one of the most important parts of the system.

---

## 5.2 Alumni

An alumni user can:

- Maintain an alumni profile
- View opportunities
- Share internship/job/career opportunities
- Participate in the community
- Support current students through career-related sharing/guidance
- Potentially interact with students and other alumni according to the
  final permission model

The alumni role should not be treated as identical to a current student.

---

## 5.3 Administrator

The administrator represents the university/authorized university
administration.
Admin responsibilities include:

- Manage/verify users where appropriate
- Manage university-related content
- Post internship/job/academic opportunities
- Target opportunities toward relevant students
- Manage or moderate community content where required
- Send targeted notifications/opportunity information
- Maintain platform-level administrative functions

A major Nexvia differentiator is the **Targeted Admin Dispatch Engine**,
which should help administrators distribute relevant opportunities to
suitable students instead of broadcasting every opportunity to everyone.

---

## 5.4 Employer / Opportunity Provider

Employers can:

- Create/manage an employer profile
- Share internship/job opportunities
- Provide opportunity details
- Potentially discover suitable students based on permitted
  information
- Interact with opportunity/application workflows according to the
  final requirements

Do not assume employers have unrestricted access to student data.
Student privacy and role-based permissions must be respected.

---

# 6. Core Features

The planned system contains the following major modules.

## 6.1 Authentication & User Verification

Planned technology:

- JWT-based authentication
- Role-based access control
- User verification

Authentication should be designed so that users only access functions
allowed for their role.
At minimum, the system should distinguish:

- Student
- Alumni
- Administrator
- Employer

Never rely only on frontend checks for authorization.
The backend must enforce authorization.

---

# 7. Student Profile

The student profile is a core Nexvia feature.
Potential profile information includes:

- Full name
- Registration number
- Degree/course
- Department/faculty information
- Skills
- Achievements
- Academic information
- Career-related information
- Profile image
- Contact/professional information where appropriate

The exact schema may evolve.

### Important

Do not add large amounts of unnecessary profile information just because
typical social networks contain it.
Every field should have a reason related to:

- Academic identity
- Career guidance
- Internship matching
- CV generation
- University community

---

# 8. Opportunity / Internship Module

Opportunities may include:

- Internships
- Jobs
- Academic opportunities
- Career-related opportunities
- Other university-relevant opportunities

An opportunity should have structured information such as:

- Title
- Description
- Organization/employer
- Opportunity type
- Required skills
- Relevant course/degree
- Eligibility
- Deadline
- Location / remote information
- Application method/link
- Posted date
- Creator/poster
- Targeting information where applicable

The exact fields should be finalized during implementation.

---

# 9. Opportunity Matching

Nexvia should provide relevant opportunities rather than showing exactly
the same content to every student.
Matching can use information such as:

- Student course/degree
- Skills
- Achievements
- Academic information
- Opportunity requirements
- Eligibility

The first implementation does not need to be an advanced
machine-learning system.
A clear rule-based matching system is acceptable if it is:

- Explainable
- Reliable
- Easy to maintain
- Easy to demonstrate in a university project

If AI/ML matching is introduced later, it should be treated as an
enhancement rather than a reason to make the initial architecture
unnecessarily complicated.

---

# 10. AI CV Generator

AI is a **supporting module**, not the main purpose of Nexvia.
The purpose is:

> Generate a professional CV from the structured information already
> stored in the student's Nexvia profile.

The system may use:

- Name
- Education
- Skills
- Achievements
- Experience, if available
- Projects
- Certifications
- Other relevant profile information

The generated CV should be professional and editable/exportable
according to the final implementation.

### Important Architecture Rule

Do not make the entire application dependent on an AI provider.
If the AI service is unavailable:

- The rest of Nexvia should still work.
- The profile should still work.
- Opportunities should still work.
- Authentication should still work.

AI should be isolated behind a service/module so that the provider can
be changed later.

---

# 11. Targeted Admin Dispatch Engine

This is one of Nexvia's important differentiating features.
The university administrator should be able to publish an opportunity
and target appropriate students.
Possible targeting criteria:

- Degree/course
- Department
- Faculty
- Skills
- Academic level/year
- Other eligibility criteria

Example:
An administrator receives a software engineering internship requiring
Python and React.
Instead of sending the notification to every student, the system can
identify students whose profiles satisfy the relevant criteria.
The implementation can initially use deterministic rules.
Example:

```
IF opportunity.course matches student.course
AND opportunity.requiredSkills overlap student.skills
THEN student is a target recipient
```

The actual matching algorithm can be improved later.

---

# 12. Interactive Community Wall & Feed

Nexvia includes a university-focused community/feed.
Users may be able to:

- Create posts
- Share career opportunities
- Share internship information
- Share useful academic/career information
- View posts
- Interact with posts depending on final requirements

The feed should remain relevant to the Nexvia purpose.
Avoid turning the platform into a general entertainment/social-media
feed.
Good content examples:

- Internship announcements
- Career tips
- Alumni experiences
- Job opportunities
- Academic/career events
- University career guidance

---

# 13. Notifications

Planned real-time notification technologies:

- Gmail
- Socket.io

The exact choice may depend on the final architecture.
Notifications can be used for:

- New relevant opportunities
- Admin-targeted opportunities
- Application updates
- Community activity
- Important university announcements

Use Gmail as the selected email notification mechanism.
Notifications should be implemented through a dedicated notification service
so email delivery is separated from the core application logic.

---

# 14. Planned Project Timeline

Latest planned project phases:
Phase   Activity                                   Duration

---

01      Requirement Analysis                       Week 1--2
02      System Design                              Week 3--4
03      Database & UI Design                       Week 3--6
04      Authentication & User Verification (JWT)   Week 5--8
05      AI CV Generator Integration                Week 7--10
06      Targeted Admin Dispatch Engine             Week 9--12
07      Interactive Community Wall & Feed          Week 11--14
08      Real-Time Notifications (Gmail)    Week 13--14
09      Testing (Unit, Security & UAT)             Week 13--16
10      Deployment (Render/AWS) & Documentation    Week 15--16
This is the project plan, not a rigid requirement that every phase must
be completed exactly within those dates.

---

# 15. Current Project Status

As of **2026-09-04**:

## Requirement Analysis

Status:
**Completed**
The main project requirements and feature direction have been
identified.

## System Design

Status:
**In progress**
Figma work is being used as evidence of system/UI design progress.
The team is currently moving from planning/design toward actual frontend
implementation.

---

# 16. Frontend Direction

The frontend is planned using:
**React**
The team wants to begin by learning React and building the Nexvia UI.
A React-based implementation should be organized cleanly and should be
beginner-friendly for the project team.
Possible frontend technologies:

- React
- React Router
- CSS / Tailwind CSS or another selected styling approach
- Axios/fetch for API communication
- Context API or another simple state-management solution if needed

Do not introduce Redux, Zustand, complex UI frameworks, or unnecessary
libraries unless there is a clear reason.

---

# 17. Backend Direction

The backend is planned using:
**Node.js + Express.js**

Use Express.js to build a clean REST API architecture.
Keep the backend modular and separate routes, controllers, services,
middleware, and database models.
If a framework or architecture is already present in the repository, inspect
the repository and follow the existing architecture instead of replacing it.

---

# 18. Database Direction

MongoDB has been considered as the database.
MongoDB is suitable for Nexvia because the system contains:

- User profiles
- Skills
- Achievements
- Opportunities
- Posts
- Notifications
- Matching information

However, the agent should not blindly choose MongoDB if the repository
already has a different database configured.
Before implementing database code:

1. Inspect the repository.
2. Identify the existing database configuration.
3. Follow the current project decision.
4. Avoid replacing working infrastructure without a reason.

If MongoDB is used, design collections and indexes deliberately.

---

# 19. Suggested High-Level Architecture

A clean architecture can be:

```
React Frontend
       |
       | HTTP/REST API
       v
Node.js + Express.js Backend
       |
       +---- Authentication / JWT
       |
       +---- User & Role Management
       |
       +---- Student Profiles
       |
       +---- Opportunities
       |
       +---- Matching Engine
       |
       +---- Admin Dispatch Engine
       |
       +---- Community Feed
       |
       +---- Notifications
       |
       +---- AI CV Service
       |
       v
MongoDB
```

External services may include:

```
Gemini API
Gmail
GitHub
```

Keep external services isolated behind service modules.

---

# 20. Recommended Backend Structure

For the Node.js + Express.js backend, a structure similar to this can be
considered:

```
backend/
├── src/
│   ├── config/
│   ├── models/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── middleware/
│   ├── utils/
│   └── tests/
├── server.js
├── package.json
└── .env
```

Possible responsibility:

### models/

Database models/document definitions.

### controllers/

Handle incoming requests and send responses.

### routes/

API endpoints.

### services/

Business logic.
Examples:

```
auth_service
matching_service
cv_service
notification_service
dispatch_service
```

### repositories/

Database access logic where useful.

### middleware/

Authentication, authorization, error handling, etc.

### utils/

Reusable helpers.
This structure is a recommendation, not an absolute requirement. If the
existing repository has a good architecture, preserve it.

---

# 21. Recommended React Structure

A possible structure:

```
frontend/
├── src/
│   ├── components/
│   ├── pages/
│   ├── layouts/
│   ├── routes/
│   ├── services/
│   ├── context/
│   ├── hooks/
│   ├── utils/
│   ├── assets/
│   ├── styles/
│   ├── App.jsx
│   └── main.jsx
├── package.json
└── ...
```

Possible pages:

```
Login
Register
Dashboard
Student Profile
Alumni Profile
Employer Profile
Admin Dashboard
Opportunities
Opportunity Details
CV Generator
Community Feed
Notifications
Settings
```

Do not create every page immediately.
Build the UI incrementally.

---

# 22. Frontend UI Principles

Nexvia should look like a modern professional university platform.
The UI should be:

- Clean
- Modern
- Professional
- Responsive
- Easy to understand
- Consistent
- Not overloaded with unnecessary animations

The design should communicate:
**Education + Career + Professional Networking**
It should not look like a generic social media app.

---

# 23. Suggested UI Flow

A basic student flow:

```
Landing Page
    ↓
Register / Login
    ↓
Profile Setup
    ↓
Student Dashboard
    ↓
Relevant Opportunities
    ↓
Opportunity Details
    ↓
Apply / Save / View
```

Another flow:

```
Student Profile
    ↓
Generate CV
    ↓
AI CV Generator
    ↓
Preview
    ↓
Edit
    ↓
Export / Download
```

Admin flow:

```
Admin Login
    ↓
Admin Dashboard
    ↓
Create Opportunity
    ↓
Set Target Criteria
    ↓
Matching / Targeting
    ↓
Dispatch Notification
```

Community flow:

```
Community
    ↓
View Feed
    ↓
Create Career-related Post
    ↓
Other Users Interact
```

---

# 24. Authentication Rules

JWT authentication is planned.
Important security rules:

- Never store plain-text passwords.
- Hash passwords securely.
- Never put sensitive secrets directly in frontend source code.
- Store secrets in environment variables.
- Validate JWTs on protected backend endpoints.
- Implement backend role authorization.
- Do not trust a role sent by the frontend.
- Validate all user input.
- Use appropriate CORS configuration.
- Do not expose database credentials.
- Do not commit `.env` files containing secrets.

Example permission idea:

```
Student:
    student endpoints only

Alumni:
    alumni endpoints + permitted community/opportunity features

Employer:
    employer/opportunity endpoints

Admin:
    administrative endpoints
```

The exact permission matrix should be finalized before implementation.

---

# 25. API Design Principles

Prefer REST-style endpoints.
Examples:

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/users/me

GET    /api/students/me
PUT    /api/students/me

GET    /api/opportunities
POST   /api/opportunities
GET    /api/opportunities/{id}
PUT    /api/opportunities/{id}
DELETE /api/opportunities/{id}

GET    /api/feed
POST   /api/feed/posts

GET    /api/notifications
```

These are examples only.
Do not create endpoints blindly. Inspect existing code and requirements
first.

---

# 26. Database Design Concept

If MongoDB is selected, possible collections are:

```
users
student_profiles
alumni_profiles
employer_profiles
opportunities
posts
comments
notifications
cv_documents
```

An alternative is to keep profile information inside the user document
where appropriate.
Do not over-normalize MongoDB unnecessarily.
At the same time, avoid putting the entire application into one huge
user document.
Choose boundaries based on actual access patterns.

---

# 27. Security Requirements

Security is an important part of the project because this is a
university platform containing personal and academic information.
The system should consider:

- Authentication
- Authorization
- Password hashing
- JWT security
- Input validation
- Access control
- Data privacy
- Secure API design
- CORS
- Rate limiting where appropriate
- Secure environment variables
- Error handling
- Protection against common web attacks

Never expose private student information to users who are not authorized
to see it.

---

# 28. Coding-Agent Rules

When an AI coding agent works on Nexvia, follow these rules.

## Rule 1 --- Inspect Before Editing

Before modifying the project:

- Inspect the repository.
- Identify the current stack.
- Identify existing files.
- Identify installed dependencies.
- Identify current routes/components/models.
- Read relevant existing code.

Do not overwrite existing code just because a cleaner example exists.

---

## Rule 2 --- Preserve Existing Work

Do not delete or replace working project functionality unless explicitly
requested.
If a change requires refactoring:

1. Explain the reason.
2. Make the smallest safe change.
3. Preserve existing behavior.

---

## Rule 3 --- Do Not Invent Requirements

If a feature is not specified, do not silently introduce it as a
required feature.
Examples of things that should not be invented without discussion:

- Payment systems
- Complex recommendation algorithms
- Video calls
- Chat systems
- Cryptocurrency
- Advanced ML pipelines
- Unnecessary microservices

Nexvia is a university project. Keep the architecture achievable.

---

## Rule 4 --- Prefer Simple Solutions

The project should be:

- Understandable by university students
- Easy to demonstrate
- Easy to test
- Easy to explain in a viva
- Maintainable

Use simple, well-known technologies before advanced alternatives.

---

## Rule 5 --- Separate Business Logic

Do not put all application logic inside:

- React components
- Route handlers
- One giant Python file

Keep business logic in suitable service modules.

---

## Rule 6 --- Validate Both Frontend and Backend

Frontend validation improves user experience.
Backend validation provides actual security and correctness.
Never depend only on frontend validation.

---

## Rule 7 --- Explain Important Changes

When making significant architectural changes, explain:

- What changed
- Why it changed
- Which files were changed
- How to run/test it

Keep explanations simple and practical.

---

# 29. React Coding Rules

For React:

- Use reusable components.
- Avoid unnecessarily huge components.
- Keep API calls outside UI where practical.
- Use meaningful component names.
- Use consistent naming.
- Handle loading states.
- Handle error states.
- Handle empty states.
- Make layouts responsive.
- Avoid hardcoding repeated values.
- Keep secrets out of frontend code.

Example:
Bad:

```
<div>
  ...
  // 500 lines
</div>
```

Prefer smaller components such as:

```
Navbar
Sidebar
OpportunityCard
ProfileCard
NotificationItem
PostCard
```

---

# 30. UX Requirements

Every major screen should consider:

### Loading

Show a useful loading state when data is being fetched.

### Error

Show a meaningful message when an API request fails.

### Empty

Show a useful empty-state message when there is no data.
Example:

```
No internship opportunities found.
Try updating your skills or checking again later.
```

### Form Validation

Show clear validation messages.
Avoid generic messages such as:

```
Something went wrong.
```

when a more useful explanation is possible.

---

# 31. AI Service Rules

If an AI API is used:

- Keep the API key on the backend.
- Never expose the key in React.
- Use environment variables.
- Create a dedicated AI service.
- Validate the generated result.
- Do not blindly trust generated content.
- Provide a way for the student to edit the generated CV.

The AI service should receive only the information necessary for CV
generation.

---

# 32. Environment Variables

Sensitive configuration should be stored in `.env`.
Possible variables:

```
MONGODB_URI=
JWT_SECRET=
GEMINI_API_KEY=
GMAIL_USER=
GMAIL_APP_PASSWORD=
FRONTEND_URL=
```

The exact names depend on the implementation.
Never commit real credentials.
Provide `.env.example` instead.

---

# 33. Git / Repository Rules

Use clear commits.
Examples:

```
feat: add student profile page
feat: implement JWT login
fix: correct opportunity filtering
refactor: separate matching service
style: improve dashboard layout
test: add authentication tests
```

Avoid commits such as:

```
update
changes
final
new
test123
```

Do not commit:

```
.env
node_modules/
__pycache__/
build/
dist/
venv/
```

unless the project specifically requires them.

---

# 34. Testing Strategy

Testing is planned for Week 13--16.
Areas to test:

## Unit Testing

Test individual functions/modules.
Examples:

- Password validation
- Opportunity matching
- Eligibility rules
- CV data preparation
- Notification targeting

## Security Testing

Test:

- Unauthorized access
- Invalid JWT
- Role escalation
- Invalid input
- Password security
- Protected endpoints

## User Acceptance Testing

Test real user workflows:

```
Student registration
Student profile setup
Opportunity discovery
Admin opportunity creation
Targeted opportunity dispatch
CV generation
Community posting
Notifications
```

---

# 35. Deployment

Planned deployment possibilities:

- Render
- AWS

Do not choose deployment infrastructure until the application
architecture and requirements are clear.
For deployment:

- Configure environment variables
- Configure database connection
- Configure CORS
- Configure frontend/backend URLs
- Configure production secrets
- Test production API
- Test authentication
- Test major user workflows

---

# 36. Documentation Requirements

The project will require documentation.
Useful documentation sections:

1. Project Introduction
2. Problem Statement
3. Objectives
4. Functional Requirements
5. Non-functional Requirements
6. System Architecture
7. Use Cases
8. Database Design
9. UI Design
10. API Design
11. Security
12. AI CV Generator
13. Matching / Dispatch Engine
14. Testing
15. Deployment
16. User Guide

Keep documentation consistent with the actual implementation.
Never document a feature as completed if it has not been implemented.

---

# 37. Viva / Presentation Understanding

The team should be able to explain Nexvia simply.

### What is Nexvia?

> Nexvia is a university-focused student profile, internship, and career
> guidance platform that connects students, alumni, university
> administration, and employers.

### Why Nexvia?

> Students often miss relevant opportunities because information is
> scattered across different channels. Nexvia provides a centralized
> platform for academic profiles, relevant opportunities, career
> sharing, and guidance.

### How is it different from LinkedIn?

> LinkedIn is a global general-purpose professional network, while
> Nexvia is focused on a university environment and uses academic
> information, skills, and university administration to provide
> degree-relevant opportunities and career guidance.

### Why AI?

> AI is used as a supporting feature to generate a professional CV from
> the student's existing profile information.

### How are opportunities matched?

> Opportunities can be matched using criteria such as degree, skills,
> academic information, and eligibility requirements.

---

# 38. Current Development Priority

The current priority is to move from design into implementation.
Recommended order:

## Step 1

Set up the frontend React project.

## Step 2

Build the basic application layout.
Example:

```
Navbar
Sidebar
Main Content
Responsive Layout
```

## Step 3

Create authentication UI.

```
Login
Register
Role selection if required
```

## Step 4

Build the student dashboard.

## Step 5

Build the student profile.

## Step 6

Build opportunity listing/details UI.

## Step 7

Build admin dashboard.

## Step 8

Build community feed.

## Step 9

Connect frontend to backend APIs.

## Step 10

Implement advanced modules:

- JWT authentication
- Matching
- Admin dispatch
- AI CV generation
- Notifications

This order can change based on repository status.

---

# 39. Figma and UI Design

Figma is being used as evidence for system/UI design progress.
When implementing a Figma design:

- Preserve the intended layout.
- Use reusable React components.
- Do not copy every visual detail into hardcoded HTML.
- Make the design responsive.
- Keep spacing and typography consistent.
- Use reusable design tokens where possible.

If a Figma design is provided to the agent, inspect it carefully before
implementing.

---

# 40. Important Product Principles

## Principle 1 --- University First

Every major feature should make sense in a university environment.

## Principle 2 --- Career Focus

The platform should guide students toward internships and careers.

## Principle 3 --- Relevant Opportunities

Students should see opportunities that are useful for their
academic/career profile.

## Principle 4 --- AI Is Supportive

AI improves CV generation but is not the core product.

## Principle 5 --- Security Matters

Academic and personal data must be protected.

## Principle 6 --- Simple and Demonstrable

The system should be achievable within a university project timeline and
explainable during a viva.

## Principle 7 --- Do Not Become LinkedIn

Professional networking is part of the system, but Nexvia's identity
comes from its university-centered academic and career ecosystem.

---

# 41. Definition of Done for a Feature

Before considering a feature complete, check:

```
[ ] Requirement is understood
[ ] Existing repository was inspected
[ ] UI implemented
[ ] Responsive behavior considered
[ ] Frontend validation implemented
[ ] Backend validation implemented
[ ] Authorization considered
[ ] Loading state handled
[ ] Error state handled
[ ] Empty state handled
[ ] API integration works
[ ] Database behavior works
[ ] Tests added where appropriate
[ ] No secrets committed
[ ] Existing features still work
[ ] Documentation updated if needed
```

---

# 42. How the Coding Agent Should Respond to Ambiguous Requests

If the requested change is small and the intended behavior is obvious:

- Implement it directly.

If there are multiple technically valid approaches:

- Choose the simplest approach that fits the existing architecture.
- State the assumption briefly.

If the requested change conflicts with existing architecture:

- Inspect the code first.
- Explain the conflict.
- Avoid destructive changes.

If a required decision cannot reasonably be inferred:

- Ask one focused question rather than a long questionnaire.
- Continue with any safe work that does not depend on the answer.

---

# 43. Do Not Over-Engineer

Nexvia is not intended to be an enterprise-scale distributed system.
Avoid introducing:

- Microservices unless genuinely necessary
- Kubernetes
- Complex event-driven architecture
- Multiple databases without a clear reason
- Advanced ML infrastructure
- Complex state-management systems
- Excessive abstraction
- Unnecessary design patterns

A clean monolithic backend with modular services is likely enough for
the university project.

---

# 44. Important Terminology

Use these terms consistently:

- **Student** --- current university student
- **Alumni** --- former student
- **Administrator** --- authorized university administrator
- **Employer** --- organization/person providing opportunities
- **Opportunity** --- internship, job, academic, or career-related
  opportunity
- **Student Profile** --- structured academic and career information
- **Targeted Admin Dispatch Engine** --- mechanism for identifying and
  notifying suitable students about admin-posted opportunities
- **AI CV Generator** --- supporting AI feature that creates a CV from
  student information
- **Community Wall / Feed** --- university-focused career/community
  content area

---

# 45. Agent Quick Start

When a coding agent first enters the repository, do this:

```
1. Read this MEMORY.md.
2. Inspect the complete repository structure.
3. Identify frontend framework and version.
4. Identify backend framework and version.
5. Identify database configuration.
6. Identify authentication implementation.
7. Identify existing UI components/pages.
8. Identify existing API routes.
9. Identify environment configuration.
10. Run the existing application before making major changes.
11. Make small, incremental changes.
12. Test after each meaningful change.
```

Do NOT immediately rewrite the project.

---

# 46. Technology Stack — Quick Reference

```
Frontend        → React.js
Backend         → Node.js + Express.js
Database        → MongoDB
AI              → Gemini API
Authentication  → JWT
Email           → Gmail
Version Control → GitHub
Development     → VS Code
Design          → Figma
```

Important corrections:

- Do NOT use Python as the planned backend stack.
- Do NOT use Firebase as the primary notification/email technology.
- Gmail is the selected email notification mechanism.
- Gemini API is the selected AI provider.
- GitHub is the selected version-control platform.
- Figma is the selected design tool.
- VS Code is the primary development environment.

The agent may recommend another technology only when there is a concrete technical requirement that cannot reasonably be satisfied with the approved stack. Such a recommendation should be explained before replacing an approved technology.

# 47. Final Instruction to the Coding Agent

Nexvia should be developed as a **practical university-focused career**
**platform**, not as an unnecessarily complex startup product.
When choosing between two valid implementations:

> **Prefer the simpler implementation that satisfies the requirement,**
> **fits the current codebase, is secure, is maintainable, and can be**
> **clearly explained during a university viva.**

Always preserve the project's central identity:
**Nexvia = Student Profile + Relevant Opportunities + University**
**Guidance + Career Community + AI-assisted CV**