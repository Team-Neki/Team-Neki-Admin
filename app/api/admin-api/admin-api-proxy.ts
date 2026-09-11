type AdminApiProxyOptions = {
  endpointEnvironmentVariable: string;
  queryParameters: readonly string[];
};

const REQUEST_TIMEOUT_MS = 20_000;

const json = (body: Record<string, unknown>, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

const readEndpoint = (environmentVariable: string) => {
  const value = process.env[environmentVariable]?.trim();
  if (!value) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

export const proxyAdminApiGet = async (request: Request, options: AdminApiProxyOptions) => {
  const endpoint = readEndpoint(options.endpointEnvironmentVariable);
  if (!endpoint) {
    return json({ code: "admin_api_not_configured", message: "관리자 API가 연결되지 않았습니다." }, 503);
  }

  const incoming = new URL(request.url);
  options.queryParameters.forEach((name) => {
    incoming.searchParams.getAll(name).forEach((value) => endpoint.searchParams.append(name, value));
  });

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return json({ code: "admin_api_unavailable", message: "관리자 API에 연결하지 못했습니다." }, 502);
  }
};
