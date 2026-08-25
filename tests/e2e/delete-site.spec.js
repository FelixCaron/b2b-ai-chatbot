import { test, expect } from './support/test.js';

test.describe('Delete website flow', () => {
  test('a failed deletion shows the real error and keeps the site (no "ghost" site)', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByText('acme.example.com')).toBeVisible();

    mock.state.deleteSiteShouldFail = true;

    await page.getByRole('button', { name: /^Delete$/ }).first().click();
    await expect(page.getByRole('heading', { name: /Delete Website\?/i })).toBeVisible();

    await page.getByRole('button', { name: /Delete Permanently/i }).click();

    // Regression test for the old behavior: on a server error, the app used
    // to silently swallow it and remove the site from the UI anyway (a
    // "ghost" site — gone on screen, still in the database). It must now
    // surface the real error and leave the site in place.
    await expect(page.getByText(/Simulated deletion failure for test coverage/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Retry Delete/i })).toBeVisible();

    // The site must still be present, both in the backend and in the UI.
    expect(mock.db.sites.some((s) => s.domain === 'acme.example.com')).toBe(true);
    await expect(page.getByRole('heading', { name: /Delete Website\?/i })).toBeVisible();
    await page.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(page.getByText('acme.example.com')).toBeVisible();
  });

  test('a successful deletion removes the site and returns to onboarding when it was the only site', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByText('acme.example.com')).toBeVisible();

    await page.getByRole('button', { name: /^Delete$/ }).first().click();
    await expect(page.getByRole('heading', { name: /Delete Website\?/i })).toBeVisible();
    await page.getByRole('button', { name: /Delete Permanently/i }).click();

    // Modal closes, backend reflects the deletion, and with zero sites left
    // the UI falls back to the onboarding hero.
    await expect(page.getByRole('heading', { name: /Delete Website\?/i })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: /Deploy Your AI Assistant/i })).toBeVisible();
    expect(mock.db.sites.some((s) => s.domain === 'acme.example.com')).toBe(false);
    // Cascade-deleted children too.
    expect(mock.db.documents.length).toBe(0);
    expect(mock.db.site_summaries.length).toBe(0);
    expect(mock.db.leads.length).toBe(0);
  });

  test('retrying after a fixed failure succeeds', async ({ page, mock }) => {
    await page.goto('/');
    mock.state.deleteSiteShouldFail = true;

    await page.getByRole('button', { name: /^Delete$/ }).first().click();
    await page.getByRole('button', { name: /Delete Permanently/i }).click();
    await expect(page.getByRole('button', { name: /Retry Delete/i })).toBeVisible();

    mock.state.deleteSiteShouldFail = false;
    await page.getByRole('button', { name: /Retry Delete/i }).click();

    await expect(page.getByRole('heading', { name: /Delete Website\?/i })).not.toBeVisible();
    expect(mock.db.sites.length).toBe(0);
  });
});
