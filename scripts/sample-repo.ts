/**
 * Creates a local spec repository with some history so apiHub has releases,
 * drafts and a breaking change to show. Run: pnpm sample:repo
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";

const target = resolve(process.env.SPEC_REPO_PATH ?? "./.data/spec-repo");
const template = resolve("examples/spec-repo");

if (existsSync(target)) {
  if (!process.argv.includes("--force")) {
    console.log(`${target} already exists. Pass --force to recreate it.`);
    process.exit(0);
  }
  rmSync(target, { recursive: true, force: true });
}
cpSync(template, target, { recursive: true });

const git = (...args: string[]) =>
  execFileSync("git", ["-c", "user.name=apiHub sample", "-c", "user.email=sample@example.com", ...args], {
    cwd: target,
    stdio: "pipe",
  }).toString();

type Doc = Record<string, any>;
const edit = (path: string, fn: (doc: Doc) => void) => {
  const file = join(target, path);
  const doc = YAML.parse(readFileSync(file, "utf8"));
  fn(doc);
  writeFileSync(file, YAML.stringify(doc, { lineWidth: 0 }));
};
const commit = (msg: string) => {
  git("add", "-A");
  git("commit", "-q", "-m", msg);
};

git("init", "-q", "-b", "main");
commit("Initial specs");
for (const t of ["payments@2.2.0", "orders@1.8.1", "ledger@1.6.4", "identity@2.6.1"]) git("tag", t);

// payments 2.3.0: additive (refund reason, GET /refunds/{id})
edit("apis/payments/openapi.yaml", (d) => {
  d.info.version = "2.3.0";
  d.components.schemas.RefundCreate.properties.reason = {
    type: "string",
    enum: ["duplicate", "fraudulent", "requested_by_customer"],
  };
  d.components.schemas.Refund.properties.reason = { type: "string" };
  d.paths["/refunds/{id}"] = {
    get: {
      operationId: "getRefund",
      summary: "Get a refund",
      tags: ["Refunds"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": {
          description: "The refund.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Refund" } } },
        },
      },
    },
  };
});
// orders 1.8.2: docs only
edit("apis/orders/openapi.yaml", (d) => {
  d.info.version = "1.8.2";
  d.paths["/orders"].post.responses["409"].description =
    "Stock for at least one item is no longer available. Nothing was reserved.";
});
// ledger: deprecate 1.6.4 in favour of payments v2
writeFileSync(
  join(target, "apis/ledger/apihub.yaml"),
  "owner: finance-team\ntags: [billing]\nvisibility: partner\ndeprecated:\n  \"1.6.4\": 2027-03-31\n",
);
commit("payments 2.3.0, orders 1.8.2, deprecate ledger");
git("tag", "payments@2.3.0");
git("tag", "orders@1.8.2");

// Drafts on main, not released yet.
edit("apis/payments/openapi.yaml", (d) => {
  d.info.version = "2.4.0";
  d.paths["/payouts"] = {
    get: {
      operationId: "listPayouts",
      summary: "List payouts",
      tags: ["Payouts"],
      responses: {
        "200": {
          description: "Payouts.",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "string", example: "po_31" }, amount: { type: "integer", example: 125000 } },
                },
              },
            },
          },
        },
      },
    },
  };
});
// identity: breaking change (username → handle, phone required) but only a minor bump
edit("apis/identity/openapi.yaml", (d) => {
  d.info.version = "2.7.0";
  const user = d.components.schemas.User;
  delete user.properties.username;
  user.properties.handle = { type: "string", example: "ada" };
  user.required = ["id", "handle", "email"];
  const body = d.paths["/users"].post.requestBody.content["application/json"].schema;
  delete body.properties.username;
  body.properties.handle = { type: "string" };
  body.required = ["handle", "email", "phone"];
});
commit("Draft: payouts listing, identity handle rename");

console.log(`Sample spec repo ready at ${target}`);
console.log(git("log", "--oneline", "--decorate").trim());
