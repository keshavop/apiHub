# API specs

This repository is the source of truth for every API published on apiHub.

## Layout

```
apis/<slug>/openapi.yaml   # the spec; info.version is the semver of what's on this branch
apis/<slug>/apihub.yaml    # owner, tags, visibility, lifecycle, default version
domains/<name>.yaml        # shared components: $ref: '../../domains/common.yaml#/Money'
```

`apihub.yaml`:

```yaml
owner: payments-team
tags: [billing]
visibility: partner        # internal | partner | public
defaultVersion: 2.3.0      # optional; otherwise the newest stable release
deprecated:                # version: sunset date
  "1.9.0": 2027-03-31
retired: ["1.0.0"]         # hidden from partners
```

## Releasing

The default branch is the working draft. To publish a version, tag the commit
`<slug>@<semver>`, e.g. `git tag payments@2.4.0 && git push --tags`. Releases are immutable.

## Patch conventions

Every pull request gets an `apihub/semver` status. It fails when `info.version`
doesn't match the changes:

| Change | Bump |
|---|---|
| Removed or renamed operation, parameter or property; optional → required; new required input; narrowed type/enum in a request | **major** |
| New operation, optional input, response property; deprecations | **minor** |
| Descriptions, summaries, examples, tags | **patch** |

Remove something only after a release that marked it `deprecated: true`
(operations also need `x-sunset: YYYY-MM-DD`).
