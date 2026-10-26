// End-to-end test of the ERP link (M8 part 1) against the demo ERP on 127.0.0.1: set it up, pull the stock through
// the column mapping, pick a stock item for a device (one undo step), preview the reservation request and send it,
// and see the reserved quantity the ERP set after the automatic pull.
import { test } from '@playwright/test';
import { expect, launch, tab } from './app';

test('ERP link: demo ERP, pull stock, pick for a device, send a reservation, undo', async () => {
  const { page, close } = await launch();
  try {
    await page.getByTestId('samples').selectOption('conveyor');
    const messages = page.getByRole('region', { name: 'Messages' });

    // ERP settings: the demo ERP fills the addresses; Test reads the first page and lists the ERP's field names.
    await tab(page, 'reports');
    await page.getByTestId('rb-erp').click();
    await page.getByTestId('erp-demo').click();
    await expect(page.getByTestId('erp-demo-on')).toBeVisible();
    await expect(page.getByTestId('erp-items-url')).toHaveValue(/^http:\/\/127\.0\.0\.1:\d+\/odata\/Items$/);
    await page.getByTestId('erp-test').click();
    await expect(page.getByTestId('erp-test-result')).toContainText('itemNo');
    await expect(page.getByTestId('erp-test-result')).toContainText('inventory.onHand');

    // Pull: every page; the mapping wizard guesses the ERP's camelCase and nested fields.
    await page.getByTestId('erp-pull').click();
    await expect(page.getByTestId('wh-wizard')).toBeVisible();
    await expect(page.getByTestId('wh-map-code')).toHaveValue('itemNo');
    await expect(page.getByTestId('wh-map-onHand')).toHaveValue('inventory.onHand');
    await expect(page.getByTestId('wh-map-reserved')).toHaveValue('inventory.reserved');
    await page.getByTestId('wh-import').click();
    await expect(page.getByTestId('wh-table').locator('tbody tr')).toHaveCount(20);
    await expect(page.getByTestId('wh-erp-host')).toContainText('Demo ERP');
    await page.keyboard.press('Escape');

    // Pick from the warehouse for the conveyor motor: the label roll has no library part, so it comes in as an ERP item.
    await page.getByTestId('page-5').click();
    await page.keyboard.press('f');
    const canvas = page.getByTestId('page-canvas');
    const b = (await canvas.boundingBox())!;
    const zoom = Number(/Zoom\s+(\d+)\s*%/.exec(await page.locator('body').innerText())![1]) / 100;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2 + (234 - 148.5) * zoom);
    await expect(page.getByTestId('device-section')).toContainText('+DS-M1');
    await page.getByTestId('device-pick-warehouse').click();
    await expect(page.getByTestId('wh-focus')).toContainText('+DS-M1');
    const label = page.getByTestId('wh-table').locator('tbody tr', { hasText: 'LABEL-ROLL-WHITE' });
    await label.getByTestId('wh-use').click();
    await expect(messages).toContainText('LABEL-ROLL-WHITE assigned to +DS-M1');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('device-parts')).toContainText('LABEL-ROLL-WHITE');

    // The reservation request: previewed with where it comes from, sent only on Send; the ERP answers with its reference.
    await tab(page, 'reports');
    await page.getByTestId('rb-reserve').click();
    const res = page.getByTestId('res-table');
    const line = res.locator('tbody tr', { hasText: 'LABEL-ROLL-WHITE' });
    await expect(line).toContainText('+DS-M1');
    await expect(line).toContainText('Main E-01-01: 1');
    await page.getByTestId('res-send').click();
    await expect(page.getByTestId('res-sent')).toBeVisible();
    await expect(messages).toContainText('Reservation request sent to the ERP: RES-0001');
    await page.keyboard.press('Escape');

    // The stock was pulled again: the ERP raised "reserved" by what the request took.
    await page.getByTestId('warehouse').click();
    const after = page.getByTestId('wh-table').locator('tbody tr', { hasText: 'LABEL-ROLL-WHITE' });
    await expect(after.locator('td').nth(3)).toHaveText('1');
    await page.keyboard.press('Escape');

    // Picking was one command: undo takes the part off the device again.
    await page.getByTestId('page-canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2 + (234 - 148.5) * zoom);
    await expect(page.getByTestId('device-parts')).not.toContainText('LABEL-ROLL-WHITE');
  } finally {
    await close();
  }
});
