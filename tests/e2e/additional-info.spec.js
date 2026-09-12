import { test, expect } from './support/test.js';

// The knowledge an owner types in by hand — the price nobody publishes, the
// answer to whatever a visitor asked that the website doesn't cover. It is
// stored as ordinary `documents` chunks so the assistant can search it like
// any crawled page, which means it is several rows that all share one
// created_at. Ordering them is therefore chunk_index's job (migration
// 20260909060000); without it the owner's own text comes back shuffled and,
// because saving rewrites the whole document from what was read, the shuffle
// gets written back as the new truth.
test.describe('Additional Information', () => {
  /** The Additional Information card itself — the dashboard has other cards
   *  with their own textarea and Save button, so every assertion below is
   *  scoped to the innermost element holding this card's heading. */
  const openCard = async (page) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Show Settings/i }).click();
    await expect(page.getByRole('heading', { name: /Additional Information/i })).toBeVisible();
    return page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: /Additional Information/i }) })
      .filter({ has: page.locator('textarea') })
      .last();
  };

  test("reads the owner's notes back in the order they were written", async ({ page, mock }) => {
    const card = await openCard(page);

    // Fixture rows are stored 2, 0, 1 on purpose (see mock-backend.js).
    const editor = card.locator('textarea');
    await expect(editor).toHaveValue(
      [
        'First: we reimburse insurance claims within 30 days.',
        'Second: delivery to the South Shore runs Tuesdays and Thursdays.',
        'Third: we close for two weeks at the end of July.',
      ].join('\n\n')
    );

    // And the indexer's own bookkeeping line is not the owner's to maintain.
    await expect(editor).not.toHaveValue(/Source URL/);
  });

  test('a failed read never lets the editor overwrite what it could not load', async ({ page, mock }) => {
    // One transient failure on the notes read used to be indistinguishable
    // from "you have written nothing yet" — an empty box the owner could
    // type into and Save, replacing everything they actually had.
    await page.route('**/rest/v1/documents*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) })
    );

    const card = await openCard(page);

    await expect(card.getByText(/Could not read what you saved here/i)).toBeVisible();
    await expect(card.locator('textarea')).toBeDisabled();
    await expect(card.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });

});
