// Used to detect whether re-ingested content actually changed, so /ingest
// can skip re-embedding unchanged documents (BRD §21: knowledge updates
// without downtime — a no-op update touches nothing).
export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
