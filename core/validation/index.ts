import { z } from "zod";

export const PlatformSchema = z.enum(["instagram", "youtube", "tiktok"]);

export const HandleSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^@?[A-Za-z0-9._-]+$/, "Handle must contain only letters, numbers, dots, dashes, or underscores.");

export const ScanRequestSchema = z.object({
  platform: PlatformSchema,
  handle: HandleSchema,
  toolId: z.string().min(1).max(64),
  // Optional per-tool params (e.g. engagement-rate's postCount selector).
  // Kept loose — each tool validates whatever it cares about internally.
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const PlanSchema = z.enum(["monthly", "annual", "one_time"]);
export const RegionSchema = z.enum(["IN", "GLOBAL"]);
// Consumer + API tier plans purchasable via /checkout. Free tier is not
// purchasable — signing up creates a "free" user implicitly.
export const TierSchema = z.enum(["starter", "pro", "scale", "api-starter"]);
// Billing cycle for tier-based subscriptions.
export const CycleSchema = z.enum(["monthly", "annual"]);

export const CheckoutRequestSchema = z.object({
  // Either 'plan' (legacy: monthly / annual / one_time) OR 'tier'
  // (new: starter / pro / scale / api-starter, with optional cycle).
  // Route accepts both during rollout.
  plan: PlanSchema.optional(),
  tier: TierSchema.optional(),
  cycle: CycleSchema.optional(),   // defaults to monthly if omitted
  scanKey: z.string().min(1).optional(),
});

export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
