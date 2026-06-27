require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const { Worker } = require("bullmq");
const mongoose   = require("mongoose");
const { ZodError } = require("zod");
const { createRedisConnection } = require("../queues/redisConnection");
const {
    extractBuzzwords,
    generateQuiz,
    generateMockInterview,
    generateRoadmap,
} = require("../aiService");
const {
    RoadmapSchema,
    QuizSchema,
    InterviewSchema,
    BuzzwordsSchema,
} = require("../schemas");
const Job = require("../models/Job");

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("[Worker] MongoDB connected"))
    .catch((err) => {
        console.error("[Worker] MongoDB connection failed:", err.message);
        process.exit(1);
    });

const MAX_ATTEMPTS = {
    "prepsphere-ai-roadmap":   3,
    "prepsphere-ai-buzzwords": 4,
    "prepsphere-ai-interview": 3,
    "prepsphere-ai-quiz":      5,
};

async function processJob(job) {
    const { jobId } = job.data;

    console.log(
        `[Worker] Processing job ${jobId} | queue: ${job.queueName} | attempt: ${job.attemptsMade + 1}`
    );

    await Job.findOneAndUpdate(
        { jobId },
        { status: "processing", attempts: job.attemptsMade + 1 }
    );

    let result;

    switch (job.queueName) {
        case "prepsphere-ai-roadmap": {
            const { role } = job.data;
            result = await generateRoadmap(role);
            try {
                RoadmapSchema.parse(result);
            } catch (err) {
                if (err instanceof ZodError) {
                    throw new Error(`Roadmap validation failed: ${err.message}`);
                }
                throw err;
            }
            break;
        }

        case "prepsphere-ai-buzzwords": {
            const { jobDescription } = job.data;
            result = await extractBuzzwords(jobDescription);
            try {
                BuzzwordsSchema.parse(result);
            } catch (err) {
                if (err instanceof ZodError) {
                    throw new Error(`Buzzword validation failed: ${err.message}`);
                }
                throw err;
            }
            break;
        }

        case "prepsphere-ai-interview": {
            const { jobDescription } = job.data;
            result = await generateMockInterview(jobDescription);
            try {
                InterviewSchema.parse(result);
            } catch (err) {
                if (err instanceof ZodError) {
                    throw new Error(`Interview validation failed: ${err.message}`);
                }
                throw err;
            }
            break;
        }

        case "prepsphere-ai-quiz": {
            const { content } = job.data;
            result = await generateQuiz(content);
            try {
                QuizSchema.parse(result);
            } catch (err) {
                if (err instanceof ZodError) {
                    throw new Error(`Quiz validation failed: ${err.message}`);
                }
                throw err;
            }
            break;
        }

        default:
            throw new Error(`Unknown queue: ${job.queueName}`);
    }

    await Job.findOneAndUpdate(
        { jobId },
        { status: "completed", result, error: null }
    );

    console.log(`[Worker] Job ${jobId} completed successfully`);
    return result;
}

async function handleFailure(job, error) {
    console.error(
        `[Worker] Job ${job?.data?.jobId} failed on attempt ${job?.attemptsMade + 1}:`,
        error.message
    );

    const maxAttempts = job.opts?.attempts ?? MAX_ATTEMPTS[job.queueName] ?? 3;

    if ((job.attemptsMade + 1) >= maxAttempts) {
        await Job.findOneAndUpdate(
            { jobId: job.data.jobId },
            {
                status:   "failed",
                error:    error.message,
                attempts: job.attemptsMade + 1,
            }
        );
        console.log(
            `[Worker] Job ${job.data.jobId} permanently failed after ${job.attemptsMade + 1} attempts`
        );
    }
}

const QUEUE_NAMES = [
    "prepsphere-ai-roadmap",
    "prepsphere-ai-buzzwords",
    "prepsphere-ai-interview",
    "prepsphere-ai-quiz",
];

const CONCURRENCY = {
    "prepsphere-ai-roadmap":   2,
    "prepsphere-ai-buzzwords": 5,
    "prepsphere-ai-interview": 3,
    "prepsphere-ai-quiz":      4,
};

const workers = QUEUE_NAMES.map((queueName) => {
    const connection = createRedisConnection();

    const worker = new Worker(queueName, processJob, {
        connection,
        concurrency: CONCURRENCY[queueName],
    });

    worker.on("completed", (job) => {
        console.log(`[Worker][${queueName}] ✓ job ${job.data.jobId} done`);
    });

    worker.on("failed", (job, err) => {
        handleFailure(job, err);
    });

    worker.on("error", (err) => {
        console.error(`[Worker][${queueName}] Worker error:`, err.message);
    });

    console.log(`[Worker] Listening on "${queueName}" | concurrency: ${CONCURRENCY[queueName]}`);
    return worker;
});

async function shutdown() {
    console.log("[Worker] Shutting down gracefully…");
    await Promise.all(workers.map((w) => w.close()));
    await mongoose.disconnect();
    console.log("[Worker] Shutdown complete.");
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT",  shutdown);

console.log("[Worker] All workers initialised and waiting for jobs.");