const RESPONSE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

export function onRequest() {
  return new Response(JSON.stringify({
    ok: false,
    code: "api_route_not_found",
    error: "API route not found.",
    externalDataSent: false,
    storedServerSide: false
  }), {
    status: 404,
    headers: RESPONSE_HEADERS
  });
}
