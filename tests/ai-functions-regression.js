const fs = require("fs");
const path = require("path");
const vm = require("vm");
const nodeCrypto = require("crypto");

const repoRoot = path.resolve(__dirname, "..");
const appDir = path.resolve(repoRoot, "ruf-ministry-hub-deploy-working");
const aiActionApprovalDistPath = path.resolve(repoRoot, "dist", "ruf-ministry-hub.html");

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function loadPagesFunction(relativePath, overrides = {}) {
  const filePath = path.resolve(appDir, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  const exportNames = Array.from(source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)).map(match => match[1]);
  const runnable = source.replace(/export\s+/g, "");
  const context = {
    console,
    Request,
    Response,
    fetch: overrides.fetch || (() => {
      throw new Error("Unexpected network call during regression test.");
    })
  };
  vm.createContext(context);
  vm.runInContext(`${runnable}\nglobalThis.__exports = { ${exportNames.join(", ")} };`, context, { filename: filePath });
  return context.__exports;
}

async function jsonFrom(response) {
  return response.json();
}

async function testHealthEndpoint() {
  const health = loadPagesFunction("functions/api/ai/health.js");

  const mockResponse = await health.onRequestGet({ env: { AI_MOCK_MODE: "true" } });
  const mock = await jsonFrom(mockResponse);
  assert(mockResponse.status === 200, "health endpoint returns 200");
  assert(mock.ok === true && mock.usesFunctions === true, "health endpoint reports Pages Functions");
  assert(mock.mockMode === true, "health endpoint reports mock mode");
  assert(mock.hasOpenAIKey === false, "health endpoint reports missing key");
  assert(mock.model === "gpt-4.1-mini", "health endpoint reports default model");

  const realResponse = await health.onRequestGet({
    env: {
      AI_MOCK_MODE: "false",
      OPENAI_MODEL: "gpt-4.1-mini",
      OPENAI_API_KEY: "runtime-secret-present"
    }
  });
  const real = await jsonFrom(realResponse);
  assert(real.mockMode === false, "health endpoint reports real mode");
  assert(real.hasOpenAIKey === true, "health endpoint sees runtime secret presence");
  assert(real.model === "gpt-4.1-mini", "health endpoint respects configured model");
}

async function testQuickGrabMockMode() {
  const quickGrab = loadPagesFunction("functions/api/ai/quick-grab.js");
  const request = new Request("https://example.test/api/ai/quick-grab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawContent: "Coffee with Jonah. Pray for wisdom with summer plans. Check in tomorrow.",
      candidatePeople: [
        { id: "person_j", name: "Jonah Reed", personType: "Student", fraternitySorority: "SAE" }
      ],
      todayISO: "2026-07-07",
      contextMode: "quick_grab"
    })
  });

  const response = await quickGrab.onRequestPost({ request, env: { AI_MOCK_MODE: "true" } });
  const body = await jsonFrom(response);
  assert(response.status === 200, "quick-grab mock endpoint returns 200");
  assert(body.ok === true && body.proposal, "quick-grab mock endpoint returns a proposal");
  assert(body.proposal.relatedPersonIdSuggestion === "person_j", "quick-grab mock suggests a high-confidence person");
  assert(body.proposal.proposedActions.some(action => action.type === "prayer_request"), "quick-grab mock proposes prayer action");
  assert(body.proposal.proposedActions.every(action => action.requiresReview === true), "quick-grab mock actions require review");
}

async function testQuickGrabRealModeUsesOpenAiFetch() {
  let fetchCalled = false;
  const quickGrab = loadPagesFunction("functions/api/ai/quick-grab.js", {
    fetch: async (url, init) => {
      fetchCalled = true;
      assert(url === "https://api.openai.com/v1/responses", "quick-grab real mode calls Responses API");
      const requestBody = JSON.parse(init.body);
      assert(requestBody.model === "gpt-4.1-mini", "quick-grab real mode uses OPENAI_MODEL");
      assert(requestBody.store === false, "quick-grab real mode does not store response state");
      assert(init.headers.Authorization === "Bearer runtime-secret-present", "quick-grab real mode uses runtime secret in server fetch");
      return Response.json({
        output_text: JSON.stringify({
          summary: "Review Jonah follow-up and prayer.",
          detectedPersonName: "Jonah Reed",
          relatedPersonIdSuggestion: "person_j",
          confidence: 0.91,
          sensitivityLevel: "sensitive",
          proposedActions: [
            {
              type: "prayer_request",
              title: "Prayer request to review",
              body: "Pray for wisdom with summer plans.",
              date: "2026-07-07",
              followUpDate: "2026-07-08",
              shareableStatus: "Private",
              requiresReview: true
            }
          ],
          privacyWarnings: ["Sensitive content. Review carefully."],
          nextFaithfulStep: "Review before saving."
        })
      });
    }
  });
  const request = new Request("https://example.test/api/ai/quick-grab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawContent: "Coffee with Jonah. Pray for wisdom with summer plans.",
      candidatePeople: [
        { id: "person_j", name: "Jonah Reed", personType: "Student", fraternitySorority: "SAE" }
      ],
      todayISO: "2026-07-07",
      contextMode: "quick_grab"
    })
  });
  const response = await quickGrab.onRequestPost({
    request,
    env: {
      AI_MOCK_MODE: "false",
      OPENAI_MODEL: "gpt-4.1-mini",
      OPENAI_API_KEY: "runtime-secret-present"
    }
  });
  const body = await jsonFrom(response);
  assert(response.status === 200 && body.ok === true, "quick-grab real mode returns proposal from OpenAI path");
  assert(fetchCalled === true, "quick-grab real mode made the server-side fetch");
}

async function testQuickGrabMissingKeyFallsBackToMock() {
  const quickGrab = loadPagesFunction("functions/api/ai/quick-grab.js");
  const request = new Request("https://example.test/api/ai/quick-grab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawContent: "Coffee with Jonah. Pray for wisdom with summer plans.",
      candidatePeople: [
        { id: "person_j", name: "Jonah Reed", personType: "Student", fraternitySorority: "SAE" }
      ],
      todayISO: "2026-07-07",
      contextMode: "quick_grab"
    })
  });
  const response = await quickGrab.onRequestPost({ request, env: { AI_MOCK_MODE: "false" } });
  const body = await jsonFrom(response);
  assert(response.status === 200 && body.ok === true, "quick-grab missing key returns mock proposal safely");
  assert(body.proposal.proposedActions.every(action => action.requiresReview === true), "quick-grab missing key mock still requires review");
}

async function testQuickGrabValidation() {
  const quickGrab = loadPagesFunction("functions/api/ai/quick-grab.js");
  const missingRequest = new Request("https://example.test/api/ai/quick-grab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidatePeople: [] })
  });
  const missingResponse = await quickGrab.onRequestPost({ request: missingRequest, env: { AI_MOCK_MODE: "true" } });
  assert(missingResponse.status === 400, "quick-grab rejects missing rawContent");

  const invalidRequest = new Request("https://example.test/api/ai/quick-grab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not valid"
  });
  const invalidResponse = await quickGrab.onRequestPost({ request: invalidRequest, env: { AI_MOCK_MODE: "true" } });
  assert(invalidResponse.status === 400, "quick-grab rejects invalid JSON");
}

function frontendFiles() {
  return [
    "index.html",
    "ruf-ministry-hub.html",
    "ruf-ministry-hub-sw.js",
    "ruf-ministry-hub.webmanifest"
  ].map(file => path.resolve(appDir, file));
}

function testNoApiKeyInFrontendOrRepo() {
  frontendFiles().forEach(file => {
    const source = fs.readFileSync(file, "utf8");
    assert(!source.includes("OPENAI_API_KEY"), `${path.basename(file)} does not reference server secret name`);
  });

  const textExtensions = new Set([".html", ".js", ".json", ".md", ".txt", ".webmanifest"]);
  const keyPattern = /\bsk-(?:proj|svcacct|admin)?-[A-Za-z0-9_-]{20,}\b/;
  const stack = [repoRoot];
  while (stack.length) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      if ([".git", "node_modules"].includes(path.basename(current))) continue;
      fs.readdirSync(current).forEach(child => stack.push(path.join(current, child)));
      continue;
    }
    if (!textExtensions.has(path.extname(current))) continue;
    const source = fs.readFileSync(current, "utf8");
    assert(!keyPattern.test(source), `${path.relative(repoRoot, current)} contains no OpenAI key material`);
  }
}

function testRootAndDeployFunctionCopiesMatch() {
  [
    "functions/api/ai/health.js",
    "functions/api/ai/quick-grab.js"
  ].forEach(relativePath => {
    const rootSource = fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");
    const deploySource = fs.readFileSync(path.resolve(appDir, relativePath), "utf8");
    assert(rootSource === deploySource, `${relativePath} matches deploy-root function copy`);
  });
}

function makeAppSandbox(options = {}) {
  const htmlPath = options.htmlPath || path.resolve(appDir, "ruf-ministry-hub.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) throw new Error("Could not find app script.");
  const storage = Object.create(null);
  const elements = Object.create(null);

  function makeElement(idOrTag) {
    const key = String(idOrTag || "element");
    if (elements[key]) return elements[key];
    const el = {
      id: key,
      tagName: key.includes("summary") || key.includes("remember") || key.includes("prayer") ? "TEXTAREA" : "INPUT",
      value: "",
      textContent: "",
      dataset: {},
      style: {},
      children: [],
      checked: false,
      type: "text",
      classList: {
        add() {},
        remove() {},
        toggle() {},
        contains() { return false; }
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      remove() {},
      addEventListener() {},
      focus() {},
      setSelectionRange() {},
      click() {},
      get innerHTML() {
        return this._innerHTML || "";
      },
      set innerHTML(value) {
        this._innerHTML = String(value || "");
      }
    };
    elements[key] = el;
    return el;
  }

  const sandbox = {
    console,
    URLSearchParams,
    Blob,
    TextEncoder,
    TextDecoder,
    btoa(value) {
      return Buffer.from(String(value), "binary").toString("base64");
    },
    atob(value) {
      return Buffer.from(String(value), "base64").toString("binary");
    },
    crypto: nodeCrypto.webcrypto,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
      },
      setItem(key, value) {
        storage[key] = String(value);
      },
      removeItem(key) {
        delete storage[key];
      }
    },
    navigator: {
      serviceWorker: null,
      clipboard: { writeText: () => Promise.resolve() }
    },
    document: {
      body: makeElement("body"),
      activeElement: null,
      getElementById: makeElement,
      createElement(tag) {
        return makeElement(`created-${tag}-${Math.random().toString(36).slice(2)}`);
      },
      addEventListener() {},
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      }
    },
    indexedDB: undefined,
    Notification: undefined,
    FileReader: function FileReader() {},
    Image: function Image() {},
    URL: {
      createObjectURL() {
        return "blob:ai-regression";
      },
      revokeObjectURL() {}
    }
  };
  sandbox.window = {
    location: {
      protocol: "https:",
      hostname: "example.test",
      href: "https://example.test/ruf-ministry-hub.html",
      pathname: "/ruf-ministry-hub.html",
      search: "",
      hash: ""
    },
    navigator: sandbox.navigator,
    URL: sandbox.URL,
    history: { replaceState() {} },
    addEventListener() {},
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) { callback(); },
    matchMedia() { return { matches: false }; },
    confirm() { return true; },
    prompt() { return null; }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(scriptMatch[1], sandbox, { filename: htmlPath });
  return { sandbox, elements };
}

function makeAiApprovalHarness({ people = [], rawContent = "Coffee with Mara Thompson. Pray for wisdom. Check in tomorrow." } = {}) {
  const { sandbox, elements } = makeAppSandbox();
  function appEval(code) {
    return vm.runInContext(code, sandbox);
  }
  function makeElement(id) {
    return sandbox.document.getElementById(id);
  }

  sandbox.__setupPeople = people;
  sandbox.__rawContent = rawContent;
  const ids = appEval(`
    settings = normalizeSettings({ ...DEFAULT_SETTINGS, enableAutoSave: false, enableUndo: true });
    db = emptyData();
    const peopleByKey = {};
    (__setupPeople || []).forEach((input, index) => {
      const person = createPerson(input.name, input.phone || "");
      person.fraternitySorority = input.fraternitySorority || "";
      peopleByKey[input.key || ("person" + index)] = person.id;
    });
    const grab = makeQuickGrab(__rawContent, ["People", "Prayer"], "Soon");
    db.quickGrabs.unshift(grab);
    view = {
      screen: "process",
      personId: null,
      quickGrabId: grab.id,
      processPreset: [],
      prayerFilter: "Active",
      search: "",
      quickGrabDraftText: "",
      globalSearch: "",
      focusMode: true,
      locked: false,
      encryptionLocked: false,
      reviewIndex: 0,
      expandedQuickGrabIds: [],
      expandedPrayerIds: [],
      aiQuickGrabState: null,
      aiHealthResult: null,
      sheet: null
    };
    ({ grabId: grab.id, peopleByKey });
  `);

  [
    "action-note",
    "action-meeting",
    "action-prayer",
    "action-followup",
    "action-person",
    "action-donor",
    "action-teaching",
    "action-keep",
    "action-sensitive",
    "duplicate-confirm",
    "update-last",
    "update-next"
  ].forEach(id => {
    makeElement(id).checked = false;
  });
  ["person-select", "new-person-name", "new-person-phone", "meeting-date", "meeting-type", "meeting-summary", "what-to-remember", "prayer-text", "followup-task", "followup-date", "shareable-status", "duplicate-warning", "new-person-fields", "person-required-notice", "person-resolution-section", "ai-person-suggestion"].forEach(id => {
    makeElement(id).value = "";
  });
  makeElement("new-person-fields").style.display = "none";
  makeElement("person-required-notice").style.display = "none";
  makeElement("meeting-type").value = "Student";
  makeElement("shareable-status").value = "Ask Permission";
  makeElement("update-last").checked = true;
  makeElement("update-next").checked = true;

  return { sandbox, elements, ids, appEval, makeElement };
}

function proposalForPerson(name, relatedPersonIdSuggestion = "") {
  return {
    summary: `Coffee with ${name} included a prayer request and a follow-up.`,
    detectedPersonName: name,
    relatedPersonIdSuggestion,
    confidence: 0.93,
    sensitivityLevel: "sensitive",
    proposedActions: [
      {
        type: "prayer_request",
        title: "Prayer request to review",
        body: "Pray for wisdom with summer plans.",
        date: "2026-07-07",
        followUpDate: "2026-07-08",
        shareableStatus: "Private",
        requiresReview: true
      },
      {
        type: "follow_up_task",
        title: `Check in with ${name}`,
        body: "Check in tomorrow about summer plans.",
        date: "",
        followUpDate: "2026-07-08",
        shareableStatus: "Private",
        requiresReview: true
      }
    ],
    privacyWarnings: ["Sensitive content. Review carefully."],
    nextFaithfulStep: "Review before saving."
  };
}

function recordSnapshot(appEval) {
  return appEval(`({
    people: db.people.map(person => ({ id: person.id, name: person.name })),
    notes: db.notes.map(note => ({ id: note.id, relatedPersonId: note.relatedPersonId })),
    meetings: db.meetingNotes.map(meeting => ({ id: meeting.id, relatedPersonId: meeting.relatedPersonId })),
    prayers: db.prayerRequests.map(prayer => ({ id: prayer.id, relatedPersonId: prayer.relatedPersonId })),
    tasks: db.tasks.map(task => ({ id: task.id, relatedPersonId: task.relatedPersonId })),
    status: db.quickGrabs[0]?.status || ""
  })`);
}

function applyProposal(harness, proposal) {
  harness.sandbox.__proposal = proposal;
  return harness.appEval(`applyAiProposalToProcessingForm("${harness.ids.grabId}", __proposal)`);
}

function saveProposal(harness) {
  harness.appEval(`saveProcessedQuickGrab("${harness.ids.grabId}")`);
}

function testAiProposalRequiresApprovalBeforeSaving() {
  const harness = makeAiApprovalHarness({
    people: [{ key: "jonah", name: "Jonah Reed", fraternitySorority: "SAE" }],
    rawContent: "Coffee with Jonah. Pray for wisdom with summer plans. Check in tomorrow."
  });
  const { elements, ids, appEval } = harness;
  const personId = ids.peopleByKey.jonah;
  const proposal = proposalForPerson("Jonah Reed", personId);

  const before = recordSnapshot(appEval);
  const applied = applyProposal(harness, proposal);
  const after = recordSnapshot(appEval);

  assert(applied === true, "AI proposal can be copied into the review form");
  assert(JSON.stringify(after) === JSON.stringify(before), "AI proposal does not save records before approval");
  assert(elements["action-prayer"].checked === true, "AI proposal checks suggested prayer action");
  assert(elements["person-select"].value === personId, "AI proposal can suggest a person in the form");
}

function testAiMissingPersonBlocksUntilChosenOrCreated() {
  const harness = makeAiApprovalHarness({
    rawContent: "Coffee with Mara Thompson. Pray for wisdom with summer plans. Check in tomorrow."
  });
  const proposal = proposalForPerson("Mara Thompson", "");
  const before = recordSnapshot(harness.appEval);

  const applied = applyProposal(harness, proposal);
  saveProposal(harness);
  const after = recordSnapshot(harness.appEval);

  assert(applied === true, "AI proposal with unmatched person can be copied into the review form");
  assert(harness.elements["person-select"].value === "", "unmatched proposal does not silently choose a person");
  assert(harness.elements["new-person-name"].value === "Mara Thompson", "unmatched proposal prepares the detected create-person name");
  assert(harness.elements["person-required-notice"].style.display === "block", "missing person blocks save until user chooses or creates a person");
  assert(JSON.stringify(after) === JSON.stringify(before), "blocked missing-person save creates no records");
}

function testAiExistingPersonSelectionLinksRecords() {
  const harness = makeAiApprovalHarness({
    people: [{ key: "mara", name: "Mara Thompson" }],
    rawContent: "Coffee with Mara Thompson. Pray for wisdom with summer plans. Check in tomorrow."
  });
  const personId = harness.ids.peopleByKey.mara;
  const proposal = proposalForPerson("Mara Thompson", "");

  applyProposal(harness, proposal);
  harness.makeElement("person-select").value = personId;
  harness.appEval("updateNewPersonFields()");
  saveProposal(harness);
  const after = recordSnapshot(harness.appEval);

  assert(after.people.length === 1, "existing person selection does not create another person");
  assert(after.prayers.length === 1 && after.prayers[0].relatedPersonId === personId, "existing person selection links prayer record");
  assert(after.tasks.length === 1 && after.tasks[0].relatedPersonId === personId, "existing person selection links follow-up task");
}

function testAiCreateNewPersonLinksRecords() {
  const harness = makeAiApprovalHarness({
    rawContent: "Coffee with Mara Thompson. Pray for wisdom with summer plans. Check in tomorrow."
  });
  const proposal = proposalForPerson("Mara Thompson", "");

  applyProposal(harness, proposal);
  harness.makeElement("person-select").value = "new";
  harness.appEval("updateNewPersonFields()");
  saveProposal(harness);
  const after = recordSnapshot(harness.appEval);
  const createdPerson = after.people.find(person => person.name === "Mara Thompson");

  assert(Boolean(createdPerson), "create-new-person approval creates the local person");
  assert(after.prayers.length === 1 && after.prayers[0].relatedPersonId === createdPerson.id, "create-new-person approval links prayer record");
  assert(after.tasks.length === 1 && after.tasks[0].relatedPersonId === createdPerson.id, "create-new-person approval links follow-up task");
}

function testAiCancelCreatesNothing() {
  const harness = makeAiApprovalHarness({
    rawContent: "Coffee with Mara Thompson. Pray for wisdom with summer plans. Check in tomorrow."
  });
  const proposal = proposalForPerson("Mara Thompson", "");

  applyProposal(harness, proposal);
  harness.sandbox.__cancelButton = {
    dataset: { action: "nav", screen: "quick" },
    classList: { contains() { return false; } }
  };
  harness.appEval("handleAction({ currentTarget: __cancelButton, target: __cancelButton })");
  const after = recordSnapshot(harness.appEval);

  assert(after.people.length === 0, "canceling AI approval creates no person");
  assert(after.prayers.length === 0 && after.tasks.length === 0 && after.meetings.length === 0 && after.notes.length === 0, "canceling AI approval creates no linked records");
}

function testAiMatchedPersonFlowStillSaves() {
  const harness = makeAiApprovalHarness({
    people: [{ key: "jonah", name: "Jonah Miller" }],
    rawContent: "Coffee with Jonah Miller. Pray for wisdom with summer plans. Check in tomorrow."
  });
  const personId = harness.ids.peopleByKey.jonah;
  const proposal = proposalForPerson("Jonah Miller", personId);

  applyProposal(harness, proposal);
  saveProposal(harness);
  const after = recordSnapshot(harness.appEval);

  assert(harness.elements["person-select"].value === personId, "matched Jonah Miller proposal keeps existing person selected");
  assert(after.people.length === 1, "matched Jonah Miller flow does not create a duplicate person");
  assert(after.prayers.length === 1 && after.prayers[0].relatedPersonId === personId, "matched Jonah Miller flow links prayer record");
  assert(after.tasks.length === 1 && after.tasks[0].relatedPersonId === personId, "matched Jonah Miller flow links follow-up task");
}

function makeAiActionApprovalHarness() {
  const { sandbox, elements } = makeAppSandbox({ htmlPath: aiActionApprovalDistPath });
  function appEval(code) {
    return vm.runInContext(code, sandbox);
  }
  function makeElement(id) {
    return sandbox.document.getElementById(id);
  }
  appEval(`
    settings = normalizeSettings({ ...DEFAULT_SETTINGS, aiMockMode: true, askBeforeAiEveryTime: false, enableAutoSave: false, enableUndo: true });
    db = emptyData();
    view = {
      ...view,
      screen: "aiReview",
      aiReviewFilter: "Pending",
      aiReviewFocusId: "",
      sheet: null
    };
  `);
  return { sandbox, elements, appEval, makeElement };
}

function setupActionApprovalProposal(harness, { personName = "Jonah Miller", relatedPersonId = "", includePerson = false } = {}) {
  harness.sandbox.__setup = { personName, relatedPersonId, includePerson };
  return harness.appEval(`
    let existingPersonId = __setup.relatedPersonId || "";
    if (__setup.includePerson && !existingPersonId) {
      existingPersonId = createPerson(__setup.personName, "").id;
    }
    const proposal = emptyAiProposal({
      id: uid("proposal"),
      status: "pending",
      title: "AI proposal for " + __setup.personName,
      summary: "Review prayer, follow-up, and meeting notes for " + __setup.personName + ".",
      confidence: "high",
      sensitivityRisk: "medium",
      result: {
        possiblePersonName: __setup.personName,
        possiblePersonId: existingPersonId
      },
      proposedActions: [
        {
          id: "act-prayer",
          actionType: "createPrayerRequest",
          request: "Pray for wisdom with summer plans.",
          followUpDate: "2026-07-08",
          relatedPersonId: existingPersonId
        },
        {
          id: "act-task",
          actionType: "createFollowUpTask",
          title: "Check in with " + __setup.personName,
          dueDate: "2026-07-08",
          relatedPersonId: existingPersonId
        },
        {
          id: "act-meeting",
          actionType: "createMeetingNote",
          summary: "Coffee conversation with " + __setup.personName,
          meetingDate: "2026-07-07",
          relatedPersonId: existingPersonId
        }
      ]
    });
    db.aiProposals.unshift(proposal);
    ({ proposalId: proposal.id, personId: existingPersonId });
  `);
}

function actionApprovalSnapshot(harness, proposalId) {
  harness.sandbox.__proposalId = proposalId;
  return harness.appEval(`(() => {
    const proposal = aiProposalById(__proposalId);
    return {
      status: proposal?.status || "",
      savedAt: proposal?.savedAt || "",
      approvedAt: proposal?.approvedAt || "",
      updatedAt: proposal?.updatedAt || "",
      selectedActionIds: proposal?.selectedActionIds || [],
      skippedActionIds: proposal?.skippedActionIds || [],
      createdRecordIds: proposal?.createdRecordIds || [],
      createdPersonId: proposal?.createdPersonId || "",
      pending: proposal ? aiProposalFilterMatches(proposal, "Pending") : false,
      approved: proposal ? aiProposalFilterMatches(proposal, "Approved") : false,
      people: db.people.map(person => ({ id: person.id, name: person.name })),
      prayers: db.prayerRequests.map(prayer => ({ id: prayer.id, relatedPersonId: prayer.relatedPersonId })),
      tasks: db.tasks.map(task => ({ id: task.id, relatedPersonId: task.relatedPersonId })),
      meetings: db.meetingNotes.map(meeting => ({ id: meeting.id, relatedPersonId: meeting.relatedPersonId })),
      sheetOpen: Boolean(view.sheet),
      confirmOpen: view.screen === "aiConfirmActions" && Boolean(view.aiConfirmProposalId),
      screen: view.screen
    };
  })()`);
}

function testAiActionConfirmPageOpensFromSelectedActions() {
  const harness = makeAiActionApprovalHarness();
  const ids = setupActionApprovalProposal(harness, { personName: "Mara Thompson" });
  harness.sandbox.__proposalId = ids.proposalId;
  harness.sandbox.document.querySelectorAll = selector => {
    if (selector !== "[data-ai-action-select]") return [];
    return [
      { dataset: { aiActionSelect: ids.proposalId, actionIndex: "0" }, checked: true, disabled: false },
      { dataset: { aiActionSelect: ids.proposalId, actionIndex: "1" }, checked: true, disabled: false },
      { dataset: { aiActionSelect: ids.proposalId, actionIndex: "2" }, checked: false, disabled: false }
    ];
  };
  const result = harness.appEval(`(() => {
    openAiActionConfirmSheet(__proposalId, "selected");
    return {
      screen: view.screen,
      proposalId: view.aiConfirmProposalId,
      actionIndexes: view.aiConfirmActionIndexes || [],
      html: renderScreen()
    };
  })()`);

  assert(result.screen === "aiConfirmActions", "Approve selected actions opens Confirm AI Actions view");
  assert(result.proposalId === ids.proposalId, "Confirm AI Actions view stores proposal id");
  assert(result.actionIndexes.length === 2, "Confirm AI Actions view keeps selected action indexes");
  assert(result.html.includes("Confirm AI Actions"), "Confirm AI Actions view renders title");
  assert(result.html.includes("Selected actions to save"), "Confirm AI Actions view renders selected actions");
  assert(result.html.includes("Choose or create person"), "Confirm AI Actions view renders person choice when needed");
  assert(result.html.includes("data-action=\"ai-action-confirm-save\""), "Confirm AI Actions view renders save button");
}

function saveActionApproval(harness, proposalId, actionIndexes, personChoice = {}) {
  harness.appEval(`
    view.screen = "aiConfirmActions";
    view.sheet = null;
    view.aiConfirmProposalId = ${JSON.stringify(proposalId)};
    view.aiConfirmActionIndexes = ${JSON.stringify(actionIndexes)};
    view.aiConfirmPersonChoice = {};
    view.aiConfirmValidationErrors = [];
    view.aiConfirmValidationWarnings = [];
  `);
  harness.makeElement("ai-confirm-action-confirm").checked = true;
  harness.makeElement("ai-confirm-person-choice").value = personChoice.value || "";
  harness.makeElement("ai-confirm-new-person-name").value = personChoice.newPersonName || "";
  harness.makeElement("ai-confirm-duplicate-confirm").checked = Boolean(personChoice.duplicateConfirm);
  harness.appEval("submitAiActionConfirmSheet()");
}

function testAiActionApprovalAllActionsApprovedLeavesPending() {
  const harness = makeAiActionApprovalHarness();
  const ids = setupActionApprovalProposal(harness, { includePerson: true });
  saveActionApproval(harness, ids.proposalId, [0, 1, 2]);
  const after = actionApprovalSnapshot(harness, ids.proposalId);

  assert(after.status === "approved", "Save Selected Actions with all executable actions sets approved");
  assert(after.pending === false, "fully approved AI proposal is not shown in Pending");
  assert(after.approved === true, "fully approved AI proposal is shown in Approved");
  assert(after.savedAt && after.approvedAt && after.updatedAt, "fully approved AI proposal records save timestamps");
  assert(after.selectedActionIds.length === 3 && after.skippedActionIds.length === 0, "fully approved AI proposal stores selected and skipped action IDs");
}

function testAiActionApprovalPartialLeavesPending() {
  const harness = makeAiActionApprovalHarness();
  const ids = setupActionApprovalProposal(harness, { includePerson: true });
  saveActionApproval(harness, ids.proposalId, [0, 1]);
  const after = actionApprovalSnapshot(harness, ids.proposalId);

  assert(after.status === "partiallyApproved", "Save Selected Actions with partial selection sets partiallyApproved");
  assert(after.status !== "edited", "partial save does not use edited status");
  assert(after.pending === false, "partially approved AI proposal is not shown in Pending");
  assert(after.approved === true, "partially approved AI proposal is shown in Approved");
  assert(after.selectedActionIds.length === 2 && after.skippedActionIds.includes("act-meeting"), "partial save stores selected and skipped action IDs");
}

function testAiActionApprovalCreateNewPersonPath() {
  const harness = makeAiActionApprovalHarness();
  const ids = setupActionApprovalProposal(harness, { personName: "Mara Thompson" });
  saveActionApproval(harness, ids.proposalId, [0, 1, 2], { value: "new", newPersonName: "Mara Thompson" });
  const after = actionApprovalSnapshot(harness, ids.proposalId);
  const createdPerson = after.people.find(person => person.name === "Mara Thompson");

  assert(after.status === "approved" && after.pending === false, "create-new-person AI save leaves Pending");
  assert(Boolean(createdPerson), "create-new-person AI save creates person");
  assert(after.createdPersonId === createdPerson.id, "create-new-person AI save stores createdPersonId");
  assert(after.prayers.length === 1 && after.prayers[0].relatedPersonId === createdPerson.id, "create-new-person AI save links prayer record");
  assert(after.tasks.length === 1 && after.tasks[0].relatedPersonId === createdPerson.id, "create-new-person AI save links follow-up task");
  assert(after.meetings.length === 1 && after.meetings[0].relatedPersonId === createdPerson.id, "create-new-person AI save links meeting record");
}

function testAiActionApprovalExistingPersonPath() {
  const harness = makeAiActionApprovalHarness();
  const personId = harness.appEval(`createPerson("Mara Thompson", "").id`);
  const ids = setupActionApprovalProposal(harness, { personName: "Mara Thompson" });
  saveActionApproval(harness, ids.proposalId, [0, 1, 2], { value: personId });
  const after = actionApprovalSnapshot(harness, ids.proposalId);

  assert(after.status === "approved" && after.pending === false, "existing-person AI save leaves Pending");
  assert(after.people.length === 1, "existing-person AI save does not create duplicate person");
  assert(after.createdPersonId === "", "existing-person AI save does not store createdPersonId");
  assert(after.prayers.length === 1 && after.prayers[0].relatedPersonId === personId, "existing-person AI save links prayer record");
  assert(after.tasks.length === 1 && after.tasks[0].relatedPersonId === personId, "existing-person AI save links follow-up task");
  assert(after.meetings.length === 1 && after.meetings[0].relatedPersonId === personId, "existing-person AI save links meeting record");
}

function testAiActionApprovalCancelCreatesNothing() {
  const harness = makeAiActionApprovalHarness();
  const ids = setupActionApprovalProposal(harness, { personName: "Mara Thompson" });
  harness.appEval(`
    view.screen = "aiConfirmActions";
    view.aiConfirmProposalId = ${JSON.stringify(ids.proposalId)};
    view.aiConfirmActionIndexes = [0, 1, 2];
    cancelAiActionConfirmView();
  `);
  const after = actionApprovalSnapshot(harness, ids.proposalId);

  assert(after.status === "pending", "canceling AI action confirm leaves proposal pending");
  assert(after.people.length === 0, "canceling AI action confirm creates no person");
  assert(after.prayers.length === 0 && after.tasks.length === 0 && after.meetings.length === 0, "canceling AI action confirm creates no records");
}

function testAiActionApprovalFailedValidationLeavesPending() {
  const harness = makeAiActionApprovalHarness();
  const ids = setupActionApprovalProposal(harness, { personName: "Mara Thompson" });
  saveActionApproval(harness, ids.proposalId, [0, 1, 2]);
  const after = actionApprovalSnapshot(harness, ids.proposalId);

  assert(after.status === "pending", "failed AI action validation leaves proposal pending");
  assert(after.confirmOpen === true, "failed AI action validation keeps Confirm AI Actions view open");
  assert(after.people.length === 0, "failed AI action validation creates no person");
  assert(after.prayers.length === 0 && after.tasks.length === 0 && after.meetings.length === 0, "failed AI action validation creates no records");
}

async function run() {
  await testHealthEndpoint();
  await testQuickGrabMockMode();
  await testQuickGrabRealModeUsesOpenAiFetch();
  await testQuickGrabMissingKeyFallsBackToMock();
  await testQuickGrabValidation();
  testNoApiKeyInFrontendOrRepo();
  testRootAndDeployFunctionCopiesMatch();
  testAiProposalRequiresApprovalBeforeSaving();
  testAiMissingPersonBlocksUntilChosenOrCreated();
  testAiExistingPersonSelectionLinksRecords();
  testAiCreateNewPersonLinksRecords();
  testAiCancelCreatesNothing();
  testAiMatchedPersonFlowStillSaves();
  testAiActionConfirmPageOpensFromSelectedActions();
  testAiActionApprovalAllActionsApprovedLeavesPending();
  testAiActionApprovalPartialLeavesPending();
  testAiActionApprovalCreateNewPersonPath();
  testAiActionApprovalExistingPersonPath();
  testAiActionApprovalCancelCreatesNothing();
  testAiActionApprovalFailedValidationLeavesPending();
  console.log("All AI regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
