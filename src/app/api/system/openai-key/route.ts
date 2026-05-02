import { z } from 'zod';

import { fail, ok } from '@/lib/api/responses';
import {
  clearRuntimeOpenAiApiKey,
  getOpenAiApiKeySource,
  hasOpenAiApiKeyConfigured,
  setRuntimeOpenAiApiKey
} from '@/lib/server/runtimeSecrets';

const setKeySchema = z.object({
  apiKey: z.string().trim().min(20)
});

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const source = await getOpenAiApiKeySource();
    const configured = await hasOpenAiApiKeyConfigured();

    return ok({
      configured,
      source,
      message: configured
        ? source === 'env'
          ? 'OpenAI API key loaded from environment variables.'
          : 'OpenAI API key loaded from runtime settings.'
        : 'OPENAI_API_KEY is missing. Add it in .env before starting an AI editing job.'
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to read key status', 500);
  }
}

export async function POST(request: Request) {
  try {
    const payload = setKeySchema.parse(await request.json());
    await setRuntimeOpenAiApiKey(payload.apiKey);

    return ok({
      configured: true,
      source: 'runtime',
      message: 'OpenAI API key saved to runtime settings.'
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to save key', 400);
  }
}

export async function DELETE() {
  try {
    await clearRuntimeOpenAiApiKey();
    const source = await getOpenAiApiKeySource();
    const configured = await hasOpenAiApiKeyConfigured();

    return ok({
      configured,
      source,
      message: configured
        ? 'Runtime key removed. Environment key is still active.'
        : 'Runtime key removed. No OpenAI key configured now.'
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to remove key', 500);
  }
}
