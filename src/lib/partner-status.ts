import type { Tone } from "@/components/ui";

export function partnerStatus(u: { status: string; expiresAt: Date | null; lockedUntil: Date | null; passwordHash: string | null }): [string, Tone] {
  if (u.status === "disabled") return ["Disabled", "neutral"];
  if (u.expiresAt && u.expiresAt < new Date()) return ["Expired", "red"];
  if (!u.passwordHash) return ["Password not set", "blue"];
  if (u.lockedUntil && u.lockedUntil > new Date()) return ["Locked", "red"];
  if (u.expiresAt && u.expiresAt.getTime() - Date.now() < 30 * 86400_000) return ["Expiring", "orange"];
  return ["Active", "green"];
}
