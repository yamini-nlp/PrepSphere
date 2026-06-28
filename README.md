# 🎯 PrepSphere

**Full-stack AI placement preparation platform** — role-aligned learning roadmaps, AI interview prep, and outreach guidance — built as a controlled comparison of two LLM-integration reliability strategies: a direct synchronous proxy versus a schema-validated async job queue.

**Live Demo:** https://prepsphere000146.vercel.app

**Repository:** https://github.com/yamini-nlp/PrepSphere

![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white)
![LLM](https://img.shields.io/badge/LLM-Llama%203.3%2070B%20%7C%20Groq-orange?style=flat-square)
![Queue](https://img.shields.io/badge/Queue-BullMQ%20%7C%20Redis-DC382D?style=flat-square&logo=redis&logoColor=white)
![Database](https://img.shields.io/badge/Database-MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Validation](https://img.shields.io/badge/Validation-Zod-3068B7?style=flat-square)
![Frontend](https://img.shields.io/badge/Frontend-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)
![Backend](https://img.shields.io/badge/Backend-Render-46E3B7?style=flat-square&logo=render&logoColor=black)
![License](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey?style=flat-square)

---

## 💡 Motivation

LLM APIs fail in ways that are easy to miss in development and expensive to discover in production: malformed output that passes JSON parsing, silent fallbacks on rate limits, and schema drift between model versions. Most application code collapses all of these into a single undifferentiated error. This project was built specifically to study that problem — implementing two integration strategies for the same generation tasks, measuring schema conformance across 120 evaluation runs, and identifying a latent observability gap where a real failure was entirely invisible to the caller. The platform — placement preparation — is the deployment context; the reliability comparison is the research question.

---

## 🧭 Overview

PrepSphere is a placement-preparation platform covering three stages of job-seeking — learning, interview practice, and application outreach — built as a Vanilla JS frontend on Vercel with a separate Node.js/Express backend on Render.

The project implements **two parallel integration strategies** for the same underlying problem (an LLM API call that can fail, return malformed output, or run long), rather than a single pipeline:

1. A **direct, synchronous proxy** to the Groq API (`Frontend/api/groq.js`), which is what every live AI feature currently calls.
2. An **asynchronous job-queue backend** (Express + BullMQ + MongoDB on Render), built with retry logic and output validation, but currently wired into the live frontend for authentication only — the generation queues are implemented and independently verified working, not yet the path users hit.

This split is documented rather than hidden: the [Architecture](#-architecture-two-reliability-strategies) and [Limitations](#-limitations) sections describe exactly which path serves which feature today.

---

## 🎯 Problem Statement

Placement preparation is typically fragmented across separate tools — a learning-roadmap site, a resume editor, an interview question bank, an outreach template generator — each requiring its own context and login. PrepSphere consolidates the learning, practice, and outreach stages into one application, using LLM generation tailored to a specific target role or job description rather than static, generic content.

---

## 🧩 What It Does

PrepSphere covers three stages of job-seeking in one application:

**Learning & Orientation**
The Roadmap module generates a structured learning path — ordered steps, topics, curated resources, and project ideas — for any target role. Users choose between tech, non-tech, or conventional tracks before generation. Resume and cover letter generation follow the same pattern: role or JD in, structured content out.

**Interview Practice**
MockIt is a hub that routes users to round-specific preparation pages for Group Discussion, Aptitude, Technical, HR, and JAM rounds — each with curated content, strategies, and examples. Two AI-powered modules sit alongside it: MockMyInterview (`/mmi/`) takes a job description and generates 5–7 core preparation topics plus 10 interview questions with expert answers; the AI MCQ Generator (`/quiz/`) takes any text and produces a 10-question multiple-choice quiz with indexed answers. Both call `llama-3.3-70b-versatile` via the Vercel serverless proxy. PrepMaster (`/prepmaster/`) provides targeted preparation notes for a curated set of companies — this is static reference content, not a dynamically generated dataset.

**Outreach Guidance**
HireHub (`/hirehub/`) covers the application execution stage. It explains cold emailing, LinkedIn direct messaging, and post-rejection follow-up strategies, with sample templates and pro tips for each. This is curated static guidance, not AI generation.

---

## 🏗️ Architecture: Two Reliability Strategies

The core design choice is implementing both strategies — not picking one — so their behaviour under the same failure conditions can be directly compared.

### Path A — Direct Proxy (live path for all AI generation today)

```
Browser → fetch('/api/groq') → Vercel serverless function → Groq API → JSON returned synchronously
```

No persistence. No retry. No schema validation. If the model returns syntactically valid JSON with a mismatched shape, it reaches the frontend unchanged.

### Path B — Async Job Queue (implemented; auth is the only live route today)

```
Browser → POST /api/{feature} → Express (Render) → BullMQ queue → aiWorker.js → Zod validation → MongoDB Job document
                                                                         ↑
                                                               retry/backoff on validation failure
```

A `POST` returns `202 Accepted` with a `jobId`. `workers/aiWorker.js` consumes all four queues, validates output against a Zod schema before marking a job complete, and triggers BullMQ's retry policy on failure rather than persisting a malformed result. `GET /api/jobs/:jobId` exposes job status for polling. The queue infrastructure has been independently exercised and works correctly. Only `/api/auth/*` is live from the frontend today.

**Why both exist:** Path A is simpler and lower-latency; Path B adds retry, persistence, and runtime schema enforcement. The comparison is the point. Migrating live generation from Path A to Path B is the first item in [Future Work](#-future-work).

---

## 🧠 LLM Output Validation

The four generation functions in `backend/aiService.js` — `generateRoadmap`, `generateQuiz`, `generateMockInterview`, `extractBuzzwords` — call Groq with `response_format: { type: "json_object" }` where applicable. This guarantees syntactically valid JSON but not field-level correctness.

Path B validates every response against a Zod schema before persistence. Four schemas are defined in `backend/schemas.js`:

```js
const QuizSchema = z.array(
  z.object({
    question: z.string(),
    options: z.array(z.string()).length(4),
    answer: z.number().int().min(0).max(3),
  })
);
```

A failed validation throws, which triggers BullMQ's retry policy rather than persisting a malformed result. Path A has no schema validation — the parsed response is returned to the page as-is.

---

## 📊 Evaluation & Findings

`backend/eval/runEval.js` runs each of the four generation functions against 5 fixed sample inputs, 6 times each — 30 runs per feature, 120 total — and validates every result against its Zod schema. Results are logged to `backend/eval/results.json`.

| Feature | Runs | Passed | Pass Rate |
|---|---|---|---|
| 🗺️ Roadmap | 30 | 30 | 100.0% |
| 🏷️ Buzzwords | 30 | 30 | 100.0% |
| 🎤 Interview | 30 | 30 | 100.0% |
| 📝 Quiz | 30 | 29 | 96.7% |

**🔍 Finding:** The single quiz failure raised `ZodError: expected array, received null` — meaning `generateQuiz()` returned its generic fallback (`null`) rather than propagating the underlying error. This exposed a structural problem: all four functions in `aiService.js` wrap their Groq calls in a `try/catch` that logs to console and returns a typed fallback rather than re-throwing. As a result, a transient API error, a rate limit, and a schema mismatch are indistinguishable to the caller — they all surface as the same fallback. This was not assumed; it was discovered through the evaluation harness. It is documented as a known observability gap and is the first item in [Future Work](#-future-work).

**Scope:** schema conformance only. Semantic quality, relevance, and factual correctness of generated content are not measured.

---

## ⚙️ Key Design Decisions

| Component | Choice | Rationale |
|---|---|---|
| 🤖 LLM | `llama-3.3-70b-versatile` via Groq | Low-latency inference compatible with synchronous Path A requests |
| 📬 Queue | BullMQ + Upstash Redis | Retry/backoff without managing dedicated queue infrastructure |
| 🗄️ Database | MongoDB Atlas + Mongoose | Schema flexibility across heterogeneous generation outputs; backs Path B `Job` collection with 1-hour TTL |
| ✅ Validation | Zod (Path B only) | Runtime enforcement of expected output shape before persistence |
| 🔐 Auth | JWT, stateless | No server-side session store required |
| 🌐 Frontend | Vanilla JS, no build step | Zero pipeline; direct static deployment to Vercel |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| AI proxy (Path A) | Vercel serverless function (`api/groq.js`) |
| Backend (Path B) | Node.js, Express — deployed on Render |
| LLM | Groq API, `llama-3.3-70b-versatile` |
| Schema validation | Zod |
| Queue | BullMQ, Upstash Redis |
| Database | MongoDB Atlas, Mongoose |
| Auth | JWT (jsonwebtoken) |

---

## 📁 Repository Structure

```
PrepSphere/
├── backend/
│   ├── server.js               # Express app: route mounting, CORS, error handling
│   ├── aiService.js            # 4 generation functions: roadmap, quiz, interview, buzzwords
│   ├── schemas.js              # Zod schemas: RoadmapSchema, QuizSchema, InterviewSchema, BuzzwordsSchema
│   ├── workers/
│   │   └── aiWorker.js         # BullMQ worker — consumes all four queues
│   ├── queues/
│   │   ├── index.js            # Queue definitions
│   │   └── redisConnection.js
│   ├── routes/
│   │   ├── auth.js             # POST /api/auth/register, /login
│   │   └── jobs.js             # GET /api/jobs/:jobId
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── rateLimiter.js      # Redis-backed, per-route limits
│   ├── models/
│   │   ├── User.js
│   │   └── Job.js              # TTL index, 1-hour expiry
│   └── eval/
│       ├── runEval.js          # 120-run schema-conformance harness
│       └── results.json        # Latest run output
├── Frontend/
│   ├── api/
│   │   ├── groq.js             # Direct Groq proxy (Path A)
│   │   └── schemas.js          # Zod schemas (reference copy)
│   ├── js/config.js            # API_BASE_URL (env-aware)
│   ├── roadmap/                # tech.html, nontech.html, conventional.html, pathfinder.html
│   ├── mmi/                    # AI: job-description → topics + 10 Q&A
│   ├── quiz/                   # AI: text → 10-question MCQ
│   ├── MockIt/                 # Hub → round-specific prep pages
│   ├── gd/ hr/ technical/ aptitude/ Jam/   # Static round prep content
│   ├── hirehub/                # Static outreach guidance: coldmail, dm, afterrej
│   ├── prepmaster/             # Static company prep notes
│   ├── resume/ coverletter/    # AI generation pages
│   ├── dashboard/
│   ├── login.html register.html
│   └── index.html
├── LICENSE
└── README.md
```

---

## 🚀 Local Setup

**Prerequisites:** Node.js 18+, MongoDB Atlas URI, Groq API key, Upstash Redis instance.

```bash
git clone https://github.com/yamini-nlp/PrepSphere.git
cd PrepSphere/backend && npm install
```

`backend/.env`:

```
MONGO_URI=your_mongodb_connection_string
GROQ_API_KEY=your_groq_api_key
JWT_SECRET=your_jwt_secret
REDIS_URL=rediss://default:your_password@your-host.upstash.io:6379
ADMIN_PASSWORD=your_bull_board_password
```

> ⚠️ Use `rediss://` (TLS), not `redis://` — Upstash rejects plain connections.

```bash
# Terminal 1 — API server
node server.js

# Terminal 2 — Queue worker
node workers/aiWorker.js
```

API: `http://localhost:5000` · Bull Board: `http://localhost:5000/admin/queues`

```bash
# Frontend
cd ../Frontend && python -m http.server 5000

# Run evaluation harness
cd backend && node eval/runEval.js
# Writes eval/results.json and prints pass-rate summary
```

---

## 🔒 Security

- `.env` excluded from version control via `backend/.gitignore`.
- CORS restricted to an explicit allow-list (`localhost`, `*.vercel.app`, `*.github.io`) — no wildcard.
- Groq API key never reaches the browser: Path A's key lives in Vercel's serverless environment; Path B's lives in Render's — neither is shipped in frontend JavaScript.

---

## ⚠️ Limitations

- **Path B not yet serving live generation.** The retry-backed, schema-validated queue system is implemented and verified; every live AI feature still calls the unvalidated Path A proxy.
- **Error-swallowing in `aiService.js`.** All four generation functions return a typed fallback on failure rather than re-throwing. Provider errors, rate limits, and schema mismatches are indistinguishable to the caller. Identified through the evaluation harness.
- **Schema conformance only.** The evaluation harness does not measure semantic quality, relevance, or factual correctness of generated content.
- **HireHub and round prep pages are static.** Cold email, DM, after-rejection templates and the GD/HR/Technical/Aptitude/JAM pages are curated static content — not AI-generated.
- **PrepMaster company list is static.** Reference content for a curated set of companies; not dynamically maintained.
- **Plain-text input only.** No PDF parsing or document upload for resume or job description fields.
- **No cross-session state.** No mechanism to track or resume preparation progress across sessions.
- **English only.**

---

## 🔭 Future Work

- Re-throw structured error objects from `aiService.js` so evaluation runs can distinguish provider errors, rate limits, and schema mismatches.
- Migrate live AI generation from Path A to Path B, applying retry, rate limiting, and persistence to what users actually experience.
- Extend evaluation beyond schema conformance to semantic quality assessment.
- Add PDF resume parsing with structured extraction.
- Add cross-session progress tracking.

---

<div align="center">

Built by Yamini G

</div>
