/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as developmentEmail from "../developmentEmail.js";
import type * as email from "../email.js";
import type * as env from "../env.js";
import type * as envDefinition from "../envDefinition.js";
import type * as http from "../http.js";
import type * as lib_localDevelopment from "../lib/localDevelopment.js";
import type * as migrations from "../migrations.js";
import type * as tracing from "../tracing.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  developmentEmail: typeof developmentEmail;
  email: typeof email;
  env: typeof env;
  envDefinition: typeof envDefinition;
  http: typeof http;
  "lib/localDevelopment": typeof lib_localDevelopment;
  migrations: typeof migrations;
  tracing: typeof tracing;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  posthog: import("@posthog/convex/_generated/component.js").ComponentApi<"posthog">;
};
