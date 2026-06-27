require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const { ZodError } = require("zod/v4");

const { generateRoadmap, generateQuiz, generateMockInterview, extractBuzzwords } = require("../aiService");
const { RoadmapSchema, QuizSchema, InterviewSchema, BuzzwordsSchema } = require("../schemas");

const SAMPLE_ROLES = [
    "Machine Learning Engineer",
    "DevOps Engineer",
    "Product Manager",
    "iOS Developer",
    "Cybersecurity Analyst",
];

const SAMPLE_JOB_DESCRIPTIONS = [
    `We are looking for a Senior Backend Engineer to join our platform team. The ideal candidate has 5+ years of experience with Node.js, PostgreSQL, and Redis. You will design and build RESTful APIs, own microservices architecture decisions, and collaborate with frontend teams. Experience with Docker, Kubernetes, and AWS is required. Strong understanding of distributed systems and message queues (RabbitMQ or Kafka) is a plus.`,

    `Seeking a Data Scientist with expertise in Python, Pandas, Scikit-learn, and SQL. You will work on predictive modelling, A/B testing frameworks, and customer churn analysis. Familiarity with Spark and cloud platforms (GCP preferred) is expected. You must be comfortable presenting findings to non-technical stakeholders and translating business problems into analytical solutions.`,

    `We need a Full Stack Developer proficient in React, TypeScript, and Django REST Framework. Responsibilities include building user-facing features, maintaining CI/CD pipelines via GitHub Actions, writing unit and integration tests, and participating in code reviews. Experience with PostgreSQL query optimisation and familiarity with Docker-based local development is essential.`,

    `Our team is hiring a Mobile Developer specialising in Flutter and Dart. You will build cross-platform applications for iOS and Android, integrate Firebase services (Auth, Firestore, Cloud Messaging), and maintain clean state management using Riverpod. Experience with native module bridging and App Store/Play Store submission processes is required.`,

    `We are hiring a Cloud Infrastructure Engineer with deep experience in Terraform, AWS (EC2, RDS, Lambda, S3), and monitoring stacks (Prometheus, Grafana). You will own infrastructure-as-code, implement cost-optimisation strategies, and ensure 99.9% uptime SLAs. Experience with security hardening, IAM policies, and VPC design is mandatory.`,
];

const SAMPLE_QUIZ_CONTENT = [
    `Convolutional Neural Networks (CNNs) are a class of deep learning models primarily used for image recognition tasks. They use convolutional layers that apply learnable filters across input data to detect spatial hierarchies of features. Pooling layers reduce spatial dimensions, and fully connected layers perform final classification. Key concepts include filter size, stride, padding, and activation functions like ReLU. CNNs have achieved state-of-the-art results on benchmarks like ImageNet.`,

    `REST (Representational State Transfer) is an architectural style for building web APIs. RESTful APIs use HTTP methods: GET to retrieve resources, POST to create, PUT or PATCH to update, and DELETE to remove. Resources are identified by URLs. Responses are typically JSON. Key principles include statelessness (no server-side session), a uniform interface, and layered system architecture. Status codes like 200, 201, 400, 401, 404, and 500 communicate outcomes.`,

    `SQL joins combine rows from two or more tables based on a related column. INNER JOIN returns only rows where the condition matches in both tables. LEFT JOIN returns all rows from the left table and matched rows from the right. RIGHT JOIN is the mirror. FULL OUTER JOIN returns all rows from both tables. Indexes speed up queries on large datasets by creating a data structure that enables faster lookups at the cost of additional write overhead.`,

    `Docker is a platform for containerising applications. A Dockerfile defines the environment: base image, dependencies, and startup command. Images are built with docker build and run as containers with docker run. Docker Compose orchestrates multi-container setups via a YAML file. Containers share the host OS kernel but are isolated via namespaces and cgroups. Key benefits include consistency across environments and fast iteration cycles.`,

    `Agile software development is an iterative approach that delivers working software in short cycles called sprints, typically 1–4 weeks. Scrum is a popular Agile framework with defined roles: Product Owner (manages backlog), Scrum Master (facilitates process), and Development Team. Ceremonies include sprint planning, daily standups, sprint review, and retrospectives. Kanban is an alternative that visualises work in progress and limits concurrent tasks to reduce bottlenecks.`,
];

const RUNS_PER_INPUT = 6;
const TOTAL_RUNS = SAMPLE_ROLES.length * RUNS_PER_INPUT;

const FEATURES = [
    {
        name: "roadmap",
        inputs: SAMPLE_ROLES,
        fn: (input) => generateRoadmap(input),
        schema: RoadmapSchema,
    },
    {
        name: "buzzwords",
        inputs: SAMPLE_JOB_DESCRIPTIONS,
        fn: (input) => extractBuzzwords(input),
        schema: BuzzwordsSchema,
    },
    {
        name: "interview",
        inputs: SAMPLE_JOB_DESCRIPTIONS,
        fn: (input) => generateMockInterview(input),
        schema: InterviewSchema,
    },
    {
        name: "quiz",
        inputs: SAMPLE_QUIZ_CONTENT,
        fn: (input) => generateQuiz(input),
        schema: QuizSchema,
    },
];

async function runFeature(feature) {
    const results = [];

    for (let run = 0; run < TOTAL_RUNS; run++) {
        const input = feature.inputs[run % feature.inputs.length];
        const inputLabel = input.slice(0, 60).replace(/\n/g, " ") + (input.length > 60 ? "..." : "");

        process.stdout.write(`  [${feature.name}] run ${run + 1}/${TOTAL_RUNS} — ${inputLabel}\n`);

        let pass = false;
        let errorMessage = null;
        let durationMs = null;

        const start = Date.now();

        try {
            const result = await feature.fn(input);
            durationMs = Date.now() - start;
            feature.schema.parse(result);
            pass = true;
        } catch (err) {
            durationMs = durationMs ?? Date.now() - start;
            if (err instanceof ZodError) {
                errorMessage = `ZodError: ${err.message}`;
            } else {
                errorMessage = err.message;
            }
        }

        results.push({
            run: run + 1,
            input: inputLabel,
            pass,
            durationMs,
            error: errorMessage,
        });
    }

    return results;
}

function printSummaryTable(allResults) {
    const colWidths = { feature: 12, total: 7, pass: 7, fail: 7, rate: 10 };
    const line = "-".repeat(Object.values(colWidths).reduce((a, b) => a + b, 0) + Object.keys(colWidths).length * 3 + 1);

    const pad = (str, width) => String(str).padEnd(width);

    console.log("\n" + line);
    console.log(
        `| ${pad("Feature", colWidths.feature)} | ${pad("Total", colWidths.total)} | ${pad("Pass", colWidths.pass)} | ${pad("Fail", colWidths.fail)} | ${pad("Pass Rate", colWidths.rate)} |`
    );
    console.log(line);

    for (const [feature, results] of Object.entries(allResults)) {
        const total = results.length;
        const pass = results.filter((r) => r.pass).length;
        const fail = total - pass;
        const rate = ((pass / total) * 100).toFixed(1) + "%";
        console.log(
            `| ${pad(feature, colWidths.feature)} | ${pad(total, colWidths.total)} | ${pad(pass, colWidths.pass)} | ${pad(fail, colWidths.fail)} | ${pad(rate, colWidths.rate)} |`
        );
    }

    console.log(line + "\n");
}

async function main() {
    console.log(`\nPrepSphere AI Eval — ${TOTAL_RUNS} runs per feature, ${FEATURES.length} features\n`);

    const allResults = {};

    for (const feature of FEATURES) {
        console.log(`\n=== ${feature.name.toUpperCase()} ===`);
        allResults[feature.name] = await runFeature(feature);
    }

    printSummaryTable(allResults);

    const outputPath = path.resolve(__dirname, "results.json");
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
    console.log(`Full results written to ${outputPath}\n`);
}

main().catch((err) => {
    console.error("Eval script crashed:", err);
    process.exit(1);
});