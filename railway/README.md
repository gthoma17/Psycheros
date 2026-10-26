# Running me on Railway

This directory and `.railway/` are a deploy layer the fork adds on top of
upstream Psycheros. Nothing in it edits an upstream file, so pulling a new
upstream release is a plain merge with no conflicts to resolve.

| File                               | Role                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `.railway/railway.ts`              | The whole deployment as code: services, volume, region, variables (Railway IaC)         |
| `.railway/package.json` + lockfile | Pins the `railway` SDK that `railway config plan/apply` evaluate the file with          |
| `railway/auth-proxy/`              | Caddy basic-auth gate — I have no login of my own, so this holds the only public domain |

## How I'm laid out

- **Two services, one region (Singapore), one volume.**
- `psycheros` — my harness, built from `packages/psycheros/Dockerfile` with the
  repo root as build context. entity-core runs inside the same container as my
  MCP subprocess. No public domain.
- `auth-proxy` — Caddy with basic auth, forwards to
  `psycheros.railway.internal:3000` over the private network. This is the only
  service with a domain.
- `entity-data` volume, mounted at `/app/packages/entity-core/data` (the image
  default for my canonical identity and memory). Railway allows one volume per
  service, so the harness's own runtime state lives inside it too:
  `PSYCHEROS_DATA_DIR=/app/packages/entity-core/data/psycheros`. entity-core
  only reads its named category directories and ignores the extra one.
- `TZ` and `PSYCHEROS_DISPLAY_TZ` are `Asia/Tokyo`; the image's UTC default is
  overridden by the service variables.

Railway never reads `.railway/railway.ts` on its own. A push to the `deploy`
branch rebuilds the services from source; settings, variables, domains and
volumes change only when the file is applied with `railway config apply`.

## Branches

- `main` mirrors upstream `PsycherosAI/Psycheros` and is never committed to.
- `deploy` is `main` plus this layer. Railway builds `deploy`.

Fork remotes, once:

```bash
git remote rename origin upstream
git remote add origin git@github.com:<fork-owner>/Psycheros.git
git push -u origin main deploy
```

### Pulling an upstream release

```bash
git fetch upstream
git checkout main && git merge --ff-only upstream/main
git checkout deploy && git merge main
git push origin main deploy
```

The push to `deploy` is what triggers the rebuild. Only the files in `.railway/`
and `railway/` belong to this layer; if upstream ever adds a file with one of
those paths, that is the one place a merge could conflict.

Pinning instead of tracking the tip: merge a release tag into `deploy`
(`git merge psycheros-v1.0.1`) rather than `main`.

## First-time setup

Prerequisites: the Railway CLI (`brew install railway`), Node 22+, and the
Railway GitHub App installed on the fork so Railway can pull the `deploy`
branch.

```bash
# 1. Log in and create the project (this links the repo directory to it)
railway login
railway init --name psycheros

# 2. Install the pinned SDK the CLI evaluates .railway/railway.ts with
(cd .railway && npm ci)

# 3. Preview, then create everything
railway config plan
railway config apply

# 4. Secrets live only in Railway — preserve() in railway.ts keeps them
railway variable set --service psycheros "ZAI_API_KEY=<key>"

# 5. Gate credentials. Hash the password with Caddy itself.
docker run --rm caddy:2.10-alpine caddy hash-password --plaintext '<password>'
railway variable set --service auth-proxy \
  "AUTH_USER=<login>" \
  'AUTH_PASSWORD_HASH=<bcrypt hash from the previous command>'

# 6. Give the gate its public domain (and only the gate)
railway domain --service auth-proxy
```

Open the domain, enter the gate credentials, and run my first-run setup in the
browser as usual. Bcrypt hashes contain `$`; keep the single quotes around the
value so the shell leaves it alone.

If the first `railway config plan` objects to a `preserve()` variable that does
not exist yet, run steps 4 and 5 before step 3 by creating the two services
empty in the dashboard with the same names, then apply.

## Changing the deployment

Edit `.railway/railway.ts`, then:

```bash
railway config plan     # read the diff — a resource left out of the file is deleted
railway config apply
```

Optional knobs (Discord, image generation, web search, Lovense…) are plain
variables: add them to the service's `env` block in the file, or set them in the
dashboard and add a `preserve()` entry so the next apply keeps them. The full
list is `packages/psycheros/.env.example`.

## Day to day

```bash
railway logs --service psycheros        # my harness
railway logs --service auth-proxy       # the gate
railway ssh --service psycheros         # a shell inside my container
railway redeploy --service psycheros    # restart without a rebuild
```

## Things to know

- **Volume region must match the service region.** Both are set from the one
  `REGION` constant in the file.
- **Server-sent events are capped at 15 minutes per connection on Railway**; my
  web UI reconnects automatically. Voice uses WebSockets, which are exempt.
- **First boot is slow.** The embedding model downloads into the volume; the
  300-second healthcheck timeout covers it. Later boots are fast.
- **Upgrading the Railway SDK**: bump the version in `.railway/package.json`,
  run `npm install` there, and commit the lockfile.
- **Config as Code (`railway.json`) is deprecated**; Railway stops reading it on
  2026-12-01. This layer uses its replacement, Infrastructure as Code.
