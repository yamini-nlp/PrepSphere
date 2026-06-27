import { ZodError } from "zod";
import { RoadmapSchema, QuizSchema, InterviewSchema, BuzzwordsSchema } from "./schemas.js";

const SCHEMAS = {
  roadmap:    RoadmapSchema,
  quiz:       QuizSchema,
  interview:  InterviewSchema,
  buzzwords:  BuzzwordsSchema,
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
        return res.status(500).json({ error: 'GROQ_API_KEY is not set in environment variables.' });
    }

    const { feature, ...groqBody } = req.body;

    const schema = SCHEMAS[feature];
    if (!schema) {
        return res.status(400).json({ error: `Missing or unknown feature. Must be one of: ${Object.keys(SCHEMAS).join(', ')}` });
    }

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqApiKey}`
            },
            body: JSON.stringify(groqBody)
        });

        const data = await groqRes.json();

        if (!groqRes.ok) {
            return res.status(groqRes.status).json({ error: data.error?.message || 'Groq API error' });
        }

        const rawContent = data.choices[0].message.content || '';

        let parsed;
        if (feature === 'buzzwords') {
            parsed = rawContent.split(',').map(w => w.trim()).filter(w => w !== '');
        } else {
            parsed = JSON.parse(rawContent);
            if (feature === 'quiz') {
                parsed = parsed.questions;
            }
        }

        try {
            schema.parse(parsed);
        } catch (err) {
            if (err instanceof ZodError) {
                return res.status(422).json({ error: `Validation failed (${feature}): ${err.message}` });
            }
            throw err;
        }

        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to reach Groq API: ' + err.message });
    }
}