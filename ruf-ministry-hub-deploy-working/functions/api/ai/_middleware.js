const ROUTE_METHODS = new Map([
  ["/api/ai/health", new Set(["GET", "HEAD", "OPTIONS"])],
  ["/api/ai/quick-grab", new Set(["GET", "HEAD", "POST", "OPTIONS"])]
]);

const RESPONSE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

function problem(status, code, error) {
  return new Response(JSON.stringify({
    ok: false,
    code,
    error,
    externalDataSent: false,
    storedServerSide: false
  }), {
    status,
    headers: RESPONSE_HEADERS
  });
}

export async function onRequest({ request, next }) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  const allowedMethods = ROUTE_METHODS.get(pathname);
  if (!allowedMethods) {
    return problem(404, "api_route_not_found", "API route not found.");
  }
  if (!allowedMethods.has(String(request.method || "GET").toUpperCase())) {
    return problem(405, "method_not_allowed", "Method not allowed for this API route.");
  }
  return next();
}
