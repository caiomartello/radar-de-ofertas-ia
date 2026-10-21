import { NextRequest } from "next/server";
import { handleMeliOAuth } from "@/lib/meli-oauth-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (req: NextRequest) => handleMeliOAuth(req, "config");
export const POST = (req: NextRequest) => handleMeliOAuth(req, "config");
