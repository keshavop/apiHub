import { createHash, randomBytes } from "node:crypto";

export function newToken() {
  return randomBytes(32).toString("base64url");
}

/** Only hashes are stored, so a leaked database cannot be replayed as cookies or links. */
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
