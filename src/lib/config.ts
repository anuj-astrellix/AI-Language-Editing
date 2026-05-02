import { z } from 'zod';

const envSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  STORAGE_BUCKET: z.string().default('local-language-editor'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
  AI_MODEL: z.string().default('gpt-4.1-mini'),
  NEXT_PUBLIC_APP_NAME: z.string().default('AI Language Editor')
});

export type AppEnv = z.infer<typeof envSchema>;

export const env: AppEnv = envSchema.parse({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
  MAX_UPLOAD_MB: process.env.MAX_UPLOAD_MB,
  AI_MODEL: process.env.AI_MODEL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME
});
