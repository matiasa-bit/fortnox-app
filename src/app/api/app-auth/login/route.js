import { NextResponse } from "next/server";

export async function POST(request) {
  const formData = await request.formData();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  const expectedUsername = String(process.env.APP_LOGIN_USERNAME || "admin").trim();
  const expectedPassword = String(process.env.APP_LOGIN_PASSWORD || "fortnox123");

  if (username !== expectedUsername || password !== expectedPassword) {
    return NextResponse.redirect(new URL("/?appAuth=failed", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set("app_auth", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
