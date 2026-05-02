import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

const RUNTIME_SECRETS_PATH = join(process.cwd(), 'storage/runtime-secrets.json');

interface RuntimeSecrets {
  openAiApiKey?: string;
}

async function ensureSecretsFile(): Promise<void> {
  await fs.mkdir(dirname(RUNTIME_SECRETS_PATH), { recursive: true });

  try {
    await fs.access(RUNTIME_SECRETS_PATH);
  } catch {
    await fs.writeFile(RUNTIME_SECRETS_PATH, JSON.stringify({}, null, 2), 'utf-8');
  }
}

async function readRuntimeSecrets(): Promise<RuntimeSecrets> {
  await ensureSecretsFile();
  const raw = await fs.readFile(RUNTIME_SECRETS_PATH, 'utf-8');

  try {
    const parsed = JSON.parse(raw) as RuntimeSecrets;
    return parsed ?? {};
  } catch {
    return {};
  }
}

async function writeRuntimeSecrets(input: RuntimeSecrets): Promise<void> {
  await ensureSecretsFile();
  await fs.writeFile(RUNTIME_SECRETS_PATH, JSON.stringify(input, null, 2), 'utf-8');
}

export async function setRuntimeOpenAiApiKey(apiKey: string): Promise<void> {
  const cleaned = apiKey.trim();
  if (!cleaned) {
    throw new Error('API key cannot be empty');
  }

  const current = await readRuntimeSecrets();
  await writeRuntimeSecrets({
    ...current,
    openAiApiKey: cleaned
  });
}

export async function clearRuntimeOpenAiApiKey(): Promise<void> {
  const current = await readRuntimeSecrets();
  delete current.openAiApiKey;
  await writeRuntimeSecrets(current);
}

export async function getConfiguredOpenAiApiKey(): Promise<string | null> {
  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) {
    return envKey;
  }

  const runtime = await readRuntimeSecrets();
  const runtimeKey = runtime.openAiApiKey?.trim();
  return runtimeKey && runtimeKey.length > 0 ? runtimeKey : null;
}

export async function getOpenAiApiKeySource(): Promise<'env' | 'runtime' | 'none'> {
  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) {
    return 'env';
  }

  const runtime = await readRuntimeSecrets();
  return runtime.openAiApiKey?.trim() ? 'runtime' : 'none';
}

export async function hasOpenAiApiKeyConfigured(): Promise<boolean> {
  return (await getOpenAiApiKeySource()) !== 'none';
}
