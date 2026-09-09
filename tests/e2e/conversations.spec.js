import { test, expect, trackConsoleErrors, clickGuestNavButton } from './support/test.js';

// The chat history was being written to `messages` on every visitor exchange
// long before anything read it back. These cover the read path: rows in,
// conversations out, and a transcript an owner can actually follow.
test.describe('Conversations', () => {
  test('groups a tenant\'s messages into conversations, newest first', async ({ page, mock }) => {
    const consoleTracker = trackConsoleErrors(page);
    await page.goto('/');
    // Wait for the dashboard to render before reaching for the header: below
    // the sm breakpoint the nav lives behind a hamburger that isn't mounted
    // yet on first paint.
    await expect(page.getByRole('heading', { name: 'acme.example.com' })).toBeVisible();

    await clickGuestNavButton(page, /^Conversations/i);
    await expect(page.getByRole('heading', { name: /^Conversations$/i })).toBeVisible();

    // Two sessions in the fixture, so two conversations — each labelled with
    // the question the visitor opened on, not its session id.
    await expect(page.getByRole('button', { name: /How much is an initial consultation/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Do you offer same-day delivery/i })).toBeVisible();

    consoleTracker.assertNone();
  });

  test('opening a conversation shows both sides of it, in the order it was said', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'acme.example.com' })).toBeVisible();
    await clickGuestNavButton(page, /^Conversations/i);

    // The multi-turn conversation, so the transcript has to hold up past the
    // opening question: both visitor turns and both answers, in order.
    await page.getByRole('button', { name: /Do you offer same-day delivery/i }).click();
    await expect(page.getByText('Yes — orders placed before 2pm ship the same day.')).toBeVisible();
    await expect(page.getByText('And on Saturdays?')).toBeVisible();
    await expect(page.getByText('Saturday orders go out on Monday morning.')).toBeVisible();
  });

  test('flags the conversations the assistant could not answer, and filters to them', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'acme.example.com' })).toBeVisible();
    await clickGuestNavButton(page, /^Conversations/i);

    // One of the three fixture conversations has an answer the site had no
    // content for, so it is the only one carrying the badge.
    const insurance = page.getByRole('button', { name: /Do you accept insurance reimbursements/i });
    await expect(insurance).toBeVisible();
    await expect(insurance.getByText(/Unanswered/i)).toBeVisible();

    // Narrowing to it hides the two that were answered fine.
    await page.getByRole('button', { name: /couldn't be answered/i }).click();
    await expect(insurance).toBeVisible();
    await expect(page.getByRole('button', { name: /Do you offer same-day delivery/i })).toHaveCount(0);

    // And the transcript says why, in terms the owner can act on — the
    // assistant's own missing_info note, not just a generic line.
    await insurance.click();
    await expect(page.getByText(/Insurance reimbursement policy/i)).toBeVisible();
  });

  test('says which page a conversation started on', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'acme.example.com' })).toBeVisible();
    await clickGuestNavButton(page, /^Conversations/i);

    // The delivery question was asked from /shipping; the insurance one from
    // the site root, which reads as "Home page" rather than a bare slash.
    await expect(page.getByRole('button', { name: /Do you offer same-day delivery/i })).toContainText('/shipping');
    await expect(page.getByRole('button', { name: /Do you accept insurance reimbursements/i })).toContainText('Home page');
  });

  test('search filters conversations by what was actually said', async ({ page, mock }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'acme.example.com' })).toBeVisible();
    await clickGuestNavButton(page, /^Conversations/i);

    await page.getByPlaceholder(/Search what was said/i).fill('Saturday');

    // "Saturdays" appears only inside the delivery conversation, so the
    // consultation one drops out of the list.
    await expect(page.getByRole('button', { name: /Do you offer same-day delivery/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /How much is an initial consultation/i })).toHaveCount(0);
  });
});
