import { test, expect } from '@playwright/test';

test.describe('RepertoireLab kernflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('app navigeert tussen overzicht, repertoire en training', async ({ page }) => {
    await expect(page.getByText('RepertoireLab', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: /Mijn repertoire/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Mijn repertoires' })).toBeVisible();
    await page.getByRole('button', { name: /Zettraining/ }).first().click();
    await expect(page.getByText(/Zettraining/).first()).toBeVisible();
  });

  test('repertoire aanmaken en hernoemen', async ({ page }) => {
    await page.getByRole('button', { name: /Mijn repertoire/ }).first().click();
    await page.getByLabel('Naam nieuw repertoire').fill('Schots — wit');
    await page.getByRole('button', { name: /Repertoire aanmaken/ }).click();
    await expect(page.getByLabel('Actief repertoire')).toContainText('Schots — wit');
    await page.getByLabel('Nieuwe naam voor repertoire').fill('Schots hoofdrepertoire');
    await page.getByRole('button', { name: 'Naam wijzigen' }).click();
    await expect(page.getByLabel('Actief repertoire')).toContainText('Schots hoofdrepertoire');
  });

  test('backup-export start JSON-download', async ({ page }) => {
    await page.getByRole('button', { name: /Mijn repertoire/ }).first().click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Volledige back-up exporteren/ }).click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/repertoirelab-back-up-.*\.json/);
  });

  test('repertoirebeheer blijft bruikbaar op mobiel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Mijn repertoire/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Mijn repertoires' })).toBeVisible();
    await expect(page.getByLabel('Naam nieuw repertoire')).toBeVisible();
    await expect(page.getByRole('button', { name: /Volledige back-up exporteren/ })).toBeVisible();
  });

  test('antwoord blijft verborgen tot alle eigen zetten op het bord zijn gespeeld', async ({ page }) => {
    const repertoire = { id: 'rep-1', name: 'Schots — wit', color: 'Wit', createdAt: Date.now() };
    const line = {
      id: 'line-1',
      repertoireId: 'rep-1',
      name: 'Schotse basislijn',
      moves: '1. e4 e5 2. Nf3 Nc6 *',
      color: 'Wit',
      tags: [],
      note: 'Ontwikkel snel en controleer het centrum.',
      due: 0,
      seen: 0,
      intervalDays: 0,
    };
    await page.evaluate(({ repertoire, line }) => {
      localStorage.setItem('repertoirelab-repertoires-v1', JSON.stringify([repertoire]));
      localStorage.setItem('repertoirelab-active-repertoire-v1', repertoire.id);
      localStorage.setItem('repertoirelab-lines-v1', JSON.stringify([line]));
    }, { repertoire, line });
    await page.reload();
    await page.getByRole('button', { name: /Zettraining/ }).first().click();

    const revealButton = page.locator('button.reveal-btn');
    await expect(revealButton).toBeDisabled();
    await expect(page.locator('.answer-box')).toHaveCount(0);

    // A legal but incorrect move must not unlock the answer.
    await page.getByRole('button', { name: 'e2', exact: true }).click();
    await page.getByRole('button', { name: 'e3', exact: true }).click();
    await expect(revealButton).toBeDisabled();
    await expect(page.locator('.answer-box')).toHaveCount(0);

    // Play White's repertoire moves; Black's replies are played automatically.
    await page.getByRole('button', { name: 'e2', exact: true }).click();
    await page.getByRole('button', { name: 'e4', exact: true }).click();
    await expect(revealButton).toBeDisabled();
    await page.getByRole('button', { name: 'g1', exact: true }).click();
    await page.getByRole('button', { name: 'f3', exact: true }).click();

    await expect(revealButton).toBeEnabled();
    await expect(page.locator('.answer-box')).toBeVisible();
    await revealButton.click();
    await expect(page.locator('.answer-box')).toHaveCount(0);
    await revealButton.click();
    await expect(page.locator('.answer-box')).toBeVisible();
  });
});
