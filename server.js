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
// WAIT
// ======================================================

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}


// ======================================================
// GEMINI RETRY
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

        body: JSON.stringify(
          requestBody
        ),
      }
    );

    let data;

    try {
      data = await response.json();
    } catch (error) {
      const parseError = new Error(
        "Gemini returned invalid response"
      );

      parseError.status =
        response.status;

      throw parseError;
    }

    if (response.ok) {
      console.log(
        "Gemini response received"
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
        `Gemini busy. Waiting ${
          waitTime / 1000
        } seconds`
      );

      await wait(waitTime);

      continue;
    }

    console.error(
      "GEMINI ERROR:",
      JSON.stringify(
        data,
        null,
        2
      )
    );

    const error = new Error(
      data?.error?.message ||
      "Gemini API request failed"
    );

    error.status =
      response.status;

    throw error;
  }

  throw new Error(
    "Gemini failed after retries"
  );
}


// ======================================================
// GET GEMINI RESPONSE TEXT
// ======================================================

function getGeminiResponseText(
  geminiData
) {
  const parts =
    geminiData
      ?.candidates?.[0]
      ?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => {
      return part?.text ?? "";
    })
    .join("")
    .trim();
}


// ======================================================
// PARSE GEMINI JSON
// ======================================================

function parseGeminiJson(
  rawText
) {
  const cleanedText =
    rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

  return JSON.parse(
    cleanedText
  );
}


// ======================================================
// HOME API
// ======================================================

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,

    message:
      "FuturePath AI Backend is running",

    model: MODEL,

    services: [
      "Career Analysis",
      "Career Roadmap Generation",
      "FuturePath AI Guide",
    ],
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
        "CAREER ANALYSIS STARTED"
      );

      const {
        profile = {},
        technicalSkills = {},
        softSkills = [],
        assessment = {},
      } = req.body;

      if (
        !profile ||
        typeof profile !== "object"
      ) {
        return res.status(400).json({
          success: false,

          error:
            "Profile data is required",
        });
      }


      // ==================================================
      // CAREER ANALYSIS PROMPT
      // ==================================================

      const prompt = `
You are FuturePath AI.

You are an expert AI career guidance,
career matching and skill gap analysis system.

Analyze the student's complete profile.

Generate exactly 5 personalized career matches.

==================================================
STUDENT PROFILE
==================================================

${JSON.stringify(
  profile,
  null,
  2
)}

==================================================
TECHNICAL SKILLS
==================================================

${JSON.stringify(
  technicalSkills,
  null,
  2
)}

==================================================
SOFT SKILLS
==================================================

${JSON.stringify(
  softSkills,
  null,
  2
)}

==================================================
CAREER ASSESSMENT
==================================================

${JSON.stringify(
  assessment,
  null,
  2
)}

==================================================
CAREER MATCHING RULES
==================================================

Return exactly 5 career matches.

Analyze:

education
degree
department
current year
interests
technical skills
technical skill proficiency
soft skills
assessment answers
problem solving
creativity
leadership
career interests

Generate careers dynamically.

Do not use fixed career recommendations.

The five careers must be meaningfully different.

Do not return renamed versions of the same career.

==================================================
CAREER SKILLS
==================================================

Every career MUST contain careerSkills.

careerSkills represents all important skills required
for that career.

Return 6 to 10 career skills for every career.

Every career skill must contain:

skill
weight
currentProficiency
completed

Example:

{
  "skill": "AWS",
  "weight": 20,
  "currentProficiency": 60,
  "completed": false
}

The total weight of all careerSkills for one career
MUST equal exactly 100.

weight represents the importance of the skill.

currentProficiency must be an integer from 0 to 100.

Calculate currentProficiency from the student's actual
skills and proficiency.

Use approximately:

Missing skill = 0

Beginner = 25

Intermediate = 60

Advanced = 85

Strong demonstrated mastery = 100

completed must be true ONLY when
currentProficiency is 100.

Do not mark missing skills as completed.

==================================================
MATCH PERCENTAGE
==================================================

Calculate matchPercentage only from careerSkills.

For every skill:

skillContribution =
weight * currentProficiency / 100

matchPercentage =
rounded sum of all skillContribution values.

Do not invent matchPercentage separately.

The percentage must be between 0 and 100.

==================================================
SKILLS TO IMPROVE
==================================================

Return 3 to 5 skills.

skillsToImprove must contain careerSkills where
currentProficiency is greater than 0 but less than 100.

Prioritize low and medium proficiency skills.

Return skill names only.

==================================================
RECOMMENDED SKILLS
==================================================

Return 4 to 6 skills.

recommendedSkills must contain important careerSkills
where currentProficiency is 0.

These are new skills the student should learn.

Do not repeat skillsToImprove.

Return skill names only.

==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

Do not return markdown.

Do not return code fences.

Use exactly this structure:

{
  "careerMatches": [
    {
      "career": "Career Name",
      "matchPercentage": 0,
      "reason": "Short personalized reason",
      "careerSkills": [
        {
          "skill": "Skill Name",
          "weight": 0,
          "currentProficiency": 0,
          "completed": false
        }
      ],
      "skillsToImprove": [
        "Skill 1",
        "Skill 2",
        "Skill 3"
      ],
      "recommendedSkills": [
        "Skill 1",
        "Skill 2",
        "Skill 3",
        "Skill 4"
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

          temperature: 0.35,

          maxOutputTokens: 16384,
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
      // GET RESPONSE
      // ==================================================

      const rawText =
        getGeminiResponseText(
          geminiData
        );

      if (!rawText) {
        throw new Error(
          "Gemini returned empty career analysis"
        );
      }

      console.log(
        "CAREER ANALYSIS RESPONSE RECEIVED"
      );


      // ==================================================
      // PARSE JSON
      // ==================================================

      let analysis;

      try {
        analysis =
          parseGeminiJson(
            rawText
          );
      } catch (error) {
        console.error(
          "CAREER JSON ERROR:",
          error
        );

        console.error(
          "RAW CAREER TEXT:",
          rawText
        );

        throw new Error(
          "Gemini returned invalid career JSON"
        );
      }


      // ==================================================
      // VALIDATE CAREERS
      // ==================================================

      if (
        !Array.isArray(
          analysis.careerMatches
        )
      ) {
        throw new Error(
          "Career matches not found"
        );
      }

      if (
        analysis.careerMatches.length !== 5
      ) {
        throw new Error(
          `Gemini returned ${
            analysis.careerMatches.length
          } careers instead of 5`
        );
      }


      // ==================================================
      // CLEAN CAREER MATCHES
      // ==================================================

      analysis.careerMatches =
        analysis.careerMatches.map(
          (careerData) => {
            const rawCareerSkills =
              Array.isArray(
                careerData.careerSkills
              )
                ? careerData.careerSkills
                : [];

            const careerSkills =
              rawCareerSkills
                .filter(
                  (skillData) =>
                    skillData &&
                    typeof skillData ===
                      "object"
                )
                .map(
                  (skillData) => {
                    const skill =
                      skillData.skill
                        ?.toString()
                        .trim() ?? "";

                    const weight =
                      Math.max(
                        0,
                        Number(
                          skillData.weight
                        ) || 0
                      );

                    const currentProficiency =
                      Math.max(
                        0,
                        Math.min(
                          100,
                          Math.round(
                            Number(
                              skillData
                                .currentProficiency
                            ) || 0
                          )
                        )
                      );

                    return {
                      skill,

                      weight,

                      currentProficiency,

                      completed:
                        currentProficiency ===
                        100,
                    };
                  }
                )
                .filter(
                  (skillData) =>
                    skillData.skill
                );


            // ============================================
            // NORMALIZE CAREER SKILL WEIGHTS
            // ============================================

            const totalWeight =
              careerSkills.reduce(
                (
                  total,
                  skillData
                ) => {
                  return (
                    total +
                    skillData.weight
                  );
                },
                0
              );

            if (
              careerSkills.length > 0
            ) {
              let assignedWeight = 0;

              careerSkills.forEach(
                (
                  skillData,
                  index
                ) => {
                  if (
                    index ===
                    careerSkills.length - 1
                  ) {
                    skillData.weight =
                      Math.max(
                        0,
                        100 -
                        assignedWeight
                      );

                    return;
                  }

                  const normalizedWeight =
                    totalWeight > 0
                      ? Math.round(
                          (
                            skillData.weight /
                            totalWeight
                          ) *
                          100
                        )
                      : Math.floor(
                          100 /
                          careerSkills.length
                        );

                  skillData.weight =
                    normalizedWeight;

                  assignedWeight +=
                    normalizedWeight;
                }
              );
            }


            // ============================================
            // CALCULATE MATCH PERCENTAGE
            // ============================================

            const matchPercentage =
              Math.max(
                0,
                Math.min(
                  100,
                  Math.round(
                    careerSkills.reduce(
                      (
                        total,
                        skillData
                      ) => {
                        const contribution =
                          (
                            skillData.weight *
                            skillData
                              .currentProficiency
                          ) /
                          100;

                        return (
                          total +
                          contribution
                        );
                      },
                      0
                    )
                  )
                )
              );


            // ============================================
            // SKILLS TO IMPROVE
            // ============================================

            const skillsToImprove =
              careerSkills
                .filter(
                  (skillData) => {
                    return (
                      skillData
                        .currentProficiency >
                        0 &&
                      skillData
                        .currentProficiency <
                        100
                    );
                  }
                )
                .sort(
                  (a, b) =>
                    a.currentProficiency -
                    b.currentProficiency
                )
                .slice(0, 5)
                .map(
                  (skillData) =>
                    skillData.skill
                );


            // ============================================
            // RECOMMENDED SKILLS
            // ============================================

            const recommendedSkills =
              careerSkills
                .filter(
                  (skillData) =>
                    skillData
                      .currentProficiency ===
                    0
                )
                .sort(
                  (a, b) =>
                    b.weight -
                    a.weight
                )
                .slice(0, 6)
                .map(
                  (skillData) =>
                    skillData.skill
                );


            return {
              career:
                careerData.career
                  ?.toString()
                  .trim() ||
                "Career",

              matchPercentage,

              reason:
                careerData.reason
                  ?.toString()
                  .trim() ||
                "Career matched from your skills and interests.",

              careerSkills,

              skillsToImprove,

              recommendedSkills,
            };
          }
        );


      // ==================================================
      // SORT CAREERS BY MATCH
      // ==================================================

      analysis.careerMatches.sort(
        (a, b) =>
          b.matchPercentage -
          a.matchPercentage
      );


      // ==================================================
      // FINAL ANALYSIS
      // ==================================================

      const finalAnalysis = {
        careerMatches:
          analysis.careerMatches,

        strengths:
          Array.isArray(
            analysis.strengths
          )
            ? analysis.strengths
                .map(
                  (strength) =>
                    strength
                      ?.toString()
                      .trim()
                )
                .filter(Boolean)
                .slice(0, 5)
            : [],

        careerSummary:
          analysis.careerSummary
            ?.toString()
            .trim() ||
          "Your career analysis has been completed.",
      };


      console.log(
        "CAREER ANALYSIS COMPLETED"
      );

      console.log(
        "CAREERS:",
        finalAnalysis.careerMatches.map(
          (careerData) => ({
            career:
              careerData.career,

            match:
              careerData.matchPercentage,

            skills:
              careerData
                .careerSkills.length,
          })
        )
      );


      return res.status(200).json({
        success: true,

        analysis:
          finalAnalysis,
      });
    } catch (error) {
      console.error(
        "CAREER ANALYSIS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        error:
          "Unable to analyze career",

        details:
          error instanceof Error
            ? error.message
            : "Unknown career analysis error",
      });
    }
  }
);

// ======================================================
// ROADMAP GENERATION API
// ======================================================

app.post(
  "/api/generate-roadmap",
  async (req, res) => {
    try {
      const {
        career,
        durationMonths,
        profile = {},
        technicalSkills = {},
        softSkills = [],
        assessment = {},
        selectedCareer = {},
      } = req.body;

      const cleanCareer =
        career?.toString().trim() || "";

      const cleanDurationMonths =
        Math.round(
          Number(durationMonths)
        );

      // ==================================================
      // VALIDATE CAREER
      // ==================================================

      if (!cleanCareer) {
        return res.status(400).json({
          success: false,
          error: "Career is required",
        });
      }

      // ==================================================
      // VALIDATE DURATION
      // ==================================================

      if (
        !Number.isInteger(
          cleanDurationMonths
        ) ||
        cleanDurationMonths < 1 ||
        cleanDurationMonths > 120
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Roadmap duration must be between 1 and 120 months",
        });
      }

      // ==================================================
      // VALIDATE SELECTED CAREER
      // ==================================================

      const selectedCareerName =
        selectedCareer.career
          ?.toString()
          .trim() || "";

      if (
        selectedCareerName &&
        selectedCareerName.toLowerCase() !==
          cleanCareer.toLowerCase()
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Selected career does not match roadmap career",
        });
      }

      // ==================================================
      // CURRENT MATCH
      // ==================================================

      const currentMatchPercentage =
        Math.max(
          0,
          Math.min(
            100,
            Math.round(
              Number(
                selectedCareer
                  .careerReadiness ??
                selectedCareer
                  .matchPercentage
              ) || 0
            )
          )
        );

      const remainingPercentage =
        100 - currentMatchPercentage;

      // ==================================================
      // CAREER SKILLS
      // ==================================================

      let careerSkills = [];

      if (
        Array.isArray(
          selectedCareer.careerSkills
        )
      ) {
        careerSkills =
          selectedCareer.careerSkills
            .filter(
              (skillData) =>
                skillData &&
                typeof skillData ===
                  "object"
            )
            .map(
              (skillData) => {
                const currentProficiency =
                  Math.max(
                    0,
                    Math.min(
                      100,
                      Math.round(
                        Number(
                          skillData
                            .currentProficiency
                        ) || 0
                      )
                    )
                  );

                return {
                  skill:
                    skillData.skill
                      ?.toString()
                      .trim() || "",

                  weight:
                    Math.max(
                      0,
                      Number(
                        skillData.weight
                      ) || 0
                    ),

                  currentProficiency,

                  completed:
                    currentProficiency ===
                    100,
                };
              }
            )
            .filter(
              (skillData) =>
                skillData.skill
            );
      }

      // ==================================================
      // FALLBACK SKILLS TO IMPROVE
      // ==================================================

      if (
        careerSkills.length === 0 &&
        Array.isArray(
          selectedCareer.skillsToImprove
        )
      ) {
        careerSkills =
          selectedCareer.skillsToImprove
            .map(
              (skill) => ({
                skill:
                  skill
                    ?.toString()
                    .trim() || "",

                weight: 1,

                currentProficiency: 40,

                completed: false,
              })
            )
            .filter(
              (skillData) =>
                skillData.skill
            );
      }

      // ==================================================
      // ADD RECOMMENDED SKILLS
      // ==================================================

      const finalRecommendedSkills =
        Array.isArray(
          selectedCareer.recommendedSkills
        )
          ? selectedCareer
              .recommendedSkills
              .map(
                (skill) =>
                  skill
                    ?.toString()
                    .trim()
              )
              .filter(Boolean)
          : [];

      for (
        const skill
        of finalRecommendedSkills
      ) {
        const alreadyExists =
          careerSkills.some(
            (careerSkill) =>
              careerSkill.skill
                .toLowerCase() ===
              skill.toLowerCase()
          );

        if (!alreadyExists) {
          careerSkills.push({
            skill,
            weight: 1,
            currentProficiency: 0,
            completed: false,
          });
        }
      }

      // ==================================================
      // FINAL FALLBACK
      // ==================================================

      if (careerSkills.length === 0) {
        careerSkills = [
          {
            skill:
              `${cleanCareer} Fundamentals`,
            weight: 25,
            currentProficiency: 0,
            completed: false,
          },
          {
            skill:
              `${cleanCareer} Core Concepts`,
            weight: 25,
            currentProficiency: 0,
            completed: false,
          },
          {
            skill:
              `${cleanCareer} Practical Skills`,
            weight: 25,
            currentProficiency: 0,
            completed: false,
          },
          {
            skill:
              `${cleanCareer} Advanced Skills`,
            weight: 25,
            currentProficiency: 0,
            completed: false,
          },
        ];
      }

      // ==================================================
      // UNIQUE CAREER SKILLS
      // ==================================================

      const uniqueCareerSkills = [];

      for (
        const careerSkill
        of careerSkills
      ) {
        const alreadyExists =
          uniqueCareerSkills.some(
            (existingSkill) =>
              existingSkill.skill
                .toLowerCase() ===
              careerSkill.skill
                .toLowerCase()
          );

        if (!alreadyExists) {
          uniqueCareerSkills.push(
            careerSkill
          );
        }
      }

      careerSkills =
        uniqueCareerSkills;

      // ==================================================
      // REMAINING CAREER SKILLS
      // ==================================================

      const remainingCareerSkills =
        careerSkills.filter(
          (careerSkill) =>
            careerSkill
              .currentProficiency < 100
        );

      if (
        remainingCareerSkills.length === 0
      ) {
        return res.status(400).json({
          success: false,
          error:
            "All required career skills are already completed",
        });
      }

      console.log(
        "================================"
      );

      console.log(
        "ROADMAP GENERATION STARTED"
      );

      console.log(
        "CAREER:",
        cleanCareer
      );

      console.log(
        "DURATION:",
        cleanDurationMonths
      );

      console.log(
        "CURRENT MATCH:",
        currentMatchPercentage
      );

      console.log(
        "REMAINING PERCENTAGE:",
        remainingPercentage
      );

      console.log(
        "TOTAL CAREER SKILLS:",
        careerSkills.length
      );

      console.log(
        "REMAINING CAREER SKILLS:",
        remainingCareerSkills.map(
          (skillData) =>
            skillData.skill
        )
      );

      console.log(
        "================================"
      );

      // ==================================================
      // ROADMAP PROMPT
      // ==================================================

      const roadmapPrompt = `
You are FuturePath AI.

You are an expert personalized career roadmap architect.

Create a personalized career skill-gap roadmap.

==================================================
CAREER GOAL
==================================================

${cleanCareer}

==================================================
USER SELECTED DURATION
==================================================

${cleanDurationMonths} months

==================================================
CURRENT CAREER READINESS
==================================================

${currentMatchPercentage}%

==================================================
REMAINING CAREER GAP
==================================================

${remainingPercentage}%

The purpose of this roadmap is to help the student
close the remaining ${remainingPercentage}% career gap
and reach 100% career readiness.

==================================================
PROFILE
==================================================

${JSON.stringify(
  profile,
  null,
  2
)}

==================================================
TECHNICAL SKILLS
==================================================

${JSON.stringify(
  technicalSkills,
  null,
  2
)}

==================================================
SOFT SKILLS
==================================================

${JSON.stringify(
  softSkills,
  null,
  2
)}

==================================================
ASSESSMENT
==================================================

${JSON.stringify(
  assessment,
  null,
  2
)}

==================================================
ALL CAREER SKILLS
==================================================

${JSON.stringify(
  careerSkills,
  null,
  2
)}

==================================================
REMAINING CAREER SKILLS
==================================================

${JSON.stringify(
  remainingCareerSkills,
  null,
  2
)}

==================================================
CRITICAL FUTUREPATH ROADMAP OBJECTIVE
==================================================

The roadmap MUST cover EVERY skill from
REMAINING CAREER SKILLS.

No remaining career skill may be skipped.

The student must be able to complete this roadmap
and close the complete remaining career gap.

Do not create a generic beginner roadmap.

Do not unnecessarily teach skills already at
100 currentProficiency.

For currentProficiency 0:

Teach foundation,
intermediate concepts,
practical implementation,
and mastery topics.

For currentProficiency 1 to 40:

Strengthen foundations,
core concepts,
and practical implementation.

For currentProficiency 41 to 70:

Focus on intermediate concepts,
real-world implementation,
advanced practice,
and projects.

For currentProficiency 71 to 99:

Focus on advanced concepts,
mastery,
production usage,
and real-world projects.

==================================================
CAREER SKILL MAPPING RULE
==================================================

Every roadmap skill topic MUST contain:

topic
careerSkill

careerSkill MUST exactly match the "skill" value
of one object from REMAINING CAREER SKILLS.

Example:

{
  "topic": "Kubernetes Deployment Strategies",
  "careerSkill": "Kubernetes"
}

Do not rename careerSkill.

Do not abbreviate careerSkill.

Do not create new careerSkill names.

Do not create unrelated career skills.

A career skill may have multiple learning topics.

All topics required to master a career skill should
use the exact same careerSkill value.

==================================================
COMPLETE SKILL COVERAGE RULE
==================================================

Every skill in REMAINING CAREER SKILLS MUST appear
as careerSkill in at least one roadmap skill topic.

Before returning JSON, verify:

1. Read every REMAINING CAREER SKILL.
2. Find it in the roadmap.
3. Confirm at least one topic uses that exact careerSkill.
4. If a career skill is missing, add topics for it.
5. Return the roadmap only after all remaining career
   skills are covered.

==================================================
DURATION RULE
==================================================

The user selected exactly:

${cleanDurationMonths} months.

Generate exactly:

${cleanDurationMonths} roadmap months.

Use the complete duration.

Distribute all remaining career skills across the
selected duration.

If duration is long, divide a career skill into
foundation, intermediate, advanced, practical,
and mastery topics.

If duration is short, prioritize the most important
topics required to master every remaining career skill.

Do not skip any remaining career skill.

==================================================
ROADMAP RULES
==================================================

1. Generate exactly ${cleanDurationMonths} months.

2. monthNumber starts at 1.

3. monthNumber ends at ${cleanDurationMonths}.

4. Every month contains 3 to 5 skill topics.

5. Every month contains 3 to 5 actionable tasks.

6. Every month contains 1 to 2 practical projects.

7. Skill topics must be specific.

8. Tasks must be actionable.

9. Projects must be practical.

10. Do not add filler months.

11. Use the complete selected duration.

12. Cover all remaining career skills.

13. Return JSON only.

==================================================
OUTPUT
==================================================

Use exactly this structure:

{
  "career": "${cleanCareer}",
  "durationMonths": ${cleanDurationMonths},
  "months": [
    {
      "monthNumber": 1,
      "title": "Month title",
      "description": "Short learning objective",
      "skills": [
        {
          "topic": "Specific learning topic",
          "careerSkill": "Exact career skill name"
        }
      ],
      "tasks": [
        "Task 1",
        "Task 2",
        "Task 3"
      ],
      "projects": [
        "Project 1"
      ]
    }
  ]
}

The months array MUST contain exactly
${cleanDurationMonths} objects.

Return ONLY valid JSON.
`;

      // ==================================================
      // GEMINI REQUEST
      // ==================================================

      const roadmapRequestBody = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: roadmapPrompt,
              },
            ],
          },
        ],

        generationConfig: {
          responseMimeType:
            "application/json",

          temperature: 0.25,

          maxOutputTokens: 65536,
        },
      };

      // ==================================================
      // CALL GEMINI
      // ==================================================

      const geminiData =
        await callGeminiWithRetry(
          roadmapRequestBody,
          3
        );

      // ==================================================
      // GET RESPONSE
      // ==================================================

      const rawText =
        getGeminiResponseText(
          geminiData
        );

      if (!rawText) {
        console.error(
          "EMPTY ROADMAP RESPONSE:",
          JSON.stringify(
            geminiData,
            null,
            2
          )
        );

        throw new Error(
          "Gemini returned empty roadmap response"
        );
      }

      // ==================================================
      // PARSE ROADMAP
      // ==================================================

      let roadmap;

      try {
        roadmap =
          parseGeminiJson(
            rawText
          );
      } catch (error) {
        console.error(
          "ROADMAP JSON ERROR:",
          error
        );

        console.error(
          "RAW ROADMAP TEXT:",
          rawText
        );

        throw new Error(
          "Gemini returned invalid roadmap JSON"
        );
      }

      // ==================================================
      // VALIDATE ROADMAP
      // ==================================================

      if (
        !roadmap ||
        typeof roadmap !== "object"
      ) {
        throw new Error(
          "Invalid roadmap object"
        );
      }

      if (
        !Array.isArray(
          roadmap.months
        )
      ) {
        throw new Error(
          "Roadmap months not found"
        );
      }

      if (
        roadmap.months.length !==
        cleanDurationMonths
      ) {
        throw new Error(
          `Gemini returned ${roadmap.months.length} months instead of ${cleanDurationMonths}`
        );
      }

      // ==================================================
      // VALID CAREER SKILLS
      // ==================================================

      const validCareerSkills =
        new Map(
          remainingCareerSkills.map(
            (skillData) => [
              skillData.skill
                .toLowerCase(),

              skillData.skill,
            ]
          )
        );

      // ==================================================
      // CLEAN MONTHS
      // ==================================================

      roadmap.months =
        roadmap.months.map(
          (
            month,
            index
          ) => {
            const cleanSkills =
              Array.isArray(
                month.skills
              )
                ? month.skills
                    .map(
                      (skillData) => {
                        if (
                          !skillData ||
                          typeof skillData !==
                            "object"
                        ) {
                          return null;
                        }

                        const topic =
                          skillData.topic
                            ?.toString()
                            .trim() || "";

                        const rawCareerSkill =
                          skillData.careerSkill
                            ?.toString()
                            .trim() || "";

                        const careerSkill =
                          validCareerSkills.get(
                            rawCareerSkill
                              .toLowerCase()
                          );

                        if (
                          !topic ||
                          !careerSkill
                        ) {
                          return null;
                        }

                        return {
                          topic,
                          careerSkill,
                        };
                      }
                    )
                    .filter(Boolean)
                    .slice(0, 5)
                : [];

            return {
              monthNumber:
                index + 1,

              title:
                month.title
                  ?.toString()
                  .trim() ||
                `Month ${index + 1}`,

              description:
                month.description
                  ?.toString()
                  .trim() ||
                "Continue your career learning journey.",

              skills:
                cleanSkills,

              tasks:
                Array.isArray(
                  month.tasks
                )
                  ? month.tasks
                      .map(
                        (task) =>
                          task
                            ?.toString()
                            .trim()
                      )
                      .filter(Boolean)
                      .slice(0, 5)
                  : [],

              projects:
                Array.isArray(
                  month.projects
                )
                  ? month.projects
                      .map(
                        (project) =>
                          project
                            ?.toString()
                            .trim()
                      )
                      .filter(Boolean)
                      .slice(0, 2)
                  : [],

              completedSkills: [],

              completedTasks: [],

              completedProjects: [],
            };
          }
        );

      // ==================================================
      // CHECK CAREER SKILL COVERAGE
      // ==================================================

      const coveredCareerSkills =
        new Set();

      for (
        const month
        of roadmap.months
      ) {
        for (
          const skill
          of month.skills
        ) {
          coveredCareerSkills.add(
            skill.careerSkill
              .toLowerCase()
          );
        }
      }

      const missingCareerSkills =
        remainingCareerSkills.filter(
          (careerSkill) =>
            !coveredCareerSkills.has(
              careerSkill.skill
                .toLowerCase()
            )
        );

      console.log(
        "COVERED CAREER SKILLS:",
        Array.from(
          coveredCareerSkills
        )
      );

      console.log(
        "MISSING CAREER SKILLS:",
        missingCareerSkills.map(
          (skillData) =>
            skillData.skill
        )
      );

      // ==================================================
      // FORCE MISSING SKILLS INTO ROADMAP
      // ==================================================

      for (
        let index = 0;
        index <
        missingCareerSkills.length;
        index++
      ) {
        const missingSkill =
          missingCareerSkills[index];

        const targetMonthIndex =
          index %
          roadmap.months.length;

        const targetMonth =
          roadmap.months[
            targetMonthIndex
          ];

        const forcedTopic = {
          topic:
            `${missingSkill.skill} Mastery and Practical Implementation`,

          careerSkill:
            missingSkill.skill,
        };

        if (
          targetMonth.skills.length < 5
        ) {
          targetMonth.skills.push(
            forcedTopic
          );
        } else {
          targetMonth.skills[
            targetMonth.skills.length - 1
          ] = forcedTopic;
        }
      }

      // ==================================================
      // FINAL COVERAGE VALIDATION
      // ==================================================

      const finalCoveredCareerSkills =
        new Set();

      for (
        const month
        of roadmap.months
      ) {
        for (
          const skill
          of month.skills
        ) {
          finalCoveredCareerSkills.add(
            skill.careerSkill
              .toLowerCase()
          );
        }
      }

      const finalMissingSkills =
        remainingCareerSkills.filter(
          (careerSkill) =>
            !finalCoveredCareerSkills.has(
              careerSkill.skill
                .toLowerCase()
            )
        );

      if (
        finalMissingSkills.length > 0
      ) {
        throw new Error(
          `Roadmap does not cover career skills: ${finalMissingSkills
            .map(
              (skillData) =>
                skillData.skill
            )
            .join(", ")}`
        );
      }

      // ==================================================
      // FINAL ROADMAP
      // ==================================================

      roadmap.career =
        cleanCareer;

      roadmap.durationMonths =
        cleanDurationMonths;

      roadmap.sourceMatchPercentage =
        currentMatchPercentage;

      roadmap.remainingPercentage =
        remainingPercentage;

      roadmap.sourceCareerSkills =
        careerSkills;

      roadmap.remainingCareerSkills =
        remainingCareerSkills;

      roadmap.totalGapSkills =
        remainingCareerSkills.length;

      roadmap.generatedAt =
        new Date().toISOString();

      console.log(
        "================================"
      );

      console.log(
        "ROADMAP GENERATED:",
        roadmap.career
      );

      console.log(
        "ROADMAP MONTHS:",
        roadmap.months.length
      );

      console.log(
        "SOURCE MATCH:",
        roadmap.sourceMatchPercentage
      );

      console.log(
        "REMAINING GAP:",
        roadmap.remainingPercentage
      );

      console.log(
        "TOTAL GAP SKILLS:",
        roadmap.totalGapSkills
      );

      console.log(
        "ALL REMAINING SKILLS COVERED"
      );

      console.log(
        "================================"
      );

      return res.status(200).json({
        success: true,
        roadmap,
      });
    } catch (error) {
      console.error(
        "ROADMAP ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        error:
          "Unable to generate career roadmap",

        details:
          error instanceof Error
            ? error.message
            : "Unknown roadmap error",
      });
    }
  }
);

// ======================================================
// FUTUREPATH AI GUIDE CHAT API
// ======================================================

app.post(
  "/api/chat",
  async (req, res) => {
    try {
      const {
        message,
        profile = {},
        technicalSkills = {},
        softSkills = [],
        assessment = {},
        selectedCareer = {},
        aiAnalysis = {},
        chatHistory = [],
      } = req.body;

      const cleanMessage =
        message
          ?.toString()
          .trim();

      if (!cleanMessage) {
        return res.status(400).json({
          success: false,

          message:
            "Message is required",
        });
      }


      // ==================================================
      // SAFE CHAT HISTORY
      // ==================================================

      const safeChatHistory =
        Array.isArray(
          chatHistory
        )
          ? chatHistory
              .slice(-10)
              .map(
                (chat) => ({
                  role:
                    chat?.role
                      ?.toString() ||
                    "user",

                  message:
                    chat?.message
                      ?.toString() ||
                    "",
                })
              )
          : [];


      // ==================================================
      // AI GUIDE PROMPT
      // ==================================================

      const prompt = `
You are FuturePath AI Guide.

You are a friendly, intelligent and practical
AI career assistant inside FuturePath.

==================================================
PROFILE
==================================================

${JSON.stringify(
  profile,
  null,
  2
)}

==================================================
TECHNICAL SKILLS
==================================================

${JSON.stringify(
  technicalSkills,
  null,
  2
)}

==================================================
SOFT SKILLS
==================================================

${JSON.stringify(
  softSkills,
  null,
  2
)}

==================================================
ASSESSMENT
==================================================

${JSON.stringify(
  assessment,
  null,
  2
)}

==================================================
SELECTED CAREER
==================================================

${JSON.stringify(
  selectedCareer,
  null,
  2
)}

==================================================
AI CAREER ANALYSIS
==================================================

${JSON.stringify(
  aiAnalysis,
  null,
  2
)}

==================================================
RECENT CONVERSATION
==================================================

${JSON.stringify(
  safeChatHistory,
  null,
  2
)}

==================================================
STUDENT MESSAGE
==================================================

${cleanMessage}

==================================================
RULES
==================================================

Talk naturally.

Understand greetings and casual conversation.

Do not force career advice into every message.

For career questions, use the student's real data.

Never invent student skills.

If the student asks what skills to improve,
use selectedCareer.skillsToImprove.

If the student asks what to learn next,
use selectedCareer.recommendedSkills.

If the student asks how to increase career match,
use selectedCareer.careerSkills.

Explain incomplete career skills clearly.

For technical questions, explain clearly.

You may answer Flutter, Dart, Java, Python,
JavaScript, Firebase, APIs, databases,
cloud computing, AI and machine learning questions.

Be friendly, practical and conversational.

Do not say "As an AI language model".

Return ONLY valid JSON.

Use exactly:

{
  "answer": "Natural response",
  "suggestedQuestions": [
    "Question 1",
    "Question 2",
    "Question 3"
  ]
}

Return exactly 3 suggestedQuestions.
`;


      // ==================================================
      // GEMINI REQUEST
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

          temperature: 0.8,

          maxOutputTokens: 2048,
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
      // GET RESPONSE
      // ==================================================

      const rawText =
        getGeminiResponseText(
          geminiData
        );

      if (!rawText) {
        throw new Error(
          "Gemini returned empty chat response"
        );
      }


      // ==================================================
      // PARSE CHAT JSON
      // ==================================================

      let chatResult;

      try {
        chatResult =
          parseGeminiJson(
            rawText
          );
      } catch (error) {
        console.error(
          "CHAT JSON ERROR:",
          error
        );

        console.error(
          "RAW CHAT TEXT:",
          rawText
        );

        throw new Error(
          "Gemini returned invalid chat JSON"
        );
      }


      // ==================================================
      // CLEAN CHAT RESPONSE
      // ==================================================

      const answer =
        chatResult.answer
          ?.toString()
          .trim() ?? "";

      const suggestedQuestions =
        Array.isArray(
          chatResult.suggestedQuestions
        )
          ? chatResult
              .suggestedQuestions
              .map(
                (question) =>
                  question
                    ?.toString()
                    .trim()
              )
              .filter(Boolean)
              .slice(0, 3)
          : [];


      if (!answer) {
        throw new Error(
          "FuturePath AI returned empty answer"
        );
      }


      return res.status(200).json({
        success: true,

        answer,

        suggestedQuestions,
      });
    } catch (error) {
      console.error(
        "AI GUIDE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to get FuturePath AI response",

        details:
          error instanceof Error
            ? error.message
            : "Unknown AI Guide error",
      });
    }
  }
);


// ======================================================
// 404
// ======================================================

app.use((req, res) => {
  return res.status(404).json({
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
      "Career Analysis API: /api/analyze-career"
    );

    console.log(
      "Roadmap API: /api/generate-roadmap"
    );

    console.log(
      "AI Guide API: /api/chat"
    );

    console.log(
      "================================"
    );
  }
);