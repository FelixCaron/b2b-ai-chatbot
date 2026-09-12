import { test, expect, trackConsoleErrors, clickGuestNavButton } from './support/test.js';

// The dashboard's answer to "is this thing working?". The numbers come from
// live queries rather than props, so these cover the read path as much as the
// layout.
test.describe('Assistant health', () => {
  test.describe('before anyone has used the assistant', () => {
    // No messages at all: the numbers would all be zero and would tell the
    // owner nothing, so the dashboard shows the setup steps instead.
    test.use({ mockOverrides: { db: { messages: [] } } });

    test('shows the setup roadmap instead of statistics', async ({ page, mock }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'acme.example.com' })).toBeVisible();

      // Step 3 names whatever is actually left to do — this fixture has
      // never been seen on its own domain, so it is "add it to your website"
      // (the same thing the hero card's primary button offers).
      await expect(page.getByText('Add it to your website', { exact: true })).toBeVisible();
      await expect(page.getByText(/conversations this week/i)).toHaveCount(0);
    });
  });

  test('reports pages, conversations this week, leads and unanswered questions', async ({ page, mock }) => {
    const consoleTracker = trackConsoleErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'acme.example.com' })).toBeVisible();

    // Three fixture sessions, all inside the seven-day window. The roadmap
    // steps it replaces are gone.
    await expect(page.getByText(/Ask it questions before your visitors do/i)).toHaveCount(0);

    await expect(page.getByText(/conversations this week/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /3\s*conversations this week/i })).toBeVisible();

    // One lead in the fixture, and one answer the site had no content for.
    await expect(page.getByRole('button', { name: /1\s*lead captured/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /1\s*unanswered this week/i })).toBeVisible();

    consoleTracker.assertNone();
  });

  test('the unanswered call to action opens Conversations', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'acme.example.com' })).toBeVisible();

    await page.getByRole('button', { name: /asked something your website doesn/i }).click();
    await expect(page.getByRole('heading', { name: /^Conversations$/i })).toBeVisible();
  });
});
