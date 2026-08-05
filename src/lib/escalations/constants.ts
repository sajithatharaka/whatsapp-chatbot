import type { EscalationStatus } from '@/lib/escalations/types';

export const VALID_STATUSES: EscalationStatus[] = ['needs_attention', 'in_progress', 'responded'];
export const DEFAULT_STATUSES: EscalationStatus[] = ['needs_attention', 'in_progress'];
