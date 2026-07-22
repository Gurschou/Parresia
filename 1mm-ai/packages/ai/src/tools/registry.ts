import { z } from "zod";
import { eq } from "drizzle-orm";
import { users, type Database } from "@1mm/database";
import type { ToolDefinition } from "../provider/types";

/**
 * Server-side tool layer.
 *
 * Security model:
 * - The ALLOWLIST below is the single source of truth. The model (and thus
 *   the client) can only ever trigger tools registered here.
 * - Arguments are validated with Zod before execution.
 * - Every tool receives the authenticated user's id from the server session –
 *   never from tool arguments – so a tool can only touch the caller's data.
 */

export interface ToolContext {
  userId: string;
  db: Database;
}

interface ServerTool<Schema extends z.ZodType> {
  name: string;
  description: string;
  schema: Schema;
  /** JSON schema advertised to the model. */
  parameters: Record<string, unknown>;
  execute(ctx: ToolContext, input: z.infer<Schema>): Promise<unknown>;
}

function defineTool<Schema extends z.ZodType>(tool: ServerTool<Schema>): ServerTool<Schema> {
  return tool;
}

const getCurrentUserProfile = defineTool({
  name: "get_current_user_profile",
  description:
    "Henter den aktuelle brugers profil (navn, e-mail, oprettelsesdato). Brug når brugeren spørger til sin egen konto eller profil.",
  schema: z.object({}).strict(),
  parameters: { type: "object", properties: {}, additionalProperties: false },
  async execute(ctx) {
    const [user] = await ctx.db
      .select({
        email: users.email,
        displayName: users.displayName,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);
    if (!user) throw new Error("User not found");
    return {
      email: user.email,
      displayName: user.displayName,
      memberSince: user.createdAt.toISOString(),
    };
  },
});

/** The allowlist. Add future tools (calendar, email, documents…) here. */
const TOOL_ALLOWLIST = [getCurrentUserProfile] as const;

const toolsByName = new Map<string, ServerTool<z.ZodType>>(
  TOOL_ALLOWLIST.map((t) => [t.name, t as unknown as ServerTool<z.ZodType>]),
);

/** Tool definitions in the wire format the provider expects. */
export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_ALLOWLIST.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

export function isAllowedTool(name: string): boolean {
  return toolsByName.has(name);
}

export interface ToolExecutionResult {
  ok: boolean;
  /** JSON string handed back to the model as the function_call_output. */
  output: string;
}

/**
 * Executes a tool call requested by the model. Unknown names and invalid
 * arguments are rejected without executing anything.
 */
export async function executeTool(
  name: string,
  rawArguments: string,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const tool = toolsByName.get(name);
  if (!tool) {
    return { ok: false, output: JSON.stringify({ error: `Unknown tool: ${name}` }) };
  }

  let args: unknown;
  try {
    args = rawArguments.trim() === "" ? {} : JSON.parse(rawArguments);
  } catch {
    return { ok: false, output: JSON.stringify({ error: "Tool arguments were not valid JSON" }) };
  }

  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, output: JSON.stringify({ error: "Tool arguments failed validation" }) };
  }

  try {
    const result = await tool.execute(ctx, parsed.data);
    return { ok: true, output: JSON.stringify(result) };
  } catch (error) {
    // Never leak internals to the model – log server-side instead.
    console.error(
      JSON.stringify({
        level: "error",
        msg: "tool_execution_failed",
        tool: name,
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    return { ok: false, output: JSON.stringify({ error: "Tool execution failed" }) };
  }
}
