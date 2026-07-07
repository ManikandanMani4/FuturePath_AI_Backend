const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("GEMINI_API_KEY is missing");
  process.exit(1);
}

const MODEL = "gemini-2.5-flash";

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;


// ======================================================
// WAIT FUNCTION
// ======================================================

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}


// ======================================================
// GEMINI RETRY FUNCTION
// ======================================================

async function callGeminiWithRetry(
  requestBody,
  maxRetries = 3
) {
  for (
    let attempt = 0;
    attempt <= maxRetries;
    attempt++
  ) {
    console.log(
      `Gemini request attempt ${attempt + 1}`
    );

    const response = await fetch(
      GEMINI_URL,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": API_KEY,
        },

        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();

    if (response.ok) {
      console.log(
        "Gemini response received successfully"
      );

      return data;
    }

    if (
      (
        response.status === 503 ||
        response.status === 429
      ) &&
      attempt < maxRetries
    ) {
      const waitTime =
        Math.pow(2, attempt) * 2000;

      console.log(
        "Gemini temporarily unavailable."
      );

      console.log(
        `Waiting ${waitTime / 1000} seconds...`
      );

      await wait(waitTime);

      continue;
    }

    console.error(
      "GEMINI API ERROR:",
      JSON.stringify(data, null, 2)
    );

    const error = new Error(
      data?.error?.message ||
      "Gemini API request failed"
    );

    error.status = response.status;
    error.details = data;

    throw error;
  }

  throw new Error(
    "Gemini API failed after maximum retries"
  );
}


// ======================================================
// HOME API
// ======================================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,

    message:
      "FuturePath AI Backend is running",
  });
});


// ======================================================
// AI CAREER ANALYSIS API
// ======================================================

app.post(
  "/api/analyze-career",
  async (req, res) => {
    try {
      console.log(
        "Career analysis request received"
      );

      const {
        profile,
        technicalSkills,
        softSkills,
        assessment,
      } = req.body;

      if (!profile) {
        return res.status(400).json({
          success: false,

          error:
            "Profile data is required",
        });
      }


      // ==================================================
      // FUTUREPATH AI PROMPT
      // ==================================================

      const prompt = `
You are FuturePath AI, an expert AI career guidance assistant.

Analyze the student's complete profile and generate
personalized career recommendations.

STUDENT PROFILE:
${JSON.stringify(profile, null, 2)}

TECHNICAL SKILLS:
${JSON.stringify(technicalSkills, null, 2)}

SOFT SKILLS:
${JSON.stringify(softSkills, null, 2)}

CAREER ASSESSMENT:
${JSON.stringify(assessment, null, 2)}


CAREER MATCHING RULES:

Return exactly 5 career matches.

Analyze:
- education
- degree
- department
- interests
- technical skills
- technical skill proficiency
- soft skills
- career goal
- assessment answers
- strengths
- problem solving ability
- creativity
- leadership interest

Generate career recommendations dynamically from the
student's actual profile.

Do not use fixed career recommendations.

Do not always recommend:
- Software Developer
- DevOps Engineer
- AI/ML Engineer

Recommend these careers only when the student's profile
strongly matches the career.

The five careers must be meaningfully different career paths.

Do not return careers that are only renamed versions
of the same role.

For example:

Software Developer,
Software Engineer,
Application Developer,
and Backend Software Developer

must not all appear in the same career analysis.

Different student profiles should receive different
career recommendations.


MATCH PERCENTAGE RULES:

Calculate matchPercentage independently for every career.

The match percentage must be based on:
- technical skill match
- technical skill proficiency
- interest match
- education match
- assessment match
- soft skill match

Do not use fixed percentages.

Do not automatically return:
95, 90, 85, 80, 75.

Use the student's actual data.

A student with stronger relevant skills should receive
a higher match percentage.

If the student's relevant skill proficiency improves,
the career match percentage should increase when the
career is analyzed again.

The percentage must be an integer from 0 to 100.


SKILLS TO IMPROVE RULES:

Each career must contain its own skillsToImprove.

Return 3 to 5 skills.

skillsToImprove should contain relevant skills the student
needs to strengthen for that specific career.

Prioritize relevant skills currently marked as Beginner
or Intermediate.

If an essential career foundation skill is missing,
it may also be included.

Return only clear skill names.

Do not return long sentences.

Do not return unrelated skills.


RECOMMENDED SKILLS RULES:

Each career must contain its own recommendedSkills.

Return 4 to 6 skills.

recommendedSkills should contain new skills the student
should learn next for that specific career.

Recommend practical and industry-relevant:
- technologies
- frameworks
- tools
- platforms
- methods
- professional skills

Do not repeat skills from skillsToImprove.

Do not use generic recommendations such as:
- Improve Coding
- Learn Technology
- Technical Skills

Return clear and searchable skill names.

The application uses these skill names to search
learning platforms.


CAREER-SPECIFIC SKILL RULE:

Each career must have different career-specific
skillsToImprove and recommendedSkills.

Do not create global skillGaps.

Do not create global recommendedSkills.

Do not create a global roadmap.


OUTPUT RULES:

Return ONLY valid JSON.

Do not return markdown.

Do not return code fences.

Do not include text before or after the JSON.

Use exactly this JSON structure:

{
  "careerMatches": [
    {
      "career": "Career Name",
      "matchPercentage": 0,
      "reason": "Short personalized reason",
      "skillsToImprove": [
        "Skill 1",
        "Skill 2",
        "Skill 3"
      ],
      "recommendedSkills": [
        "New Skill 1",
        "New Skill 2",
        "New Skill 3",
        "New Skill 4"
      ]
    }
  ],
  "strengths": [
    "Strength 1",
    "Strength 2",
    "Strength 3"
  ],
  "careerSummary":
    "Short personalized career summary"
}

The careerMatches array MUST contain exactly 5 objects.
`;


      // ==================================================
      // GEMINI REQUEST BODY
      // ==================================================

      const requestBody = {
        contents: [
          {
            role: "user",

            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],

        generationConfig: {
          responseMimeType:
            "application/json",

          temperature: 0.4,

          topP: 0.9,

          maxOutputTokens: 8192,
        },
      };


      // ==================================================
      // CALL GEMINI
      // ==================================================

      const geminiData =
        await callGeminiWithRetry(
          requestBody,
          3
        );


      // ==================================================
      // GET GEMINI RESPONSE
      // ==================================================

      const responseText =
        geminiData
          ?.candidates?.[0]
          ?.content?.parts?.[0]
          ?.text;

      if (!responseText) {
        console.error(
          "EMPTY GEMINI RESPONSE:",
          JSON.stringify(
            geminiData,
            null,
            2
          )
        );

        throw new Error(
          "Gemini returned an empty response"
        );
      }

      console.log(
        "Gemini career analysis generated"
      );


      // ==================================================
      // CONVERT RESPONSE TO JSON
      // ==================================================

      let analysis;

      try {
        analysis = JSON.parse(
          responseText
        );
      } catch (jsonError) {
        console.error(
          "INVALID GEMINI JSON:"
        );

        console.error(
          responseText
        );

        throw new Error(
          "Gemini returned invalid JSON"
        );
      }


      // ==================================================
      // CAREER MATCH VALIDATION
      // ==================================================

      if (
        !Array.isArray(
          analysis.careerMatches
        ) ||
        analysis.careerMatches.length !== 5
      ) {
        throw new Error(
          "Gemini did not return exactly 5 career matches"
        );
      }


      // ==================================================
      // VALIDATE EVERY CAREER
      // ==================================================

      for (
        const career of analysis.careerMatches
      ) {
        if (
          !career.career ||
          typeof career.career !== "string"
        ) {
          throw new Error(
            "Invalid career name"
          );
        }

        if (
          typeof career.matchPercentage !==
          "number"
        ) {
          throw new Error(
            `Invalid match percentage for ${career.career}`
          );
        }

        career.matchPercentage = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              career.matchPercentage
            )
          )
        );

        if (
          !Array.isArray(
            career.skillsToImprove
          )
        ) {
          throw new Error(
            `Invalid skillsToImprove for ${career.career}`
          );
        }

        if (
          !Array.isArray(
            career.recommendedSkills
          )
        ) {
          throw new Error(
            `Invalid recommendedSkills for ${career.career}`
          );
        }
      }


      // ==================================================
      // STRENGTH VALIDATION
      // ==================================================

      if (
        !Array.isArray(
          analysis.strengths
        )
      ) {
        throw new Error(
          "Invalid strengths data"
        );
      }


      // ==================================================
      // SORT CAREERS BY MATCH
      // ==================================================

      analysis.careerMatches.sort(
        (a, b) =>
          b.matchPercentage -
          a.matchPercentage
      );


      // ==================================================
      // SUCCESS RESPONSE
      // ==================================================

      console.log(
        "FuturePath AI analysis completed"
      );

      return res.status(200).json({
        success: true,

        analysis: analysis,
      });

    } catch (error) {
      console.error(
        "AI ANALYSIS ERROR:",
        error.message
      );

      if (error.details) {
        console.error(
          JSON.stringify(
            error.details,
            null,
            2
          )
        );
      }

      if (error.status === 503) {
        return res.status(503).json({
          success: false,

          error:
            "AI service is temporarily busy",

          message:
            "Gemini is currently experiencing high demand. Please try again shortly.",
        });
      }

      if (error.status === 429) {
        return res.status(429).json({
          success: false,

          error:
            "AI request limit reached",

          message:
            "Please wait before trying the AI analysis again.",
        });
      }

      return res.status(
        error.status || 500
      ).json({
        success: false,

        error:
          "Unable to analyze career",

        details:
          error.message,
      });
    }
  }
);


// ======================================================
// 404 API
// ======================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,

    error:
      "API route not found",
  });
});


// ======================================================
// SERVER
// ======================================================

const PORT =
  process.env.PORT || 5000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "================================"
    );

    console.log(
      "FuturePath AI Backend"
    );

    console.log(
      `Running on port ${PORT}`
    );

    console.log(
      `Gemini Model: ${MODEL}`
    );

    console.log(
      "================================"
    );
  }
);