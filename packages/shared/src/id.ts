/** ID generation — prefixed, sortable-enough, collision-safe via crypto. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return `${prefix}_${time}${rand}`;
}

export const nowIso = (): string => new Date().toISOString();
