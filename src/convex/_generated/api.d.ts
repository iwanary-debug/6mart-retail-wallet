/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as dashboard from "../dashboard.js";
import type * as finance from "../finance.js";
import type * as inventory from "../inventory.js";
import type * as lib_guards from "../lib/guards.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_inventoryEngine from "../lib/inventoryEngine.js";
import type * as lib_walletEngine from "../lib/walletEngine.js";
import type * as payments from "../payments.js";
import type * as ppob from "../ppob.js";
import type * as products from "../products.js";
import type * as providers from "../providers.js";
import type * as reports from "../reports.js";
import type * as sales from "../sales.js";
import type * as seed from "../seed.js";
import type * as services from "../services.js";
import type * as settings from "../settings.js";
import type * as students from "../students.js";
import type * as users from "../users.js";
import type * as wallets from "../wallets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  auth: typeof auth;
  dashboard: typeof dashboard;
  finance: typeof finance;
  inventory: typeof inventory;
  "lib/guards": typeof lib_guards;
  "lib/helpers": typeof lib_helpers;
  "lib/inventoryEngine": typeof lib_inventoryEngine;
  "lib/walletEngine": typeof lib_walletEngine;
  payments: typeof payments;
  ppob: typeof ppob;
  products: typeof products;
  providers: typeof providers;
  reports: typeof reports;
  sales: typeof sales;
  seed: typeof seed;
  services: typeof services;
  settings: typeof settings;
  students: typeof students;
  users: typeof users;
  wallets: typeof wallets;
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

export declare const components: {};
