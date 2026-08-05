import type { AiConfiguration, ConversationTurn, PromptMessage, RetrievedChunk } from './types.ts';

// The model has no clock of its own, so questions like "are you open today"
// silently fail without this — inject the current day/date/time explicitly
// rather than relying on the model to infer or guess it.
function formatCurrentDateTime(now: Date, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return `${formatted} (${timeZone})`;
}

// Only called when at least one chunk cleared the similarity threshold —
// chat/index.ts short-circuits to the fallback message otherwise, so a
// "knowledge" section is never rendered empty and never invites the model
// to answer from outside the provided context.
export function buildMessages(
  config: AiConfiguration,
  summary: string | null,
  recentTurns: ConversationTurn[],
  chunks: RetrievedChunk[],
  userMessage: string,
  now: Date = new Date()
): PromptMessage[] {
  const sections: string[] = [config.system_prompt];

  sections.push(
    `Current date and time: ${formatCurrentDateTime(now, config.timezone)}. ` +
      'Use this silently to work out the current day of the week and to answer any question ' +
      "about today's date or whether the business is currently open, based on the hours in " +
      "the retrieved knowledge below. Never say you don't know what day it is. Give the " +
      'answer directly (e.g. "Yes, we\'re open until 5pm today") — do not narrate how you ' +
      'figured out the day or date, just state the conclusion like a person who already knows it.'
  );

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
