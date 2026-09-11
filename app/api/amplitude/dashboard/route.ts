import { proxyAdminApiGet } from "../../admin-api/admin-api-proxy";

const QUERY_PARAMETERS = ["granularity", "anchorDate", "rangeStartDate", "rangeEndDate"] as const;

export const GET = (request: Request) => proxyAdminApiGet(request, {
  endpointEnvironmentVariable: "NEKI_ADMIN_DASHBOARD_API_URL",
  queryParameters: QUERY_PARAMETERS,
});
