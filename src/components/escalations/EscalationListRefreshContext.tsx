'use client';

import { createContext, useContext } from 'react';

interface EscalationListRefresh {
  bump: () => void;
}

const EscalationListRefreshContext = createContext<EscalationListRefresh>({ bump: () => {} });

export const EscalationListRefreshProvider = EscalationListRefreshContext.Provider;

export function useEscalationListRefresh(): EscalationListRefresh {
  return useContext(EscalationListRefreshContext);
}
