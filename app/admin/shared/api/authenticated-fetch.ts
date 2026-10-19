export const SESSION_REJECTED_EVENT = "neki:session-rejected";

export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (typeof window !== "undefined" && (response.status === 401 || response.status === 403)) {
    window.dispatchEvent(new CustomEvent(SESSION_REJECTED_EVENT, { detail: response.status }));
  }
  return response;
}
