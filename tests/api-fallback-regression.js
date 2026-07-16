const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const canonicalPath = path.join(repoRoot, "ruf-ministry-hub-deploy-working/functions/api/[[path]].js");
const mirrorPath = path.join(repoRoot, "functions/api/[[path]].js");
const source = fs.readFileSync(canonicalPath, "utf8");
const runnable = source.replace(/export\s+/g, "");
const context = { Request, Response };
vm.createContext(context);
vm.runInContext(`${runnable}\nglobalThis.__handler = onRequest;`, context, { filename: canonicalPath });

async function run() {
  assert.equal(fs.readFileSync(canonicalPath).equals(fs.readFileSync(mirrorPath)), true, "root and deploy API fallbacks are byte-identical");

  const getResponse = context.__handler({
    request: new Request("https://synthetic.example/api/calendar/fictional-private-name")
  });
  assert.equal(getResponse.status, 404, "unknown GET API route fails closed with 404");
  assert.equal(getResponse.headers.get("content-type"), "application/json; charset=utf-8", "unknown API response is JSON");
  assert.equal(getResponse.headers.get("cache-control"), "no-store", "unknown API response is not cached");
  assert.equal(getResponse.headers.get("x-content-type-options"), "nosniff", "unknown API response blocks MIME sniffing");
  const getBody = await getResponse.json();
  assert.deepEqual({ ...getBody }, {
    ok: false,
    code: "api_route_not_found",
    error: "API route not found.",
    externalDataSent: false,
    storedServerSide: false
  }, "unknown API response is metadata-only and fail-closed");

  const postResponse = context.__handler({
    request: new Request("https://synthetic.example/api/unknown", {
      method: "POST",
      body: "fictional request content that must not be echoed"
    })
  });
  const postText = await postResponse.text();
  assert.equal(postResponse.status, 404, "unknown POST API route fails closed with 404");
  assert.equal(postText.includes("fictional request content"), false, "fallback does not read or echo request content");
  assert.equal(postText.includes("/api/unknown"), false, "fallback does not echo request paths");

  console.log("All API fallback regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
