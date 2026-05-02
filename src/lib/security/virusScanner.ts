export interface ScanResult {
  clean: boolean;
  reason?: string;
}

// Placeholder interface for integrating ClamAV or external malware scanning services.
export async function scanFileForViruses(_fileBytes: Buffer): Promise<ScanResult> {
  return { clean: true };
}
