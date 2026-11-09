import { NextResponse } from "next/server";
import { getVersionInfo } from "@/lib/version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const info = getVersionInfo();
  return NextResponse.json(info, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
