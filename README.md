# 🎯 PrepSphere — AI-Powered Interview Preparation Platform

> A unified platform that guides candidates through structured placement preparation — learning roadmaps, interview practice, and application execution — using LLM-powered generation.

**Live Demo:** https://prepsphere000146.vercel.app &nbsp;|&nbsp; **GitHub:** https://github.com/yamini-nlp/PrepSphere

![Stack](https://img.shields.io/badge/Stack-Node.js%20%7C%20Express%20%7C%20BullMQ%20%7C%20MongoDB-blue?style=flat-square)
![LLM](https://img.shields.io/badge/LLM-Llama%203.3%2070B%20%7C%20Groq-orange?style=flat-square)
![Queue](https://img.shields.io/badge/Queue-BullMQ%20%7C%20Upstash%20Redis-red?style=flat-square)
![Status](https://img.shields.io/badge/Status-Live-brightgreen?style=flat-square)

---

## Overview

PrepSphere addresses the fragmentation in placement preparation by unifying three critical stages — learning, practice, and application — into a single AI-driven workflow.

The system explores two different reliability strategies for the same underlying problem — *an LLM API call that can fail, return malformed output, or run long* — implemented as two parallel paths:

1. **A direct Groq proxy** (`Frontend/api/groq.js`) — synchronous, simple, used by the live AI feature pages today.
2. **An async job-queue backend** (`backend/`, Express + BullMQ + MongoDB, deployed on Render) — built to handle the same problem with retries, output sanity checks, and non-blocking polling. Currently only authentication is wired through it from the frontend; the generation queues are implemented and independently functional but not yet the production path.

Building both was deliberate: it surfaces the actual tradeoff between "ship something that works" and "build the version that degrades gracefully under failure" — see [LLM Integration & Reliability](#-llm-integration--reliability) below for what that second path actually does.

The platform runs on free-tier infrastructure (Render + Vercel + Upstash + MongoDB Atlas + Groq).

---

## 🎯 Problem Statement

Placement preparation is fragmented across learning platforms, resume editors, interview practice sites, and job portals — each operating in isolation. This forces repeated context-switching, creates coverage gaps, and produces inconsistent results. Mock interview access is often gated behind expensive coaching.

PrepSphere integrates the critical stages of placement readiness into one workflow at zero cost to the user.

---

## 💡 Feature Areas

**Learning & Orientation**

The Roadmap module submits a target job role to Llama 3.3 70B (via the direct `/api/groq` proxy) and returns learning modules, resources, and project ideas. Resume and cover letter generation work the same way — direct client-side calls to `/api/groq`.

**Interview Practice**

The MockIt module provides simulated interview round pages (Group Discussion, Aptitude, Technical, HR, JAM, MCQ, Quiz). A `prepmaster` company-prep page lists prep notes and trends for a curated set of around 20 companies (e.g. TCS, Wipro, Infosys, Accenture, Google, Amazon, Microsoft, Meta) — this is a fixed reference list, not a large structured database with automatic difficulty calibration.

**Application Execution**

The HireHub and cover-letter modules provide outreach template tooling (cold emails, LinkedIn DMs, follow-ups, rejection responses) and resume tooling, calling the same direct Groq proxy pattern.

**Authentication**

`login.html` and `register.html` call the real deployed Render backend (`https://prepsphere-o7wh.onrender.com`) via `/api/auth/login` and `/api/auth/register`, using JWT-based stateless auth with `passport`/`passport-google-oauth20` available as dependencies.

---

## 🧠 LLM Integration & Reliability

Every generation feature (roadmap, quiz, mock interview, buzzword extraction) calls Llama 3.3 70B via Groq with a role-framed system prompt that specifies an exact output contract — for example, the roadmap prompt requires a JSON object with a fixed `roadmapSteps[]` / `projectIdeas[]` shape, and the quiz prompt requires a fixed `questions[]` array with an `answer` index field.

Two different levels of rigor are applied to this contract across the two paths:

- **Path A (live):** uses Groq's structural JSON mode (`response_format: { type: "json_object" }`), which guarantees syntactically valid JSON but does not verify that the returned fields match the requested shape. Output is parsed and returned as-is; a malformed or incomplete structure is not caught before reaching the UI.
- **Path B (queue, not yet wired to the UI):** adds a lightweight output sanity check on top of the same JSON mode — each queue handler checks the result against minimal structural expectations before marking a job complete (e.g. the interview handler checks that both `topics` and `interviews` are present; the quiz handler checks that `result` is a non-empty array). A failed check throws, which triggers BullMQ's per-queue retry policy (3–5 attempts with exponential backoff) rather than serving a broken result.

This is intentionally described as a **sanity check, not full schema validation** — it confirms presence and rough shape, not field types or nested structure. A natural extension (noted in Future Work) is validating against a strict schema (e.g. Zod or JSON Schema) before acceptance.

Every LLM-calling function also has an explicit fallback path (a placeholder message or `null`) rather than an unhandled exception, so a Groq outage or malformed response degrades the feature rather than crashing the request.

---

## 🏗️ System Architecture

### Path A — Live AI feature pages (Roadmap, Resume, Cover Letter, MMI, Quiz)

```
Frontend Page (browser)
        │
        ▼
  fetch('/api/groq')  ──►  Frontend/api/groq.js (Vercel serverless function)
        │
        ▼
  Groq Cloud API  ──►  llama-3.3-70b-versatile
        │
        ▼
  Response returned synchronously, no persistence, no queue
```

This path has **no rate limiting, no retry/backoff, and no job queue** — it is a direct, synchronous proxy to Groq.

### Path B — Backend job-queue system (built, partially wired)

```
┌─────────────────────────────────────────────────────────────┐
│                   Backend API Layer                         │
│              Node.js + Express  (Render)                    │
│  POST /api/roadmap              → roadmap queue             │
│  POST /api/generate-buzzwords   → buzzwords queue           │
│  POST /api/mock-interview       → interview queue           │
│  POST /api/generate-quiz        → quiz queue                │
│  GET  /api/jobs/:jobId          → status polling            │
│  POST /api/auth/register|login  → JWT auth   ← LIVE, IN USE │
│  Middleware: Redis rate limiter (per-route limits) · CORS   │
└───────┬───────────────────┬──────────────────┬──────────────┘
        │                   │                  │
┌───────▼──────┐   ┌────────▼───────┐  ┌──────▼──────┐
│  BullMQ +    │   │   Groq API     │  │  MongoDB    │
│  Upstash     │   │  llama-3.3-    │  │   Atlas     │
│  Redis       │   │  70b-versatile │  │             │
│ 4 named      │   │                │  │ Job TTL     │
│ queues:      │   │                │  │ index:      │
│ roadmap,     │   │                │  │ 1hr expiry  │
│ buzzwords,   │   │                │  │ on Job docs │
│ interview,   │   │                │  │             │
│ quiz         │   │                │  │             │
└──────────────┘   └────────────────┘  └─────────────┘
```

> **Async orchestration (Path B only):** A `POST` to any of the four queue-backed endpoints returns `202 Accepted` with a `jobId` immediately, persists a `Job` document in MongoDB, and enqueues work via BullMQ. A separate worker process (`workers/aiWorker.js`) consumes all four queues with per-queue concurrency and retry settings. `GET /api/jobs/:jobId` returns job status. **This pipeline is implemented and functional, but no frontend page currently calls it for generation** — only the queue infrastructure itself has been verified working.

---

## ⚙️ Key Design Decisions

| Component | Choice | Rationale |
|---|---|---|
| LLM | Llama 3.3 70B (`llama-3.3-70b-versatile`) via Groq | Fast inference, low cost relative to closed-source frontier models |
| Queue (Path B) | BullMQ + Redis (Upstash) | Prevents timeout failures; retry/backoff without additional infrastructure |
| Database | MongoDB Atlas | Flexible schema suits heterogeneous output shapes; also backs the `Job` collection for Path B |
| Auth | JWT (stateless), Passport (Google OAuth available as a dependency) | Minimal overhead; no session store required |
| Frontend | Vanilla JS | Zero build pipeline; instant Vercel deploy |

---

## ⚠️ Limitations

- **No strict schema validation:** output checks (Path B) confirm presence and rough shape, not full type/structural correctness — a model that returns a syntactically valid but semantically wrong JSON shape (e.g. a string where an array is expected in a nested field) would not currently be caught
- **Two reliability paths, one in production:** the async, retry-backed queue system (Path B) is implemented and independently functional, but the live frontend's generation features currently call the simpler direct proxy (Path A), which has no retry or rate limiting — see System Architecture
- **Company prep coverage is limited:** the `prepmaster` page lists roughly 20 companies with static notes, not an automatically calibrated database
- **No resume PDF parsing:** Resume input is text-only (paste-based)
- **No cross-session progress tracking:** No mechanism to track what a user has completed or bookmarked across sessions
- **English only:** The platform currently supports English only

---

## 🔭 Future Work

- **Strict schema validation** for all LLM outputs (e.g. Zod/JSON Schema) ahead of the current presence-only sanity checks, with malformed responses routed to automatic retry with prompt repair rather than silent fallback
- **Migrate live generation features onto the queue-based path (Path B)** so retry, rate limiting, and persistence apply to what users actually experience, not just the auth flow
- **Quantitative evaluation of generation quality** — currently there is no held-out evaluation of roadmap relevance, quiz answer correctness, or interview question quality beyond manual spot-checking
- **Expand company-specific preparation coverage** beyond the current static list, ideally backed by a maintained or periodically refreshed dataset
- **PDF resume parsing** with structured section extraction (skills, experience, education)
- **Cross-session progress tracking** so users can resume and track preparation coverage over time

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, HTML5, CSS3 |
| Frontend AI proxy | Vercel serverless function (`api/groq.js`) |
| Backend (Path B) | Node.js, Express, Passport |
| LLM | Llama 3.3 70B (`llama-3.3-70b-versatile`) via Groq API |
| Queue (Path B) | BullMQ + Upstash Redis |
| Database | MongoDB Atlas (Mongoose) |
| Auth | JWT (stateless) — live via Path B |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |

---

## 🚀 Local Setup

**Prerequisites:** Node.js 18+ · MongoDB Atlas account · Groq API key · Upstash Redis instance

**1. Clone**
```bash
git clone https://github.com/yamini-nlp/PrepSphere.git
cd PrepSphere
```

**2. Backend setup (Path B — auth + job-queue system)**
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

Start the API server and queue worker as separate processes:
```bash
# Terminal 1 — API server
node server.js

# Terminal 2 — Queue worker
node workers/aiWorker.js
```

Server: `http://localhost:5000` &nbsp;|&nbsp; Bull Board: `http://localhost:5000/admin/queues`

**3. Frontend setup (Path A — direct Groq proxy, used by all live AI pages)**
```bash
cd Frontend
python -m http.server 5000
# or: right-click index.html in VS Code → Open with Live Server
```
Visit `http://localhost:5000`

The `api/groq.js` serverless function requires `GROQ_API_KEY` to be set in your Vercel project's environment variables when deployed.

> ⚠️ Use a `rediss://` URL (TLS) for Upstash Redis — plain `redis://` connections will be rejected.

---

## 📁 Repository Structure

```
PrepSphere/
├── backend/
│   ├── server.js                   # Express API server (Path B)
│   ├── passport.js                 # Auth strategy config
│   ├── workers/
│   │   └── aiWorker.js             # BullMQ worker — consumes all four queues
│   ├── queues/
│   │   ├── index.js                # BullMQ queue definitions
│   │   └── redisConnection.js
│   ├── routes/
│   │   ├── auth.js                 # LIVE — used by login.html / register.html
│   │   └── jobs.js                 # GET /api/jobs/:jobId status polling
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── rateLimiter.js          # Redis-backed, per-route limits
│   ├── models/
│   │   ├── User.js
│   │   └── Job.js                  # TTL index: 1hr expiry
│   └── aiService.js                # Groq calls for Path B queue jobs
├── Frontend/
│   ├── index.html
│   ├── login.html                  # Calls Render backend (Path B auth)
│   ├── register.html               # Calls Render backend (Path B auth)
│   ├── js/config.js                # API_BASE_URL for the Render backend
│   ├── api/groq.js                 # Direct Groq proxy (Path A) — used by AI feature pages
│   ├── css/style.css
│   ├── shared/                     # mobile.css, styles.css
│   ├── images/                     # UI assets
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

*Built by Yamini G &nbsp;·&nbsp; [GitHub](https://github.com/yamini-nlp/PrepSphere) &nbsp;·&nbsp; [Live Demo](https://prepsphere000146.vercel.app)*

</div>
