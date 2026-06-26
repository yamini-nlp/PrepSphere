# 🎯 PrepSphere — AI-Powered Interview Preparation Platform

> A unified platform that guides candidates through structured placement preparation — learning roadmaps, interview practice, and application execution — using schema-constrained LLM generation and async queue orchestration.

**Live Demo:** https://prepsphere000146.vercel.app &nbsp;|&nbsp; **GitHub:** https://github.com/yamini-nlp/PrepSphere

![Stack](https://img.shields.io/badge/Stack-Node.js%20%7C%20Express%20%7C%20BullMQ%20%7C%20MongoDB-blue?style=flat-square)
![LLM](https://img.shields.io/badge/LLM-Llama%203%2070B%20%7C%20Groq-orange?style=flat-square)
![Queue](https://img.shields.io/badge/Queue-BullMQ%20%7C%20Upstash%20Redis-red?style=flat-square)
![Status](https://img.shields.io/badge/Status-Live-brightgreen?style=flat-square)

---

## Overview

PrepSphere addresses the fragmentation in placement preparation by unifying three critical stages — learning, practice, and application — into a single AI-driven workflow. The core engineering contributions are a schema-constrained LLM generation pipeline, an async queue architecture that eliminates timeout failures on free-tier hosting, and a Redis-backed rate limiter for concurrent load protection.

The platform runs entirely on free-tier infrastructure (Render + Vercel + Upstash + MongoDB Atlas + Groq), making it accessible regardless of financial background.

---

## 🎯 Problem Statement

Placement preparation is fragmented across learning platforms, resume editors, interview practice sites, and job portals — each operating in isolation. This forces repeated context-switching, creates coverage gaps, and produces inconsistent results. ATS rejection rates exceed 70% for resumes lacking role-specific keywords, and mock interview access is often gated behind expensive coaching.

PrepSphere integrates the three critical stages of placement readiness into one workflow at zero cost to the user.

---

## 💡 Three-Phase Workflow

**Phase 1 — Learning & Orientation**

A user submits a target job role. A schema-constrained prompt instructs Llama 3 to return a structured JSON roadmap with ordered learning modules, resources typed as free/paid, and project ideas. Output is validated against a strict schema, cached by role hash in MongoDB, and rendered progressively.

For resume optimisation, job description text is processed using a TF-IDF-inspired keyword ranking approach. The user's resume is compared against this ranked list and gaps are surfaced explicitly.

**Phase 2 — Interview Practice**

Job description text is parsed to identify 5–7 core mastery topics. A structured LLM prompt generates a predicted question bank with model answers. A separate MCQ pipeline generates 10-question quizzes validated against a strict answer-index schema.

The MockIt module provides six simulated interview rounds (Group Discussion, Aptitude, Technical, HR, JAM, MCQ) with company-specific difficulty calibration drawn from the curated company database.

**Phase 3 — Application Execution**

A skill-matching algorithm compares user resume skills against role requirements, producing a gap analysis and growth potential score. A curated outreach template library covers cold emails, LinkedIn DMs, follow-ups, rejection responses, and offer negotiation.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend Layer                         │
│           Vanilla JS + HTML5 + CSS3  (Vercel)               │
│  • Three-phase progressive UI                               │
│  • Non-blocking async polling (2s interval)                 │
│  • Schema-aware rendering per feature type                  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST
┌────────────────────────▼────────────────────────────────────┐
│                   Backend API Layer                         │
│              Node.js + Express  (Render)                    │
│  POST /api/roadmap              → roadmap queue             │
│  POST /api/generate-buzzwords   → buzzwords queue           │
│  POST /api/mock-interview       → interview queue           │
│  POST /api/generate-quiz        → quiz queue                │
│  GET  /api/jobs/:jobId          → status polling            │
│  POST /api/auth/register|login  → JWT auth                  │
│  Middleware: JWT auth · Redis rate limiter · CORS           │
└───────┬───────────────────┬──────────────────┬─────────────┘
        │                   │                  │
┌───────▼──────┐   ┌────────▼───────┐  ┌──────▼──────┐
│  BullMQ +    │   │   Groq API     │  │  MongoDB    │
│  Upstash     │   │  Llama 3 70B   │  │   Atlas     │
│  Redis       │   │                │  │             │
│ 4 queues:    │   │ JSON mode +    │  │ TTL index:  │
│ roadmap      │   │ schema prompts │  │ 1hr expiry  │
│ buzzwords    │   │ Retry/backoff  │  │ 500+ company│
│ interview    │   │                │  │ profiles    │
│ quiz         │   │                │  │             │
└──────────────┘   └────────────────┘  └─────────────┘
```

> **Async orchestration:** All LLM calls are non-blocking. A POST to any generation endpoint returns `202 Accepted` with a `jobId` immediately. The frontend polls `GET /api/jobs/:jobId` every 2 seconds until job status transitions to `completed`. This prevents timeout failures on Render's free tier (30-second request limit).

---

## ⚙️ Key Design Decisions

| Component | Choice | Rationale |
|---|---|---|
| LLM | Llama 3 70B via Groq | Sub-second inference; $0.27/1M tokens vs $30/1M (OpenAI GPT-4) |
| Queue | BullMQ + Redis (Upstash) | Prevents timeout failures; retry/backoff without additional infrastructure |
| Database | MongoDB Atlas | Flexible schema suits heterogeneous output shapes (roadmaps ≠ quizzes ≠ question banks) |
| Auth | JWT (stateless) | Minimal overhead; no session store required |
| Frontend | Vanilla JS | Zero build pipeline; instant Vercel deploy |

---

## 🔐 Schema-Constrained Generation

Every LLM call includes explicit JSON shape definitions and representative examples in the prompt. Outputs are parsed and validated against these schemas before storage. Malformed responses trigger retries rather than serving broken content.

---

## 📊 Observed Metrics

| Metric | Value |
|---|---|
| Roadmap generation time (p50) | ~6 seconds |
| API latency (p95) | ~1.2 seconds |
| Cache hit rate | ~58% |
| Schema validation success rate | ~99.4% |
| Frontend load time | ~2.1 seconds |
| Queue retry success (after first failure) | ~91% |

*These figures are observed from the deployed system and vary with Groq API load and Render cold start state.*

---

## ⚠️ Limitations

- **Infrastructure cold starts:** Render's free tier has cold start delays of 30–60 seconds after inactivity; mitigated by async polling but not fully invisible to users
- **No resume PDF parsing:** Resume input is text-only (paste-based); PDF parsing with section extraction would significantly improve usability
- **LLM consistency on niche roles:** Very niche or emerging job roles sometimes produce thinner roadmaps than well-represented roles in training data
- **Static company database:** 500+ company profiles are manually curated and do not update automatically; interview round patterns and salary data can become stale
- **No cross-session progress tracking:** No mechanism to track what a user has completed or bookmarked across sessions
- **English only:** The platform currently supports English only

---

## 🔭 Future Work

**Near-term:**
- PDF resume parsing with automatic section extraction (skills, experience, education)
- Application tracker: Kanban board for managing submission stages
- Adaptive MCQ difficulty adjusting in real time based on answer patterns

**Medium-term:**
- Cross-session memory to avoid surfacing duplicate interview questions
- Voice-based mock interview simulation with communication clarity scoring
- Analytics dashboard showing preparation coverage and weak areas

**Long-term:**
- Crowdsourced interview question database (user-submitted, community-validated)
- Domain-specific fine-tuning on interview QA datasets for higher answer quality
- Peer matching for real-person mock interviews with structured feedback rubrics

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, HTML5, CSS3 |
| Backend | Node.js, Express |
| LLM | Llama 3 70B via Groq API |
| Queue | BullMQ + Upstash Redis |
| Database | MongoDB Atlas |
| Auth | JWT (stateless) |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |

---

## 🚀 Local Setup

**Prerequisites:** Node.js 18+ · MongoDB Atlas account · Groq API key · Upstash Redis instance

**1. Clone**
```bash
git clone https://github.com/yamireddy04/PrepSphere.git
cd PrepSphere
```

**2. Backend setup**
```bash
cd backend
npm install
```

Create `backend/.env`:
```
MONGO_URI=your_mongodb_connection_string
GROQ_API_KEY=your_groq_api_key
JWT_SECRET=your_jwt_secret
REDIS_URL=rediss://default:your_password@your-host.upstash.io:6379
ADMIN_PASSWORD=your_bull_board_password
```

Start API server and queue worker as separate processes:
```bash
# Terminal 1 — API server
node server.js

# Terminal 2 — Queue worker
node workers/aiWorker.js
```

Server: `http://localhost:5000` &nbsp;|&nbsp; Bull Board: `http://localhost:5000/admin/queues`

**3. Frontend setup**
```bash
cd Frontend
python -m http.server 5000
# or: right-click index.html in VS Code → Open with Live Server
```
Visit `http://localhost:5000`

> ⚠️ Use a `rediss://` URL (TLS) for Upstash Redis — plain `redis://` connections will be rejected.

---

## 📁 Repository Structure

```
PrepSphere/
├── backend/
│   ├── server.js                   # Express API server
│   ├── passport.js                 # Auth strategy config
│   ├── workers/
│   │   └── aiWorker.js             # BullMQ worker — consumes all four queues
│   ├── queues/
│   │   ├── index.js                # BullMQ queue definitions
│   │   └── redisConnection.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── jobs.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── rateLimiter.js
│   ├── models/
│   │   ├── User.js
│   │   └── Job.js
│   └── aiService.js
├── Frontend/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── js/config.js
│   ├── api/groq.js
│   ├── css/style.css
│   ├── shared/                     # mobile.css, styles.css
│   ├── images/                     # 40+ UI assets
│   └── [feature pages]/            # Jam, MockIt, Phase1–3, aptitude,
│                                    # coverletter, dashboard, exp, gd,
│                                    # hirehub, hr, intervyu, mcqs, mmi,
│                                    # prepmaster, quiz, resume, roadmap,
│                                    # technical, tq — each its own
│                                    # folder + .html page
├── LICENSE
└── README.md
```

---

<div align="center">

*Built by Yamini G &nbsp;·&nbsp; [GitHub](https://github.com/yamireddy04/PrepSphere) &nbsp;·&nbsp; [Live Demo](https://prepsphere000146.vercel.app)*

</div>
