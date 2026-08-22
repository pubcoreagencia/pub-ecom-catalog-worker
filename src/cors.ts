export function isOriginAllowed(origin: string | null | undefined): boolean {
  if (!origin) return false;

  const allowedPatterns = [
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,
    /^https:\/\/([a-zA-Z0-9-]+\.)*lovable\.app$/,
    /^https:\/\/([a-zA-Z0-9-]+\.)*lovableproject\.com$/,
    /^https:\/\/([a-zA-Z0-9-]+\.)*lovable\.dev$/,
  ];

  return allowedPatterns.some((pattern) => pattern.test(origin.trim()));
}

export function getCorsHeaders(origin: string | null | undefined): Record<string, string> {
  if (!origin || !isOriginAllowed(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Accept, Origin, X-Requested-With, Baggage, Sentry-Trace",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function handleCorsPreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;

  const origin = request.headers.get("Origin");
  if (!origin || !isOriginAllowed(origin)) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get("Origin");
  if (!origin || !isOriginAllowed(origin)) {
    return response;
  }

  const newHeaders = new Headers(response.headers);
  const corsHeaders = getCorsHeaders(origin);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
