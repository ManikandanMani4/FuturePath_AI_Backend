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
You are FuturePath AI.

You are an expert AI career guidance and career
recommendation system designed for students.

Your responsibility is to carefully analyze a student's:

- Education
- Degree
- Department
- Year of study
- Career interests
- Technical skills
- Technical skill levels
- Soft skills
- Career assessment answers
- Problem-solving ability
- Technical interests
- Career potential

The student information is provided below.


STUDENT PROFILE:

${JSON.stringify(profile, null, 2)}


TECHNICAL SKILLS:

${JSON.stringify(
  technicalSkills || {},
  null,
  2
)}


SOFT SKILLS:

${JSON.stringify(
  softSkills || [],
  null,
  2
)}


CAREER ASSESSMENT:

${JSON.stringify(
  assessment || {},
  null,
  2
)}


==================================================

ANALYSIS INSTRUCTIONS

==================================================

1. Analyze the student's education.

2. Analyze the student's department and academic
   background.

3. Analyze the student's career interests.

4. Analyze every technical skill.

5. Consider the skill level:
   Beginner,
   Intermediate,
   Advanced.

6. Analyze the student's soft skills.

7. Analyze all career assessment answers.

8. Compare the student's current skills with
   real career requirements.

9. Recommend exactly 3 realistic career paths.

10. The careers must be relevant to the student's
    actual profile.

11. Give every career a match percentage from
    0 to 100.

12. Do not give every career an unrealistically
    high percentage.

13. The first career must be the strongest match.

14. Career matches must be ordered from highest
    percentage to lowest percentage.

15. Explain clearly why every career matches
    the student.

16. Identify the student's current strengths.

17. Identify missing or weak career skills.

18. Do not list an existing student skill as a
    missing skill.

19. Recommend useful skills to learn next.

20. Recommended skills must support the suggested
    career paths.

21. Create a practical six-month learning roadmap.

22. The roadmap must consider the student's
    existing skill level.

23. Do not claim the student has skills that are
    not provided in the student data.

24. Do not invent education information.

25. Do not invent assessment answers.

26. Return ONLY valid JSON.

27. Do not return markdown.

28. Do not use JSON code fences.

29. Do not write text before the JSON.

30. Do not write text after the JSON.


==================================================

RETURN EXACTLY THIS JSON STRUCTURE

==================================================

{
  "careerMatches": [
    {
      "career": "Career Name",
      "matchPercentage": 90,
      "reason": "Clear reason explaining the career match"
    },
    {
      "career": "Career Name",
      "matchPercentage": 80,
      "reason": "Clear reason explaining the career match"
    },
    {
      "career": "Career Name",
      "matchPercentage": 70,
      "reason": "Clear reason explaining the career match"
    }
  ],
  "strengths": [
    "Strength 1",
    "Strength 2",
    "Strength 3"
  ],
  "skillGaps": [
    "Skill gap 1",
    "Skill gap 2",
    "Skill gap 3"
  ],
  "recommendedSkills": [
    "Skill 1",
    "Skill 2",
    "Skill 3",
    "Skill 4"
  ],
  "careerSummary": "Detailed career analysis summary",
  "roadmap": [
    {
      "stage": "Foundation",
      "duration": "1-2 months",
      "focus": [
        "Learning goal 1",
        "Learning goal 2",
        "Learning goal 3"
      ]
    },
    {
      "stage": "Intermediate",
      "duration": "3-4 months",
      "focus": [
        "Learning goal 1",
        "Learning goal 2",
        "Learning goal 3"
      ]
    },
    {
      "stage": "Career Ready",
      "duration": "5-6 months",
      "focus": [
        "Learning goal 1",
        "Learning goal 2",
        "Learning goal 3"
      ]
    }
  ]
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