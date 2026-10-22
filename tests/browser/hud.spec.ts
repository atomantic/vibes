import { expect, test, type Page } from '@playwright/test';

async function enterWorld(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () => {
      const hook = (globalThis as typeof globalThis & { __VIBES_TEST__?: { ready?: boolean } })
        .__VIBES_TEST__;
      return hook?.ready === true;
    },
    undefined,
    { timeout: 45_000 },
  );
  await expect(page.getByRole('status')).toHaveText('World ready');
  await page.keyboard.press('Enter');
  await expect(page.locator('.objective-card')).toBeVisible();
}

const hudSelectors = ['.brand-lockup', '.objective-card', '.landmark-compass', '.control-hint'];

async function expectHud(page: Page, visible: boolean): Promise<void> {
  for (const selector of hudSelectors) {
    if (visible) await expect(page.locator(selector)).toBeVisible();
    else await expect(page.locator(selector)).toBeHidden();
  }
}

test('H hides the HUD and Escape restores it before pausing', async ({ page }) => {
  await enterWorld(page);
  await expectHud(page, true);

  await page.keyboard.press('KeyH');
  await expect(page.locator('.announcement')).toHaveText(/HUD hidden/);
  await expectHud(page, false);
  // Live announcements stay in the accessibility tree while hidden.
  await expect(page.locator('.announcement')).toHaveCSS('display', 'block');
  await expect(page.locator('.announcement')).toHaveCSS('width', '1px');
  await expect(page.getByRole('status')).toHaveText('World ready');
  await expect(page.locator('#game-control-instructions')).toContainText('H to hide');

  await page.keyboard.press('Escape');
  await expectHud(page, true);
  await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);

  for (const chord of ['Control+KeyH', 'Alt+KeyH', 'Meta+KeyH']) {
    await page.keyboard.press(chord);
    await expectHud(page, true);
  }

  // F3 cannot flip diagnostics invisibly while the HUD is hidden.
  await page.keyboard.press('KeyH');
  await page.keyboard.press('F3');
  await page.keyboard.press('Escape');
  await expectHud(page, true);
  await expect(page.getByLabel('World diagnostics')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await page.keyboard.press('KeyH');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
});

test('pause-menu control hides the HUD and pausing restores it', async ({ page }) => {
  await enterWorld(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Hide HUD for screenshots/ }).click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);
  await expectHud(page, false);

  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
  });
  await expectHud(page, true);
});

test('H is ignored while typing in a form control', async ({ page }) => {
  await enterWorld(page);
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'hud-test-input';
    document.body.append(input);
    input.focus();
  });
  await page.keyboard.press('KeyH');
  await expectHud(page, true);
  await expect(page.locator('#hud-test-input')).toHaveValue('h');

  await page.evaluate(() => {
    document.getElementById('hud-test-input')?.blur();
  });
  await page.keyboard.press('KeyH');
  await expectHud(page, false);
});
