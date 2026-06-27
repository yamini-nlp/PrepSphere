const { z } = require("zod");

const RoadmapSchema = z.object({
  role: z.string(),
  roadmapSteps: z.array(
    z.object({
      title: z.string(),
      subtitle: z.string(),
      topics: z.array(z.string()),
      resources: z.array(
        z.object({
          type: z.string(),
          name: z.string(),
          context: z.string(),
        })
      ),
      practice: z.array(z.string()),
    })
  ),
  projectIdeas: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      stack: z.array(z.string()),
    })
  ),
});

const QuizSchema = z.array(
  z.object({
    question: z.string(),
    options: z.array(z.string()).length(4),
    answer: z.number().int().min(0).max(3),
  })
);

const InterviewSchema = z.object({
  topics: z.array(z.string()),
  interviews: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    })
  ),
});

const BuzzwordsSchema = z.array(z.string().min(1)).refine(
  (arr) => arr.length > 0 && !arr.some((w) => w.includes("AI is busy")),
  { message: "Buzzword extraction failed or AI was busy" }
);

module.exports = { RoadmapSchema, QuizSchema, InterviewSchema, BuzzwordsSchema };