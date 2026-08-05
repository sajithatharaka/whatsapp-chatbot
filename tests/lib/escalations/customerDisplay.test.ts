import { describe, expect, it } from 'vitest';

import { channelLabel, customerDisplayName } from '../../../src/lib/escalations/customerDisplay';
import type { EscalationCustomer } from '../../../src/lib/escalations/types';

function customer(overrides: Partial<EscalationCustomer> = {}): EscalationCustomer {
  return { id: 'customer_1', phone: null, name: null, channel: 'whatsapp', ...overrides };
}

describe('customerDisplayName', () => {
  it('prefers the name when one is set', () => {
    expect(customerDisplayName(customer({ name: 'Alice', phone: '+15551234567' }))).toBe('Alice');
  });

  it('falls back to the phone number when there is no name', () => {
    expect(customerDisplayName(customer({ phone: '+15551234567' }))).toBe('+15551234567');
  });

  it('falls back to "Website visitor" when there is neither a name nor a phone', () => {
    expect(customerDisplayName(customer({ channel: 'web' }))).toBe('Website visitor');
  });
});

describe('channelLabel', () => {
  it('labels the web channel as Website', () => {
    expect(channelLabel('web')).toBe('Website');
  });

  it('labels the whatsapp channel as WhatsApp', () => {
    expect(channelLabel('whatsapp')).toBe('WhatsApp');
  });
});
