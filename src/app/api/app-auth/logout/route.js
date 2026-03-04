import { NextResponse } from "next/server";

export async function POST(request) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete("app_auth");
  response.cookies.delete("fortnox_auth");
  response.cookies.delete("fortnox_access_token");
  response.cookies.delete("fortnox_refresh_token");
  return response;
}
