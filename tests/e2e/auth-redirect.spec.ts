import { test, expect } from '@playwright/test';

test.describe('unauthenticated access', () => {
  test('visiting /dashboard/knowledge redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/knowledge');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('visiting / redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});
