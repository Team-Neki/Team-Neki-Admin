import { handleAuth } from "../../../server/auth/auth-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleAuth;
export const POST = handleAuth;
