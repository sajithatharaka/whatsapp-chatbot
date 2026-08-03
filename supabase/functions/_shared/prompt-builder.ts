import type { AiConfiguration, ConversationTurn, PromptMessage, RetrievedChunk } from './types.ts';

// Only called when at least one chunk cleared the similarity threshold —
// chat/index.ts short-circuits to the fallback message otherwise, so a
// "knowledge" section is never rendered empty and never invites the model
// to answer from outside the provided context.
export function buildMessages(
  config: AiConfiguration,
  summary: string | null,
  recentTurns: ConversationTurn[],
  chunks: RetrievedChunk[],
  userMessage: string
): PromptMessage[] {
  const sections: string[] = [config.system_prompt];

  if (config.business_rules_prompt) {
    sections.push(`Business rules:\n${config.business_rules_prompt}`);
  }

  if (summary) {
    sections.push(`Conversation summary so far:\n${summary}`);
  }

  const knowledgeBlock = chunks
    .map((chunk) => `[chunk_${chunk.id}] ${chunk.chunk_text}`)
    .join('\n\n');
  sections.push(
    `Retrieved knowledge (this is the ONLY information you may use to answer):\n${knowledgeBlock}`
  );

  const messages: PromptMessage[] = [{ role: 'system', content: sections.join('\n\n') }];

  for (const turn of recentTurns) {
    if (turn.role === 'system') continue;
    messages.push({ role: turn.role, content: turn.message });
  }

  messages.push({ role: 'user', content: userMessage });

  return messages;
}
