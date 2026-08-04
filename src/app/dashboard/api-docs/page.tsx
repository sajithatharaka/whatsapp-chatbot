import Link from 'next/link';

import { EndpointCard } from '@/components/api-docs/EndpointCard';
import { API_ENDPOINTS } from '@/lib/api-docs/apiEndpoints';

export default function ApiDocsPage() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://<your-project-ref>.supabase.co';

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">API Documentation</h1>
        <p className="text-sm text-muted-foreground">
          How to wire a WhatsApp Business number into this assistant.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-semibold">Connecting a WhatsApp number</h2>
        <p className="text-sm text-muted-foreground">
          The <code>chat</code> endpoint below is <strong>not</strong> a drop-in Twilio or Meta
          Cloud API webhook URL — WhatsApp providers don’t speak this endpoint’s request format
          directly. Instead, you point your WhatsApp provider’s webhook at your own small relay (a
          Twilio Function, a Meta Cloud API webhook handler, or any server you control), and that
          relay does three things:
        </p>
        <ol className="list-inside list-decimal text-sm text-muted-foreground">
          <li>Receives the inbound WhatsApp webhook from your provider (Twilio/Meta/etc.).</li>
          <li>
            Extracts the sender’s phone number and message text, and calls{' '}
            <code>POST {baseUrl}/functions/v1/chat</code> with{' '}
            <code>{'{ phone, message, name? }'}</code>.
          </li>
          <li>
            Takes the <code>reply</code> field from the response and sends it back out via your
            provider’s WhatsApp send API.
          </li>
        </ol>
        <p className="text-sm text-muted-foreground">
          Every reply is grounded in whatever is currently in the{' '}
          <Link href="/dashboard/knowledge" className="underline">
            Knowledge Base
          </Link>{' '}
          — if nothing relevant is found, the assistant returns its configured fallback message
          instead of guessing.
        </p>
      </section>

      <div className="flex flex-col gap-4">
        {API_ENDPOINTS.map((endpoint) => (
          <EndpointCard key={endpoint.id} endpoint={endpoint} baseUrl={baseUrl} />
        ))}
      </div>
    </div>
  );
}
