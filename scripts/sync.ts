import "dotenv/config";
import { syncAll } from "@/lib/sync";

syncAll("manual").then((s) => {
  console.log(s.message);
  for (const e of s.errors) console.error("  -", e);
  if (s.newReleases.length) console.log("new releases:", s.newReleases.join(", "));
  process.exit(s.ok ? 0 : 1);
});
