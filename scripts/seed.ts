/**
 * Local development data. Dev-only credentials:
 *   staff:   use "Dev sign-in" on /login (ALLOW_DEV_LOGIN=true)
 *   partner: dev@partner-a.test / partner-dev-password  (can open payments ^2 and orders ~1.8)
 *            qa@partner-b.test  / partner-dev-password  (can open payments 2.2.x only)
 */
import "dotenv/config";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { syncAll } from "@/lib/sync";

const DEV_PARTNER_PASSWORD = "partner-dev-password";

async function main() {
  const summary = await syncAll("manual");
  console.log("sync:", summary.message);

  const ownerLogin = (process.env.BOOTSTRAP_OWNER_LOGINS || "dev-owner").split(",")[0].trim();
  await db.user.upsert({
    where: { githubLogin: ownerLogin },
    create: { kind: "staff", role: "owner", githubLogin: ownerLogin, name: "Dev owner", status: "active" },
    update: {},
  });

  const passwordHash = await hashPassword(DEV_PARTNER_PASSWORD);
  const partners = [
    { email: "dev@partner-a.test", company: "Partner A", grants: { payments: "^2.0.0", orders: "~1.8.0" } },
    { email: "qa@partner-b.test", company: "Partner B", grants: { payments: "2.2.x" } },
  ];
  for (const p of partners) {
    const user = await db.user.upsert({
      where: { email: p.email },
      create: { kind: "partner", role: "partner", email: p.email, company: p.company, passwordHash, status: "active" },
      update: {},
    });
    for (const [slug, range] of Object.entries(p.grants)) {
      const api = await db.api.findUnique({ where: { slug } });
      if (!api) continue;
      await db.apiGrant.upsert({
        where: { userId_apiId: { userId: user.id, apiId: api.id } },
        create: { userId: user.id, apiId: api.id, versionRange: range },
        update: {},
      });
    }
  }
  console.log(`seeded owner "${ownerLogin}" and ${partners.length} partner users`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
