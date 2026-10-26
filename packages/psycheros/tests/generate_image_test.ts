/**
 * Tests for generate-image.ts — OpenRouter model-family detection and base URL
 * normalization. These are the two fixes from issue #11: image-only families
 * must not request text output, and a full pasted endpoint URL must not
 * double the path.
 */

import { assert, assertEquals, assertFalse, assertRejects } from "@std/assert";
import {
  extractOpenRouterImagesResponse,
  isOpenRouterImageOnlyModel,
  normalizeOpenRouterBaseUrl,
  openRouterImageGenUrl,
} from "../src/tools/generate-image.ts";

// =============================================================================
// isOpenRouterImageOnlyModel
// =============================================================================

Deno.test("isOpenRouterImageOnlyModel: Flux via Black Forest Labs", () => {
  assert(isOpenRouterImageOnlyModel("black-forest-labs/flux.2-max"));
});

Deno.test("isOpenRouterImageOnlyModel: bare flux id", () => {
  assert(isOpenRouterImageOnlyModel("flux.2-max"));
});

Deno.test("isOpenRouterImageOnlyModel: Recraft", () => {
  assert(isOpenRouterImageOnlyModel("recraft/recraft-v3"));
});

Deno.test("isOpenRouterImageOnlyModel: Seedream", () => {
  assert(isOpenRouterImageOnlyModel("bytedance/seedream-v3"));
});

Deno.test("isOpenRouterImageOnlyModel: Grok Imagine", () => {
  assert(isOpenRouterImageOnlyModel("x-ai/grok-imagine-1"));
});

Deno.test("isOpenRouterImageOnlyModel: GPT-image is text-capable", () => {
  assertFalse(isOpenRouterImageOnlyModel("openai/gpt-5-image"));
});

Deno.test("isOpenRouterImageOnlyModel: case-insensitive", () => {
  assert(isOpenRouterImageOnlyModel("Black-Forest-Labs/Flux.2-Max"));
});

// =============================================================================
// normalizeOpenRouterBaseUrl
// =============================================================================

Deno.test("normalizeOpenRouterBaseUrl: bare api base unchanged", () => {
  assertEquals(
    normalizeOpenRouterBaseUrl("https://openrouter.ai/api/v1"),
    "https://openrouter.ai/api/v1",
  );
});

Deno.test("normalizeOpenRouterBaseUrl: trailing slash stripped", () => {
  assertEquals(
    normalizeOpenRouterBaseUrl("https://openrouter.ai/api/v1/"),
    "https://openrouter.ai/api/v1",
  );
});

Deno.test("normalizeOpenRouterBaseUrl: full endpoint collapsed to base", () => {
  assertEquals(
    normalizeOpenRouterBaseUrl(
      "https://openrouter.ai/api/v1/chat/completions",
    ),
    "https://openrouter.ai/api/v1",
  );
});

Deno.test("normalizeOpenRouterBaseUrl: full endpoint with trailing slash", () => {
  assertEquals(
    normalizeOpenRouterBaseUrl(
      "https://openrouter.ai/api/v1/chat/completions/",
    ),
    "https://openrouter.ai/api/v1",
  );
});

Deno.test("normalizeOpenRouterBaseUrl: whitespace trimmed", () => {
  assertEquals(
    normalizeOpenRouterBaseUrl("  https://openrouter.ai/api/v1  "),
    "https://openrouter.ai/api/v1",
  );
});

Deno.test("normalizeOpenRouterBaseUrl: pasted images endpoint collapsed to base", () => {
  assertEquals(
    normalizeOpenRouterBaseUrl("https://openrouter.ai/api/v1/images"),
    "https://openrouter.ai/api/v1",
  );
  assertEquals(
    normalizeOpenRouterBaseUrl(
      "https://openrouter.ai/api/v1/images/generations/",
    ),
    "https://openrouter.ai/api/v1",
  );
});

// =============================================================================
// openRouterImageGenUrl — per-generator endpoint toggle
// =============================================================================

Deno.test("openRouterImageGenUrl: default is chat completions", () => {
  assertEquals(
    openRouterImageGenUrl("", false),
    "https://openrouter.ai/api/v1/chat/completions",
  );
});

Deno.test("openRouterImageGenUrl: toggle routes to /images", () => {
  assertEquals(
    openRouterImageGenUrl("", true),
    "https://openrouter.ai/api/v1/images",
  );
});

Deno.test("openRouterImageGenUrl: custom base honoured, pasted endpoint not doubled", () => {
  assertEquals(
    openRouterImageGenUrl(
      "https://proxy.example/api/v1/chat/completions",
      true,
    ),
    "https://proxy.example/api/v1/images",
  );
  assertEquals(
    openRouterImageGenUrl("https://proxy.example/api/v1/images/", false),
    "https://proxy.example/api/v1/chat/completions",
  );
});

// =============================================================================
// extractOpenRouterImagesResponse
// =============================================================================

Deno.test("extractOpenRouterImagesResponse: b64_json with media_type", async () => {
  assertEquals(
    await extractOpenRouterImagesResponse({
      data: [{ b64_json: "AAAA", media_type: "image/webp" }],
      usage: { cost: 0.01 },
    }),
    { imageData: "AAAA", mediaType: "image/webp" },
  );
});

Deno.test("extractOpenRouterImagesResponse: media_type absent defaults to png", async () => {
  assertEquals(
    await extractOpenRouterImagesResponse({ data: [{ b64_json: "BBBB" }] }),
    { imageData: "BBBB", mediaType: "image/png" },
  );
});

Deno.test("extractOpenRouterImagesResponse: empty data is an error", async () => {
  await assertRejects(
    () => extractOpenRouterImagesResponse({ data: [] }),
    Error,
    "no data entries",
  );
  await assertRejects(
    () => extractOpenRouterImagesResponse({}),
    Error,
    "no data entries",
  );
});

Deno.test("extractOpenRouterImagesResponse: entry without image is an error", async () => {
  await assertRejects(
    () => extractOpenRouterImagesResponse({ data: [{ revised_prompt: "x" }] }),
    Error,
    "neither b64_json nor url",
  );
});
