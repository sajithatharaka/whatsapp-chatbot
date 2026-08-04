import { CopyCodeButton } from '@/components/api-docs/CopyCodeButton';
import type { ApiEndpoint } from '@/lib/api-docs/apiEndpoints';

export function EndpointCard({ endpoint, baseUrl }: { endpoint: ApiEndpoint; baseUrl: string }) {
  const curl =
    endpoint.method === 'GET'
      ? `curl "${baseUrl}${endpoint.path}"`
      : `curl -X POST "${baseUrl}${endpoint.path}" \\\n  -H "apikey: <anon key>" \\\n  -H "Authorization: Bearer <anon key>" \\\n  -H "Content-Type: application/json" \\\n  -d '${endpoint.requestExample.replace(/\n\s*/g, ' ')}'`;

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border p-4"
      data-testid={`api-docs-endpoint-${endpoint.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
          {endpoint.method}
        </span>
        <code className="text-sm">{endpoint.path}</code>
      </div>
      <p className="text-sm text-muted-foreground">{endpoint.description}</p>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">Auth:</span> {endpoint.auth}
      </p>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Example request</p>
          <CopyCodeButton text={curl} endpointId={endpoint.id} />
        </div>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          <code>{curl}</code>
        </pre>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Example response</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          <code>{endpoint.responseExample}</code>
        </pre>
      </div>
    </section>
  );
}
