export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return withSecurityHeaders(response);

    const url = new URL(request.url);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");
    if (request.method === "GET" && acceptsHtml) {
      const indexRequest = new Request(new URL("/index.html", url), request);
      return withSecurityHeaders(await env.ASSETS.fetch(indexRequest));
    }

    return response;
  },
};

function withSecurityHeaders(response) {
  const next = new Response(response.body, response);
  next.headers.set("X-Content-Type-Options", "nosniff");
  next.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return next;
}
