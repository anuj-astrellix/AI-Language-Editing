import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

export async function ensureDirectory(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

export async function writeBuffer(path: string, data: Buffer): Promise<void> {
  await ensureDirectory(dirname(path));
  await fs.writeFile(path, data);
}
