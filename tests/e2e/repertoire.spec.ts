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
});
