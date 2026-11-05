# apiHub

Self-hosted API portal in the spirit of SwaggerHub. One Git repository holds every OpenAPI spec; apiHub
syncs it, renders interactive docs, enforces semver patch conventions on every change, and shares
specific specs with partner companies.

- **Staff** sign in with GitHub (owner / admin / designer).
- **Partners** sign in with **email + password**. Each partner email can open only the API specs and
  version ranges an admin granted to it. Anything else returns 404.

## Quick start (local)

```bash
pnpm install
cp .env.example .env          # defaults work for local dev
pnpm sample:repo              # creates .data/spec-repo with releases, drafts and a breaking change
pnpm db:migrate && pnpm db:seed
pnpm dev -p 3100              # APP_URL in .env must match
```

Open http://localhost:3100.

- Staff: **Dev sign-in as owner** (shown only while `ALLOW_DEV_LOGIN=true` and not in production).
- Partners: the seeded test accounts are listed at the top of [scripts/seed.ts](scripts/seed.ts).

`pnpm db:reset` rebuilds the database from scratch and re-syncs.

## How it works

| Area | Where |
|---|---|
| Spec repo layout, release tags, `apihub.yaml` | [examples/spec-repo/README.md](examples/spec-repo/README.md) |
| Sync: default branch → drafts, `<slug>@<semver>` tags → immutable releases | [src/lib/sync.ts](src/lib/sync.ts) |
| Spec sources: local git repo or GitHub REST API | [src/lib/source](src/lib/source) |
| Breaking-change diff and semver rules | [src/lib/spec/diff.ts](src/lib/spec/diff.ts) |
| Lint (Spectral `oas` recommended + apiHub rules) | [src/lib/spec/lint.ts](src/lib/spec/lint.ts) |
| Mock server `/mock/<slug>/<version>/…` (`Prefer: code=404` picks a response) | [src/lib/spec/mock.ts](src/lib/spec/mock.ts) |
| Who can see what | [src/lib/access.ts](src/lib/access.ts) |
| Sessions, passwords, lockout, set-password links | [src/lib/auth](src/lib/auth) |

### Patch conventions

Every proposed change is diffed against the API's latest release:

| Change | Required bump |
|---|---|
| Removed or renamed operation, parameter or property; optional → required; new required input; narrowed request type, format or enum | major (minor below 1.0.0) |
| New operation, optional input or response property; deprecations | minor |
| Summaries, descriptions, examples, tags | patch |

A removal also fails unless the base release already marked the item `deprecated: true`. The same check
runs in the editor, on the compare page, as the `apihub/semver` commit status on GitHub pull requests,
and from the CLI:

```bash
pnpm check:semver <branch> [base]
```

### Partner access

- Admins create partner users in **Admin → Partner users**, choosing the API specs and a semver range
  per spec (`^2.0.0`, `~1.8.0`, `2.2.x`, `*`) and an optional expiry.
- The partner gets a single-use set-password link that expires after 72 hours. Without `RESEND_API_KEY`, the
  link is shown to the admin to send instead.
- Partners only ever see released versions inside their range, and only for APIs that `apihub.yaml`
  marks `partner` or `public`, never `internal` ones.
- Docs, downloads, the mock server and the Try-it proxy all use the same check.
- Passwords are hashed with argon2id. Sign-in is rate-limited, and 5 failed attempts lock the account for 15 minutes.
- Sessions are stored in the database, so disabling a user signs them out immediately.
- The Try-it proxy forwards only to apiHub's mock server or to a server URL listed in a spec the user can open.

## Using a GitHub repository

1. Create the spec repo using the layout in `examples/spec-repo`.
2. Set `SPEC_SOURCE=github`, `GITHUB_REPO=owner/name` and `GITHUB_TOKEN`. The token needs contents
   read/write, pull requests read/write and commit statuses read/write.
3. Add a repo webhook to `<APP_URL>/api/github/webhook`:
   - Content type: JSON.
   - Secret: the same value as `GITHUB_WEBHOOK_SECRET`.
   - Events: push, pull request, branch or tag creation.
4. For staff sign-in, create a GitHub OAuth app with callback `<APP_URL>/api/auth/github/callback`. Set
   `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `BOOTSTRAP_OWNER_LOGINS` for the first owner.

The editor's **Open pull request** commits to a new branch and opens a PR. Nothing is published from
apiHub directly; releases are tags in the repo.

## Development

```bash
pnpm test        # Vitest: diff rules, mock server, $ref bundling, grant ranges
pnpm lint
pnpm build
```

The database is SQLite through Prisma 7's better-sqlite3 adapter. The schema avoids provider-specific
features; moving to Postgres means changing `provider`, swapping the adapter in
[src/lib/db.ts](src/lib/db.ts) and creating a new migration.

## Not built yet

SDK and server-stub code generation, comments on operations, forking an API, email notifications to
subscribed partners, and loading the spec repo's own `.spectral.yaml` ruleset.
