import "server-only";
import { hash, verify } from "@node-rs/argon2";

export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(password: string) {
  return hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 256) return "Password is too long.";
  return null;
}
