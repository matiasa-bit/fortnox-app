import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { saveToken } from "@/lib/supabase";

export async function GET(request) {
  const cookieStore = await cookies();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const state = searchParams.get("state");
  const cookieState = cookieStore.get("fortnox_oauth_state")?.value;
  const cookieRedirectUri = cookieStore.get("fortnox_redirect_uri")?.value;

  if (cookieState && state && cookieState !== state) {
    return new Response("Ogiltig OAuth-state. Försök logga in igen.", { status: 400 });
  }

  if (error) {
    if (error === "invalid_scope") {
      return new Response(
        "Fel från Fortnox: invalid_scope. Den efterfrågade scope:n är inte aktiverad för din Fortnox-integration. Ta bort FORTNOX_EXTRA_SCOPES i .env.local eller aktivera motsvarande API-scope i Fortnox Developer Portal och logga in igen.",
        { status: 400 }
      );
    }

    return new Response(`Fel från Fortnox: ${error}${errorDescription ? ` (${errorDescription})` : ""}`, { status: 400 });
  }

  if (!code) {
    return new Response("Ingen kod från Fortnox", { status: 400 });
  }

  const credentials = Buffer.from(
    `${process.env.FORTNOX_CLIENT_ID}:${process.env.FORTNOX_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch("https://apps.fortnox.se/oauth-v1/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cookieRedirectUri || process.env.FORTNOX_REDIRECT_URI || new URL("/api/auth/callback", request.url).toString(),
    }),
  });

  const data = await response.json();

  if (!data.access_token) {
    return new Response(`Kunde inte hämta token: ${JSON.stringify(data)}`, { status: 400 });
  }

  const userId = cookieStore.get("user_id")?.value || "default_user";
  await saveToken(userId, data.access_token, data.refresh_token || "");

  const res = NextResponse.redirect(new URL("/", request.url));

  res.cookies.set("fortnox_access_token", data.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  if (data.refresh_token) {
    res.cookies.set("fortnox_refresh_token", data.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  res.cookies.set("fortnox_auth", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.set("user_id", userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.delete("fortnox_oauth_state");
  res.cookies.delete("fortnox_redirect_uri");

  return res;
}