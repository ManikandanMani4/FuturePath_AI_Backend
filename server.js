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


    // ==================================================
    // RETRY TEMPORARY GEMINI ERRORS
    // ==================================================

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
        `Gemini temporarily unavailable.`
      );

      console.log(
        `Waiting ${waitTime / 1000} seconds...`
      );

      console.log(
        `Retry ${attempt + 1}/${maxRetries}`
      );

      await wait(waitTime);

      continue;
    }


    // ==================================================
    // GEMINI ERROR
    // ==================================================

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


      // ==================================================
      // VALIDATION
      // ==================================================

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

Analyze the student's profile, technical skills,
soft skills, interests, education, and career assessment.

Student Profile:
${JSON.stringify(profile, null, 2)}

Technical Skills:
${JSON.stringify(technicalSkills, null, 2)}

Soft Skills:
${JSON.stringify(softSkills, null, 2)}

Career Assessment:
${JSON.stringify(assessment, null, 2)}

CAREER MATCHING RULES:

Return exactly 3 career matches.

Analyze the student's complete profile including:
- education
- degree
- department
- interests
- technical skills
- soft skills
- career goal
- assessment answers
- strengths
- problem solving ability
- creativity
- leadership interest

Do not limit career recommendations to software development,
AI, machine learning, cloud computing, or DevOps.

Do not use fixed or predefined career names.

Generate career matches dynamically based only on the
student's actual profile and assessment data.

The 3 careers should represent the strongest career matches
for the individual student.

Different students with different profiles should receive
different career recommendations.

For example, possible career domains may include technology,
design, management, business, research, analytics,
cybersecurity, product management, consulting, education,
entrepreneurship, or other relevant professional fields.

These domains are examples only.
Do not automatically select careers from this list.

Each career match MUST contain its own skillsToImprove
and recommendedSkills.

skillsToImprove must describe skills the student currently
needs to strengthen specifically for that career.

recommendedSkills must contain useful skills the student
should learn specifically for that career.

Do not create global skillGaps.

Do not create global recommendedSkills.

Do not use the same skills for all career matches.

Calculate matchPercentage independently for each career
using the student's actual profile and assessment.

Return ONLY valid JSON.

Use exactly this JSON structure:

{
  "careerMatches": [
    {
      "career": "Career Name",
      "matchPercentage": 90,
      "reason": "Explain why this career matches the student",
      "skillsToImprove": [
        "Career specific skill 1",
        "Career specific skill 2",
        "Career specific skill 3",
        "Career specific skill 4"
      ],
      "recommendedSkills": [
        "Recommended skill 1",
        "Recommended skill 2",
        "Recommended skill 3",
        "Recommended skill 4"
      ]
    },
    {
      "career": "Career Name",
      "matchPercentage": 85,
      "reason": "Explain why this career matches the student",
      "skillsToImprove": [
        "Career specific skill 1",
        "Career specific skill 2",
        "Career specific skill 3",
        "Career specific skill 4"
      ],
      "recommendedSkills": [
        "Recommended skill 1",
        "Recommended skill 2",
        "Recommended skill 3",
        "Recommended skill 4"
      ]
    },
    {
      "career": "Career Name",
      "matchPercentage": 80,
      "reason": "Explain why this career matches the student",
      "skillsToImprove": [
        "Career specific skill 1",
        "Career specific skill 2",
        "Career specific skill 3",
        "Career specific skill 4"
      ],
      "recommendedSkills": [
        "Recommended skill 1",
        "Recommended skill 2",
        "Recommended skill 3",
        "Recommended skill 4"
      ]
    }
  ],
  "strengths": [
    "Student strength 1",
    "Student strength 2",
    "Student strength 3"
  ],
  "careerSummary": "Short personalized career summary"
}
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
      // CALL GEMINI WITH RETRY
      // ==================================================

      const geminiData =
        await callGeminiWithRetry(
          requestBody,
          3
        );


      // ==================================================
      // GET GEMINI TEXT
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
      // CONVERT AI RESPONSE TO JSON
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

        console.error(responseText);

        throw new Error(
          "Gemini returned invalid JSON"
        );
      }


      // ==================================================
      // BASIC AI RESPONSE VALIDATION
      // ==================================================

      if (
        !Array.isArray(
          analysis.careerMatches
        ) ||
        analysis.careerMatches.length !== 3
      ) {
        throw new Error(
          "Gemini did not return exactly 3 career matches"
        );
      }


      if (
        !Array.isArray(
          analysis.strengths
        )
      ) {
        throw new Error(
          "Invalid strengths data"
        );
      }


      if (
        !Array.isArray(
          analysis.skillGaps
        )
      ) {
        throw new Error(
          "Invalid skill gaps data"
        );
      }


      if (
        !Array.isArray(
          analysis.recommendedSkills
        )
      ) {
        throw new Error(
          "Invalid recommended skills data"
        );
      }


      if (
        !Array.isArray(
          analysis.roadmap
        )
      ) {
        throw new Error(
          "Invalid roadmap data"
        );
      }


      // ==================================================
      // SORT CAREER MATCHES
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

      // ==================================================
      // ERROR LOG
      // ==================================================

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


      // ==================================================
      // TEMPORARY GEMINI ERROR
      // ==================================================

      if (
        error.status === 503
      ) {
        return res.status(503).json({
          success: false,

          error:
            "AI service is temporarily busy",

          message:
            "Gemini is currently experiencing high demand. Please try again shortly.",
        });
      }


      // ==================================================
      // GEMINI RATE LIMIT
      // ==================================================

      if (
        error.status === 429
      ) {
        return res.status(429).json({
          success: false,

          error:
            "AI request limit reached",

          message:
            "Please wait before trying the AI analysis again.",
        });
      }


      // ==================================================
      // GENERAL ERROR
      // ==================================================

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

    error: "API route not found",
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
      "Gemini Model: gemini-2.5-flash"
    );

    console.log(
      "================================"
    );
  }
);