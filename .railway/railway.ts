// My home on Railway, declared as Infrastructure as Code.
//
// This file is the whole deployment: two services, one volume, one region.
// Nothing here edits an upstream Psycheros file — the fork's `deploy` branch
// layers this directory and `railway/` on top of upstream `main`, so pulling
// a new release is a plain merge. The runbook is `railway/README.md`.
//
// Apply with `railway config plan` / `railway config apply` (the SDK is pinned
// in `.railway/package.json`; run `npm ci` in this directory first). Railway
// never reads this file on its own — a push to `deploy` rebuilds the services,
// but settings, variables and volumes change only when I apply this file.

import {
  defineRailway,
  github,
  preserve,
  project,
  service,
  volume,
} from "railway/iac";

/** The fork Railway builds from. Only this slug is specific to one fork. */
const REPO = "gthoma17/Psycheros";

/** Branch that carries this deploy layer on top of upstream `main`. */
const BRANCH = "deploy";

/** Singapore — the closest Railway region to Tokyo. */
const REGION = "asia-southeast1-eqsg3a";

/** The timezone my days and nights are kept in. */
const TIMEZONE = "Asia/Tokyo";

/**
 * Where the image expects my canonical identity and memory (entity-core's
 * data root, `PSYCHEROS_ENTITY_CORE_DATA_DIR`). Railway allows one volume per
 * service, so the harness's own runtime state nests inside the same volume —
 * entity-core only reads its named category directories and ignores the
 * extra `psycheros/` subdirectory.
 */
const ENTITY_DATA = "/app/packages/entity-core/data";

export default defineRailway(() => {
  // One persistent disk for everything that must outlive a deploy: identity,
  // memories, the graph store, settings and the embedding model cache.
  const entityData = volume("entity-data", {
    region: REGION,
    sizeMB: 5120,
  });

  // My harness. Built from the upstream Dockerfile with the monorepo root as
  // build context; entity-core runs inside the same container as my MCP
  // subprocess. No public domain — the auth proxy is the only way in.
  const psycheros = service("psycheros", {
    source: github(REPO, { branch: BRANCH }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "packages/psycheros/Dockerfile",
      // Rebuild on source changes only; edits to this deploy layer are
      // applied with `railway config apply`, not by a rebuild.
      watchPatterns: ["/packages/**", "/deno.json", "/deno.lock"],
    },
    deploy: {
      healthcheckPath: "/health",
      // First boot downloads the embedding model into the volume.
      healthcheckTimeout: 300,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
    replicas: { [REGION]: 1 },
    volumeMounts: {
      [ENTITY_DATA]: entityData,
    },
    env: {
      // Secret. Lives only in Railway: set it once with
      // `railway variables --service psycheros --set "ZAI_API_KEY=..."`.
      ZAI_API_KEY: preserve(),
      // The image forces UTC; I keep Tokyo time, for my clock and my UI.
      TZ: TIMEZONE,
      PSYCHEROS_DISPLAY_TZ: TIMEZONE,
      // Harness runtime state (settings, .psycheros/, model cache) inside
      // the single volume.
      PSYCHEROS_DATA_DIR: `${ENTITY_DATA}/psycheros`,
    },
  });

  // Basic-auth gate. Holds the only public domain and forwards to my harness
  // over Railway's private network. Config: railway/auth-proxy/.
  const authProxy = service("auth-proxy", {
    source: github(REPO, {
      branch: BRANCH,
      rootDirectory: "railway/auth-proxy",
    }),
    build: {
      builder: "DOCKERFILE",
      watchPatterns: ["/railway/auth-proxy/**"],
    },
    deploy: {
      healthcheckPath: "/healthz",
      healthcheckTimeout: 60,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
    replicas: { [REGION]: 1 },
    env: {
      // Secrets. Set once in Railway:
      //   railway variables --service auth-proxy \
      //     --set "AUTH_USER=..." --set "AUTH_PASSWORD_HASH=..."
      AUTH_USER: preserve(),
      AUTH_PASSWORD_HASH: preserve(),
      PSYCHEROS_HOST: psycheros.env.RAILWAY_PRIVATE_DOMAIN,
      PSYCHEROS_PORT: "3000",
    },
  });

  return project("psycheros", {
    resources: [psycheros, authProxy, entityData],
  });
});
