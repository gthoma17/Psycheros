# Running me on Fly.io

This directory is a deploy layer the fork adds on top of upstream Psycheros.
Nothing in it edits an upstream file, so pulling a new upstream release is a
plain merge with no conflicts to resolve.

| File                     | Role                                                                           |
| ------------------------ | ------------------------------------------------------------------------------ |
| `fly/psycheros/fly.toml` | My harness: Tokyo region, 2 GB VM, one volume, no public address               |
| `fly/auth-proxy/`        | The gate — Caddy basic auth, the only public app; `fly.toml`, image, Caddyfile |

## How I'm laid out

- **Two apps, one region (`nrt`, Tokyo), one volume.**
- `psycheros-harness` — built from `packages/psycheros/Dockerfile` with the
  repository root as build context. entity-core runs inside the same container
  as my MCP subprocess. No public IPs; nothing routes to it from outside.
- `psycheros-gate` — Caddy with basic auth, forwards to
  `psycheros-harness.internal:3000` over the organization's private network
  (6PN). The `.internal` name resolves to my harness machine; Caddy looks it up
  on every connection, so a machine replacement needs no proxy restart.
- `entity_data` volume (5 GB) mounted at `/app/packages/entity-core/data`, the
  image default for my canonical identity and memory. Fly allows one volume per
  machine, so the harness's own runtime state lives inside it too:
  `PSYCHEROS_DATA_DIR=/app/packages/entity-core/data/psycheros`. entity-core
  only reads its named category directories and ignores the extra one.
- `TZ` and `PSYCHEROS_DISPLAY_TZ` are `Asia/Tokyo`; the image's UTC default is
  overridden by the app environment.

Fly never reads these files on its own. A push to `deploy` changes nothing;
every change reaches Fly through `fly deploy`, which builds from the local
working tree.

## Branches

- `main` mirrors upstream `PsycherosAI/Psycheros` and is never committed to.
- `deploy` is `main` plus this layer. Deploy from `deploy`.

### Pulling an upstream release

```bash
git fetch upstream
git checkout main && git merge --ff-only upstream/main
git checkout deploy && git merge main
git push origin main deploy
```

Then redeploy the harness (below). Only `fly/` belongs to this layer; if
upstream ever adds a file under that path, that is the one place a merge could
conflict.

Pinning instead of tracking the tip: merge a release tag into `deploy`
(`git merge psycheros-v1.0.1`) rather than `main`.

## First-time setup

Prerequisites: `flyctl` logged in to the organization that should own me. Check
it before creating anything — `fly orgs list` — and pass `--org` explicitly
below so nothing lands in the wrong one.

```bash
# 1. The two apps and the volume, in Tokyo
fly apps create psycheros-harness --org <org>
fly apps create psycheros-gate --org <org>
fly volumes create entity_data --app psycheros-harness --region nrt --size 5 --yes

# 2. Secrets live only in Fly
fly secrets set --app psycheros-harness ZAI_API_KEY=<key>

# 3. Gate credentials. Hash the password with Caddy itself.
docker run --rm caddy:2.10-alpine caddy hash-password --plaintext '<password>'
fly secrets set --app psycheros-gate \
  AUTH_USER=<login> \
  'AUTH_PASSWORD_HASH=<bcrypt hash from the previous command>'

# 4. Build and start me, from the repository root
fly deploy -c fly/psycheros/fly.toml --ha=false --no-public-ips
fly deploy fly/auth-proxy --ha=false
```

Open `https://psycheros-gate.fly.dev`, enter the gate credentials, and run my
first-run setup in the browser as usual. Bcrypt hashes contain `$`; keep the
single quotes around the value so the shell leaves it alone.

`--ha=false` is not optional on the harness: the default creates a spare
machine, and with a `[[mounts]]` section that means a second, empty volume and a
second me.

## Changing the deployment

Edit the `fly.toml` files, then run the two `fly deploy` commands from step 4.
Volume size can only grow: `fly volumes extend <volume id> -s <GB>`.

Optional knobs (Discord, image generation, web search, Lovense…) are plain
environment variables: add the non-secret ones to `[env]` in
`fly/psycheros/fly.toml`, and set secret ones with `fly secrets set`. The full
list is `packages/psycheros/.env.example`.

## Day to day

```bash
fly logs --app psycheros-harness        # my harness
fly logs --app psycheros-gate           # the gate
fly ssh console --app psycheros-harness # a shell inside my container
fly machine restart --app psycheros-harness <machine id>  # restart without a rebuild
fly status --app psycheros-harness
```

## Things to know

- **First boot is slow.** The embedding model downloads into the volume; the
  300-second health-check grace period covers it. Later boots are fast.
- **Memory.** The transformer embeddings need real RAM; the harness runs on a 2
  GB shared VM with 1 GB of swap behind it. Raise `[[vm]] memory` before
  anything else if I get OOM-killed.
- **The gate never autostops.** Fly's scale-to-zero is off on both apps so my
  SSE and WebSocket sessions stay up; the price is two always-on machines.
- **The harness has no service block on purpose.** Without one, Fly allocates no
  public IPs and nothing on the internet can reach port 3000 directly. The gate
  reaches it over 6PN, which bypasses Fly's proxy entirely.
- **Snapshots.** Fly takes a daily snapshot of the volume and keeps five days of
  them; `fly volumes snapshots list <volume id>` shows them.
