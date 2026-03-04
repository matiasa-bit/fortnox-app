import { NextResponse } from "next/server";

export async function GET(request) {
  const baseScopes = [
    "companyinformation",
    "invoice",
    "customer",
    "bookkeeping",
    "settings",
    "costcenter",
    "article",
  ];

  const extraScopes = String(process.env.FORTNOX_EXTRA_SCOPES || "")
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(scope => scope.toLowerCase() !== "project");

  const scope = [...new Set([...baseScopes, ...extraScopes])].join(" ");

  const configuredRedirectUri = String(process.env.FORTNOX_REDIRECT_URI || "").trim();
  const fallbackRedirectUri = new URL("/api/auth/callback", request.url).toString();
  const redirectUri = configuredRedirectUri || fallbackRedirectUri;
  const state = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);

  const url = `https://apps.fortnox.se/oauth-v1/auth?response_type=code&client_id=${process.env.FORTNOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
  const response = NextResponse.redirect(url);

  response.cookies.set("fortnox_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 10,
  });

  response.cookies.set("fortnox_redirect_uri", redirectUri, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}