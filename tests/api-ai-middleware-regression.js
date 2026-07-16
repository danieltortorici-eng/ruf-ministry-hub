const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const canonicalPath = path.join(repoRoot, "ruf-ministry-hub-deploy-working/functions/api/ai/_middleware.js");
const mirrorPath = path.join(repoRoot, "functions/api/ai/_middleware.js");
const source = fs.readFileSync(canonicalPath, "utf8");
const runnable = source.replace(/export\s+/g, "");
const context = { Map, Response, Set, URL };
vm.createContext(context);
vm.runInContext(`${runnable}\nglobalThis.__handler = onRequest;`, context, { filename: canonicalPath });

async function runRequest(pathname, method) {
  let nextCalls = 0;
  const request = {
    url: `https://synthetic.example${pathname}`,
    method,
    get body() {
      throw new Error("middleware must not read request bodies");
    }
  };
  const response = await context.__handler({
    request,
    next: async () => {
      nextCalls += 1;
      return Response.json({ ok: true, delegated: true });
    }
  });
  return { response, nextCalls };
}

async function run() {
  assert.equal(fs.readFileSync(canonicalPath).equals(fs.readFileSync(mirrorPath)), true, "root and deploy AI middleware are byte-identical");

  for (const [pathname, method] of [
    ["/api/ai/health", "GET"],
    ["/api/ai/health", "HEAD"],
    ["/api/ai/health", "OPTIONS"],
    ["/api/ai/quick-grab", "GET"],
    ["/api/ai/quick-grab", "HEAD"],
    ["/api/ai/quick-grab", "POST"],
    ["/api/ai/quick-grab", "OPTIONS"]
  ]) {
    const { response, nextCalls } = await runRequest(pathname, method);
    assert.equal(response.status, 200, `${method} ${pathname} delegates to its exact Function`);
    assert.equal(nextCalls, 1, `${method} ${pathname} delegates exactly once`);
  }

  for (const [pathname, method] of [
    ["/api/ai/health", "POST"],
    ["/api/ai/health", "DELETE"],
    ["/api/ai/quick-grab", "PUT"],
    ["/api/ai/quick-grab", "PATCH"]
  ]) {
    const { response, nextCalls } = await runRequest(pathname, method);
    const body = await response.json();
    assert.equal(response.status, 405, `${method} ${pathname} fails closed with 405`);
    assert.equal(body.code, "method_not_allowed", `${method} ${pathname} returns the safe method code`);
    assert.equal(body.externalDataSent, false, `${method} ${pathname} reports no external send`);
    assert.equal(body.storedServerSide, false, `${method} ${pathname} reports no server storage`);
    assert.equal(nextCalls, 0, `${method} ${pathname} never reaches an endpoint or static fallback`);
  }

  const unknown = await runRequest("/api/ai/fictional-private-name", "POST");
  const unknownText = await unknown.response.text();
  assert.equal(unknown.response.status, 404, "unknown nested AI route fails closed with 404");
  assert.equal(unknown.nextCalls, 0, "unknown nested AI route never reaches static fallback");
  assert.equal(unknownText.includes("fictional-private-name"), false, "unknown AI response does not echo the path");
  assert.equal(unknown.response.headers.get("cache-control"), "no-store", "middleware errors are not cached");
  assert.equal(unknown.response.headers.get("x-content-type-options"), "nosniff", "middleware errors block MIME sniffing");

  console.log("All API AI middleware regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
