const fs = require("fs");
const path = require("path");
const vm = require("vm");
const nodeCrypto = require("crypto");

const repoRoot = path.resolve(__dirname, "..");
const deployRoot = path.resolve(repoRoot, "ruf-ministry-hub-deploy-working");

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function loadQuickGrab(overrides = {}) {
  const policyPath = path.resolve(deployRoot, "functions/api/ai/quick-grab-pilot-policy.js");
  const functionPath = path.resolve(deployRoot, "functions/api/ai/quick-grab.js");
  const policy = fs.readFileSync(policyPath, "utf8").replace(/export\s+/g, "");
  const source = fs.readFileSync(functionPath, "utf8")
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/quick-grab-pilot-policy\.js";\s*/, "")
    .replace(/export\s+/g, "");
  const context = {
    console,
    Request,
    Response,
    URL,
    TextEncoder,
    TextDecoder,
    AbortController,
    setTimeout,
    clearTimeout,
    atob,
    crypto: nodeCrypto.webcrypto,
    fetch() { throw new Error("default-off pilot must not make a network call"); },
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(`${policy}\n${source}\nglobalThis.__handler = onRequestPost;`, context, { filename: functionPath });
  return context.__handler;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function cloudflareAccessFixture() {
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const teamDomain = "https://ruf-hub-pilot-test.cloudflareaccess.com";
  const audience = "synthetic-pilot-audience";
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: "synthetic-pilot-key", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: teamDomain,
    aud: [audience],
    sub: "synthetic-pilot-user",
    exp: Math.floor(Date.now() / 1000) + 300
  }));
  const signingInput = `${header}.${payload}`;
  const signature = nodeCrypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
  return {
    token: `${signingInput}.${signature}`,
    teamDomain,
    audience,
    jwk: { ...publicKey.export({ format: "jwk" }), kid: "synthetic-pilot-key", alg: "RS256", use: "sig" }
  };
}

function pilotRequest(url, policyVersion, fixtureId, pilotAction, grantId = "", accessToken = "") {
  const body = { pilotAction, policyVersion, fixtureId };
  if (grantId) body.grantId = grantId;
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-RUF-HUB-AI-Pilot": policyVersion,
      ...(accessToken ? { "Cf-Access-Jwt-Assertion": accessToken } : {})
    },
    body: JSON.stringify(body)
  });
}

async function run() {
  const fixtureManifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "tests/fixtures/api/fictional-quick-grab-pilot.json"), "utf8"));
  const policy = fs.readFileSync(path.resolve(repoRoot, "functions/api/ai/quick-grab-pilot-policy.js"), "utf8");
  const quickGrab = fs.readFileSync(path.resolve(repoRoot, "functions/api/ai/quick-grab.js"), "utf8");
  assert(fixtureManifest.fixtures.length === 5, "pilot manifest contains exactly five fictional fixtures");
  assert(fixtureManifest.fixtures.every(fixture => fixture.rawContent.startsWith("Fictional example:")), "every pilot fixture is explicitly fictional");
  assert(policy.includes('model: "gpt-5.6-luna"') && policy.includes('reasoningEffort: "low"'), "pilot policy pins the approved model and low reasoning");
  assert(policy.includes("spendingCeilingMicros: 5_000_000"), "pilot policy fixes the five-dollar spending ceiling");
  assert(policy.includes("minuteLimit: 2") && policy.includes("dayLimit: 5") && policy.includes("lifetimeLimit: 25"), "pilot policy fixes request caps");
  assert(quickGrab.includes('authorization.method !== "cloudflare_access"'), "pilot accepts Cloudflare Access authentication only");
  assert(quickGrab.includes("quickGrabPilotConfiguration(request, env)"), "pilot checks exact preview host, policy, enablement, and expiry");
  assert(quickGrab.includes("store: false") && quickGrab.includes("tools: []") && quickGrab.includes("strict: true"), "pilot OpenAI request is non-stored, tool-free, and strict-schema");
  assert(!/callPilotOpenAI[\s\S]*?console\./.test(quickGrab.slice(quickGrab.indexOf("async function callPilotOpenAI"), quickGrab.indexOf("async function handlePilotRequest"))), "pilot provider path emits no logs");

  const handler = loadQuickGrab();
  const response = await handler({
    request: new Request("https://pilot-example.pages.dev/api/ai/quick-grab", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-RUF-HUB-AI-Pilot": fixtureManifest.policyVersion },
      body: JSON.stringify({ pilotAction: "run", policyVersion: fixtureManifest.policyVersion, fixtureId: fixtureManifest.fixtures[0].id, grantId: "synthetic" })
    }),
    env: {}
  });
  assert(response.status === 404, "pilot is fail-closed and indistinguishable when no approved configuration exists");

  const access = cloudflareAccessFixture();
  const fixture = fixtureManifest.fixtures.find(candidate => candidate.id === "fixture-welcome");
  const previewHost = "pilot-example.pages.dev";
  const previewUrl = `https://${previewHost}/api/ai/quick-grab`;
  const grantId = "synthetic-single-use-grant";
  let issuedGrant = null;
  let consumed = false;
  let openAiCalls = 0;
  const limiter = {
    getByName(name) {
      assert(name === "quick-grab-fictional-pilot-budget-v1", "enabled pilot uses the dedicated limiter namespace");
      return {
        async issuePilotGrant(principalHash, policyVersion, fixtureId, ttlSeconds) {
          issuedGrant = { principalHash, policyVersion, fixtureId, ttlSeconds };
          return { grantId, expiresAt: new Date(Date.now() + (ttlSeconds * 1000)).toISOString() };
        },
        async consumePilotGrantAndReserve(candidateGrantId, principalHash, policyVersion, fixtureId) {
          if (consumed
            || candidateGrantId !== grantId
            || principalHash !== issuedGrant?.principalHash
            || policyVersion !== issuedGrant?.policyVersion
            || fixtureId !== issuedGrant?.fixtureId) {
            return { ok: false, code: "pilot_grant_invalid" };
          }
          consumed = true;
          return { ok: true };
        }
      };
    }
  };
  const handlerWithSyntheticProvider = loadQuickGrab({
    async fetch(url, init = {}) {
      if (url === `${access.teamDomain}/cdn-cgi/access/certs`) {
        return Response.json({ keys: [access.jwk] });
      }
      assert(url === "https://api.openai.com/v1/responses", "enabled pilot calls only the Responses API");
      openAiCalls += 1;
      const requestBody = JSON.parse(init.body);
      assert(requestBody.model === "gpt-5.6-luna", "enabled pilot pins the approved model");
      assert(requestBody.reasoning?.effort === "low", "enabled pilot pins low reasoning");
      assert(requestBody.store === false, "enabled pilot disables provider storage");
      assert(Array.isArray(requestBody.tools) && requestBody.tools.length === 0, "enabled pilot exposes no tools");
      assert(requestBody.max_output_tokens === 800, "enabled pilot caps output tokens");
      assert(requestBody.text?.format?.strict === true, "enabled pilot requires strict structured output");
      assert(init.headers.Authorization === "Bearer synthetic-runtime-key", "enabled pilot uses only the server runtime credential");
      return Response.json({
        id: "resp_synthetic_pilot",
        model: "gpt-5.6-luna",
        status: "completed",
        output_text: JSON.stringify({
          summary: "Synthetic welcome follow-up.",
          category: "follow_up",
          suggestedNextStep: "Review the fictional follow-up.",
          confidence: "high",
          warnings: []
        })
      });
    }
  });
  const enabledEnv = {
    AI_QG_PILOT_ENABLED: "true",
    AI_QG_PILOT_POLICY_VERSION: fixtureManifest.policyVersion,
    AI_QG_PILOT_PREVIEW_HOST: previewHost,
    AI_QG_PILOT_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
    CF_ACCESS_TEAM_DOMAIN: access.teamDomain,
    CF_ACCESS_AUD: access.audience,
    AI_RATE_LIMITER: limiter,
    OPENAI_API_KEY: "synthetic-runtime-key"
  };

  const grantResponse = await handlerWithSyntheticProvider({
    request: pilotRequest(previewUrl, fixtureManifest.policyVersion, fixture.id, "request_grant", "", access.token),
    env: enabledEnv
  });
  const grantBody = await grantResponse.json();
  assert(grantResponse.status === 200 && grantBody.grantId === grantId, "enabled pilot issues one scoped short-lived grant");
  assert(issuedGrant?.fixtureId === fixture.id && issuedGrant?.ttlSeconds === 120, "grant is scoped to the approved fixture and two-minute TTL");
  assert(openAiCalls === 0, "grant issuance sends no fixture to the provider");

  const runResponse = await handlerWithSyntheticProvider({
    request: pilotRequest(previewUrl, fixtureManifest.policyVersion, fixture.id, "run", grantId, access.token),
    env: enabledEnv
  });
  const runBody = await runResponse.json();
  assert(runResponse.status === 200 && runBody.ok === true, "enabled pilot returns a transient proposal");
  assert(runBody.externalDataSent === true && runBody.storedServerSide === false, "enabled pilot reports one external send and no server storage");
  assert(runBody.proposalOnly === true && runBody.proposal?.suggestedNextStep, "enabled pilot response is proposal-only");
  assert(openAiCalls === 1, "enabled pilot makes exactly one synthetic provider request");

  const replayResponse = await handlerWithSyntheticProvider({
    request: pilotRequest(previewUrl, fixtureManifest.policyVersion, fixture.id, "run", grantId, access.token),
    env: enabledEnv
  });
  const replayBody = await replayResponse.json();
  assert(replayResponse.status === 400 && replayBody.code === "pilot_grant_invalid", "replayed pilot grant is rejected");
  assert(openAiCalls === 1, "replayed grant cannot make a second provider request");
  console.log("All fictional Real AI Quick Grab pilot regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
