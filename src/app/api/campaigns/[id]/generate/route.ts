import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runOrchestrator } from "@/lib/agents/orchestrator";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Intentionally not awaited by the caller (the UI fires this and navigates
  // straight to the campaign page) -- but we do await it here so errors are
  // logged to the research_runs table via the orchestrator's own try/catch,
  // rather than becoming an unhandled rejection.
  try {
    await runOrchestrator(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
