/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/knowledge/doc_1',
}));

import { SidebarNav } from '../../../src/components/navigation/SidebarNav';

describe('SidebarNav', () => {
  it('highlights the Knowledge Base link as active for a nested knowledge path', () => {
    render(<SidebarNav />);

    const knowledgeLink = screen.getByTestId('sidebar-nav-knowledge-base-link');
    const apiDocsLink = screen.getByTestId('sidebar-nav-api-docs-link');

    expect(knowledgeLink.className.split(' ')).toContain('bg-accent');
    expect(apiDocsLink.className.split(' ')).not.toContain('bg-accent');
  });

  it('renders exactly the two expected nav items', () => {
    render(<SidebarNav />);

    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    expect(screen.getByText('API Docs')).toBeInTheDocument();
  });
});
