export interface ApiEndpoint {
  id: string;
  method: 'POST' | 'GET';
  path: string;
  auth: string;
  description: string;
  requestExample: string;
  responseExample: string;
}

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'chat',
    method: 'POST',
    path: '/functions/v1/chat',
    auth: 'apikey / Authorization: Bearer <anon key>',
    description:
      'Send one inbound message on behalf of a WhatsApp contact and get back the assistant’s reply. This is the integration point for your WhatsApp Business number — see the integration guide below for how it fits together.',
    requestExample: JSON.stringify(
      { phone: '+15551234567', message: 'What are your business hours?', name: 'Jordan' },
      null,
      2
    ),
    responseExample: JSON.stringify(
      {
        reply: 'We’re open Mon–Fri, 9am–6pm EST.',
        confidence: 0.87,
        intent: 'knowledge',
        handover: false,
        tool: null,
        sources: ['chunk_1a2b3c'],
      },
      null,
      2
    ),
  },
  {
    id: 'search',
    method: 'POST',
    path: '/functions/v1/search',
    auth: 'apikey / Authorization: Bearer <anon key>',
    description:
      'Run a similarity search over the knowledge base directly, without going through the chat/reply flow. Useful for debugging what the assistant would retrieve for a given question.',
    requestExample: JSON.stringify({ query: 'What are your business hours?', topK: 3 }, null, 2),
    responseExample: JSON.stringify(
      {
        query: 'What are your business hours?',
        topK: 3,
        similarityThreshold: 0.75,
        results: [
          {
            id: 'chunk_1a2b3c',
            document_id: 'doc_9f8e7d',
            chunk_text: 'We’re open…',
            similarity: 0.87,
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'health',
    method: 'GET',
    path: '/functions/v1/health',
    auth: 'None',
    description:
      'Liveness check — confirms the backend and database are reachable. No auth required.',
    requestExample: '(no body)',
    responseExample: JSON.stringify(
      { status: 'ok', timestamp: '2026-08-03T12:00:00.000Z' },
      null,
      2
    ),
  },
];
