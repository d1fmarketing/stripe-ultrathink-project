import { z } from "zod";

const envSchema = z
  .object({
    STRIPE_SECRET: z.string().min(1, "STRIPE_SECRET is required"),
    STRIPE_CLIENT_ID: z.string().min(1, "STRIPE_CLIENT_ID is required"),
    STRIPE_REDIRECT_URI: z.string().min(1, "STRIPE_REDIRECT_URI is required"),
    MERCHANTS_TABLE: z.string().min(1, "MERCHANTS_TABLE is required"),
    CASES_TABLE: z.string().min(1, "CASES_TABLE is required"),
    SUBMISSIONS_TABLE: z.string().min(1, "SUBMISSIONS_TABLE is required"),
    SES_FROM: z.string().min(1, "SES_FROM is required"),
    SFN_ARN: z.string().min(1, "SFN_ARN is required"),
    AUDIT_TABLE: z.string().min(1).optional(),
  })
  .passthrough();

type AppEnv = z.infer<typeof envSchema>;

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const details = result.error.issues
    .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Environment validation failed:\n${details}`);
}

export const env: AppEnv = result.data;
