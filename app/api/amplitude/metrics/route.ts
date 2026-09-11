import { proxyAdminApiGet } from "../../admin-api/admin-api-proxy";

const QUERY_PARAMETERS = ["granularity", "startDate", "endDate", "refresh"] as const;

export const GET = (request: Request) => proxyAdminApiGet(request, {
  endpointEnvironmentVariable: "NEKI_ADMIN_ANALYTICS_API_URL",
  queryParameters: QUERY_PARAMETERS,
});
