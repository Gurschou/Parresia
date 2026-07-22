import { NextResponse, type NextRequest } from "next/server";
import { requireUser, withErrorHandling } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("/api/auth/me", async (request: NextRequest) => {
  const { user } = await requireUser(request);
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    },
  });
});
