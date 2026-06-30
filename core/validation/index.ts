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
});

export const PlanSchema = z.enum(["monthly", "annual", "one_time"]);
export const RegionSchema = z.enum(["IN", "GLOBAL"]);

export const CheckoutRequestSchema = z.object({
  plan: PlanSchema,
  scanKey: z.string().min(1).optional(),
});

export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
