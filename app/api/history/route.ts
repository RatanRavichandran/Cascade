import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getHistory } from "@/lib/kg/history";

export async function GET() {
  const session = await auth();
  if (!session?.user?.ghId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const entries = await getHistory(session.user.ghId);
  return NextResponse.json({ entries });
}
