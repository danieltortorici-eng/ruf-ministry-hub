const DEFAULT_MODEL = "gpt-4.1-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_RAW_CONTENT_CHARS = 6000;
const MAX_CANDIDATE_PEOPLE = 80;
const LOW_CONFIDENCE_THRESHOLD = 0.72;
const ACTION_TYPES = [
  "meeting_note",
  "prayer_request",
  "follow_up_task",
  "person_note",
  "donor_update_idea",
  "teaching_idea"
];
const SENSITIVITY_LEVELS = ["normal", "sensitive", "highly_sensitive"];
const SHAREABLE_STATUSES = ["Private", "Anonymous Only", "Ask Permission", "Okay to Share"];
const BANNED_LABEL_PATTERNS = [
  /\bhealthy\b/gi,
  /\bproblem\b/gi,
  /\bhigh\s+risk\s+student\b/gi
];

const PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "detectedPersonName",
    "relatedPersonIdSuggestion",
    "confidence",
    "sensitivityLevel",
    "proposedActions",
    "privacyWarnings",
    "nextFaithfulStep"
  ],
  properties: {
    summary: { type: "string" },
    detectedPersonName: { type: "string" },
    relatedPersonIdSuggestion: { type: "string" },
    confidence: { type: "number" },
    sensitivityLevel: { type: "string", enum: SENSITIVITY_LEVELS },
    proposedActions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "title",
          "body",
          "date",
          "followUpDate",
          "shareableStatus",
          "requiresReview"
        ],
        properties: {
          type: { type: "string", enum: ACTION_TYPES },
          title: { type: "string" },
          body: { type: "string" },
          date: { type: "string" },
          followUpDate: { type: "string" },
          shareableStatus: { type: "string", enum: SHAREABLE_STATUSES },
          requiresReview: { type: "boolean" }
        }
      }
    },
    privacyWarnings: {
      type: "array",
      items: { type: "string" }
    },
    nextFaithfulStep: { type: "string" }
  }
};

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function safeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeText(value, maxLength = 2000) {
  let text = safeString(value, maxLength);
  BANNED_LABEL_PATTERNS.forEach(pattern => {
    text = text.replace(pattern, "").replace(/\s{2,}/g, " ").trim();
  });
  return text;
}

function sanitizeCandidatePeople(candidatePeople) {
  if (!Array.isArray(candidatePeople)) return [];
  return candidatePeople.slice(0, MAX_CANDIDATE_PEOPLE).map(person => ({
    id: safeString(person?.id, 120),
    name: safeString(person?.name, 160),
    personType: safeString(person?.personType, 80),
    fraternitySorority: safeString(person?.fraternitySorority, 80)
  })).filter(person => person.id && person.name);
}

async function readJson(request) {
  try {
    return { ok: true, value: await request.json() };
  } catch (error) {
    return { ok: false, response: json({ ok: false, error: "Invalid JSON body." }, 400) };
  }
}

function detectSensitivity(rawContent) {
  if (/\b(abuse|assault|self[- ]?harm|suicid|violence|addiction|overdose|pregnan|Title IX|medical diagnosis|therapy|counseling|depression|panic attack)\b/i.test(rawContent)) {
    return "highly_sensitive";
  }
  if (/\b(anxiety|family|mental health|health|sick|surgery|conflict|confidential|private|struggling|hard season)\b/i.test(rawContent)) {
    return "sensitive";
  }
  return "normal";
}

function bestPersonMatch(rawContent, candidatePeople) {
  const lower = rawContent.toLowerCase();
  let best = null;
  let confidence = 0;
  candidatePeople.forEach(person => {
    const name = person.name.toLowerCase();
    const first = name.split(/\s+/)[0] || "";
    let score = 0;
    if (name && lower.includes(name)) score = 0.94;
    else if (first && first.length > 2 && lower.includes(first)) score = 0.76;
    if (score > confidence) {
      best = person;
      confidence = score;
    }
  });
  return { person: best, confidence };
}

function inferFollowUpDate(rawContent, todayISO) {
  if (!todayISO || !/^\d{4}-\d{2}-\d{2}$/.test(todayISO)) return "";
  const base = new Date(todayISO + "T12:00:00Z");
  const addDays = days => {
    const next = new Date(base);
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString().slice(0, 10);
  };
  if (/\btomorrow\b/i.test(rawContent)) return addDays(1);
  if (/\bnext week\b/i.test(rawContent)) return addDays(7);
  if (/\bthis week\b/i.test(rawContent)) return addDays(3);
  if (/\bfollow up|check in|ask\b/i.test(rawContent)) return addDays(3);
  return "";
}

function makeAction(type, title, body, date, followUpDate, sensitivityLevel) {
  const privateStatus = sensitivityLevel === "normal" ? "Ask Permission" : "Private";
  return {
    type,
    title: sanitizeText(title, 160) || "Review Quick Grab",
    body: sanitizeText(body, 1800),
    date: safeString(date, 20),
    followUpDate: safeString(followUpDate, 20),
    shareableStatus: privateStatus,
    requiresReview: true
  };
}

function mockProposal(input) {
  const rawContent = input.rawContent;
  const today = input.todayISO || new Date().toISOString().slice(0, 10);
  const candidates = sanitizeCandidatePeople(input.candidatePeople);
  const match = bestPersonMatch(rawContent, candidates);
  const confidence = match.person ? match.confidence : 0.38;
  const sensitivityLevel = detectSensitivity(rawContent);
  const followUpDate = inferFollowUpDate(rawContent, today);
  const hasPrayer = /\bpray|prayer|wisdom|sick|surgery|anxiety|hard season|family\b/i.test(rawContent);
  const hasMeeting = /\bmet|coffee|lunch|talked|meeting|called|sat down\b/i.test(rawContent);
  const hasFollowUp = Boolean(followUpDate) || /\bfollow up|check in|ask|remind\b/i.test(rawContent);
  const hasTeaching = /\bsermon|lesson|illustration|teaching|bible study|talk\b/i.test(rawContent);
  const hasDonor = /\bdonor|supporter|alumni|support update\b/i.test(rawContent) && sensitivityLevel === "normal";
  const actions = [];

  if (hasMeeting) {
    actions.push(makeAction(
      "meeting_note",
      "Meeting note from Quick Grab",
      rawContent,
      today,
      followUpDate,
      sensitivityLevel
    ));
  }
  if (hasPrayer) {
    actions.push(makeAction(
      "prayer_request",
      "Prayer request to review",
      rawContent,
      today,
      followUpDate,
      sensitivityLevel
    ));
  }
  if (hasFollowUp) {
    actions.push(makeAction(
      "follow_up_task",
      "Follow up from Quick Grab",
      rawContent.replace(/\s+/g, " ").slice(0, 180),
      "",
      followUpDate,
      sensitivityLevel
    ));
  }
  if (hasTeaching) {
    actions.push(makeAction("teaching_idea", "Teaching idea", rawContent, today, "", "normal"));
  }
  if (hasDonor) {
    actions.push(makeAction("donor_update_idea", "Donor update idea", rawContent, today, "", "normal"));
  }
  if (!actions.length) {
    actions.push(makeAction("person_note", "Person note from Quick Grab", rawContent, today, followUpDate, sensitivityLevel));
  }

  const privacyWarnings = [];
  if (confidence > 0 && confidence < LOW_CONFIDENCE_THRESHOLD) privacyWarnings.push("Low confidence person match. Confirm before attaching this to a profile.");
  if (sensitivityLevel !== "normal") privacyWarnings.push("Sensitive content. Review carefully and keep only what is needed.");
  if (/\bdonor|supporter|alumni|support update\b/i.test(rawContent) && sensitivityLevel !== "normal") {
    privacyWarnings.push("Do not turn sensitive student details into donor-facing content unless anonymized.");
  }

  return normalizeProposal({
    summary: rawContent.length > 180 ? rawContent.slice(0, 177) + "..." : rawContent,
    detectedPersonName: match.person?.name || "",
    relatedPersonIdSuggestion: confidence >= LOW_CONFIDENCE_THRESHOLD ? match.person?.id || "" : "",
    confidence,
    sensitivityLevel,
    proposedActions: actions,
    privacyWarnings,
    nextFaithfulStep: "Review the proposal, confirm the person if needed, then choose what to save."
  });
}

function normalizeProposal(proposal) {
  const sensitivityLevel = SENSITIVITY_LEVELS.includes(proposal?.sensitivityLevel) ? proposal.sensitivityLevel : "sensitive";
  const confidence = Math.max(0, Math.min(1, Number(proposal?.confidence) || 0));
  const warnings = Array.isArray(proposal?.privacyWarnings)
    ? proposal.privacyWarnings.map(warning => sanitizeText(warning, 240)).filter(Boolean)
    : [];

  if (confidence > 0 && confidence < LOW_CONFIDENCE_THRESHOLD && !warnings.some(warning => /low confidence/i.test(warning))) {
    warnings.push("Low confidence person match. Confirm before attaching this to a profile.");
  }
  if (sensitivityLevel !== "normal" && !warnings.some(warning => /sensitive/i.test(warning))) {
    warnings.push("Sensitive content. Review carefully and keep only what is needed.");
  }

  const actions = Array.isArray(proposal?.proposedActions) ? proposal.proposedActions : [];
  return {
    summary: sanitizeText(proposal?.summary, 800),
    detectedPersonName: sanitizeText(proposal?.detectedPersonName, 160),
    relatedPersonIdSuggestion: confidence >= LOW_CONFIDENCE_THRESHOLD ? safeString(proposal?.relatedPersonIdSuggestion, 120) : "",
    confidence,
    sensitivityLevel,
    proposedActions: actions.slice(0, 6).map(action => ({
      type: ACTION_TYPES.includes(action?.type) ? action.type : "person_note",
      title: sanitizeText(action?.title, 160) || "Review Quick Grab",
      body: sanitizeText(action?.body, 1800),
      date: safeString(action?.date, 20),
      followUpDate: safeString(action?.followUpDate, 20),
      shareableStatus: SHAREABLE_STATUSES.includes(action?.shareableStatus) ? action.shareableStatus : (sensitivityLevel === "normal" ? "Ask Permission" : "Private"),
      requiresReview: true
    })).filter(action => action.body),
    privacyWarnings: warnings,
    nextFaithfulStep: sanitizeText(proposal?.nextFaithfulStep, 300) || "Review before saving anything."
  };
}

function extractOutputText(responseJson) {
  if (typeof responseJson.output_text === "string") return responseJson.output_text;
  const chunks = [];
  if (Array.isArray(responseJson.output)) {
    responseJson.output.forEach(item => {
      if (Array.isArray(item.content)) {
        item.content.forEach(content => {
          if (typeof content.text === "string") chunks.push(content.text);
        });
      }
    });
  }
  return chunks.join("").trim();
}

async function callOpenAI(env, input) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || DEFAULT_MODEL,
      store: false,
      temperature: 0.2,
      max_output_tokens: 1400,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You sort a local-first RUF ministry Quick Grab into a review-only proposal.",
                "Never write records. Never imply records are saved. Daniel must approve first.",
                "Use only the provided raw content and candidate people list. Do not infer from missing database context.",
                "Low confidence person matches require user confirmation; leave relatedPersonIdSuggestion empty unless confidence is at least 0.72.",
                "Sensitive or highly sensitive content requires review and should default to Private.",
                "Do not use spiritual labels such as healthy, problem, or high risk student.",
                "Do not generate donor-facing content from sensitive student data unless anonymized.",
                "Keep wording concise, pastoral, and factual."
              ].join(" ")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                rawContent: input.rawContent,
                candidatePeople: input.candidatePeople,
                todayISO: input.todayISO,
                contextMode: input.contextMode || "quick_grab"
              })
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "quick_grab_proposal",
          strict: true,
          schema: PROPOSAL_SCHEMA
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`);
  }

  const responseJson = await response.json();
  const outputText = extractOutputText(responseJson);
  if (!outputText) throw new Error("OpenAI response did not include output text.");
  return normalizeProposal(JSON.parse(outputText));
}

export async function onRequestPost({ request, env = {} }) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.value || {};
  const rawContent = safeString(body.rawContent, MAX_RAW_CONTENT_CHARS);
  if (!rawContent) return json({ ok: false, error: "rawContent is required." }, 400);

  const input = {
    rawContent,
    candidatePeople: sanitizeCandidatePeople(body.candidatePeople),
    todayISO: safeString(body.todayISO, 20),
    contextMode: safeString(body.contextMode, 80) || "quick_grab"
  };

  try {
    const shouldMock = env.AI_MOCK_MODE === "true" || !env.OPENAI_API_KEY;
    const proposal = shouldMock ? mockProposal(input) : await callOpenAI(env, input);
    return json({ ok: true, proposal });
  } catch (error) {
    console.error("Quick Grab AI failed", error);
    return json({ ok: false, error: "AI proposal failed. Sort this Quick Grab manually for now." }, 502);
  }
}

export async function onRequestGet() {
  return json({ ok: false, error: "Use POST for Quick Grab AI proposals." }, 405);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
