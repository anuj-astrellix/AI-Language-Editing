import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { ensureDirectory } from '@/lib/utils/file';

const UPLOAD_DIR = join(process.cwd(), 'storage/uploads');
const OUTPUT_DIR = join(process.cwd(), 'storage/outputs');

async function resolvePath(kind: 'upload' | 'output', fileName: string): Promise<string> {
  const dir = kind === 'upload' ? UPLOAD_DIR : OUTPUT_DIR;
  await ensureDirectory(dir);
  return join(dir, fileName);
}

export async function storeUpload(fileName: string, data: Buffer): Promise<string> {
  const storageName = `${randomUUID()}-${fileName.replace(/\s+/g, '_')}`;
  const path = await resolvePath('upload', storageName);
  await fs.writeFile(path, data);
  return path;
}

export async function storeGenerated(fileName: string, data: Buffer): Promise<string> {
  const storageName = `${randomUUID()}-${fileName.replace(/\s+/g, '_')}`;
  const path = await resolvePath('output', storageName);
  await fs.writeFile(path, data);
  return path;
}

export async function readStoredFile(path: string): Promise<Buffer> {
  return fs.readFile(path);
}
