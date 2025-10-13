import { test, expect } from '@playwright/test';
import { clickIfVisible } from '../utils/playwrightHelpers';


test('Control de movimiento de Stock por Concepto de venta', async ({ page }) => {
  await page.goto('http://sandbox.igglobal.net/', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await expect(page.locator('#searchlight').nth(1)).toBeVisible();
  await page.locator('#searchlight').nth(1).click();
  await page.waitForTimeout(2000);
  await page.getByRole('textbox', { name: 'Buscar con Searchlight...' }).fill('remito');
  await expect(page.getByRole('listitem').filter({ hasText: 'Ventas Remitos' }).getByRole('listitem')).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: 'Ventas Remitos' }).getByRole('listitem').dblclick();
  await page.waitForTimeout(2000);

  await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 20000);
  await page.waitForTimeout(2500);

  await expect(page.getByRole('button', { name: '+' })).toBeVisible();
  await page.getByRole('button', { name: '+' }).click();
  
  
  await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 20000);
  await page.waitForTimeout(2500);
  
  
 // Agrego un Cliente
  const buscarClienteRemito = page.getByRole('textbox', { name: 'Buscar...' });
  await buscarClienteRemito.fill('59');
  await page.getByRole('link', { name: '(59) Grupo NovaTech' }).click();
  await page.waitForTimeout(2000);

 // Artículo
  const btnAgregarArticuloRemito = page.locator('.ng-scope > .ibox-tools > a').first();
  await btnAgregarArticuloRemito.click();
  await page.waitForTimeout(4000);
  const inputArticuloRemito = page.getByRole('textbox', { name: 'Buscar...' });
  await inputArticuloRemito.fill('trigo');
  await page.getByRole('link', { name: '(21105) TRIGO (R) MOJADO' }).click();
  await page.waitForTimeout(3000);
  await page.getByRole('textbox', { name: 'Buscar...' }).press('Tab');
  await page.locator('#CantidadOriginal').fill('25');
  await page.locator('#CantidadOriginal').press('Tab');
  await page.locator('#CantidadBultosArticulo').press('Tab');
  await page.locator('#PrecioUnitarioDigitado').fill('3562.30');
  await page.locator('#PrecioUnitarioDigitado').press('Tab');
  await page.locator('#PrecioUnitarioDigitadoConImpuesto').press('Enter');
  await page.waitForTimeout(3000);
  //Consulto el cliente y el concepto de venta generico
  await expect(page.locator('#dropdownMenuButton')).toBeVisible();
  await page.locator('#dropdownMenuButton').click();
  await expect(page.getByText('Cliente *')).toBeVisible();
  await page.getByText('Cliente *').click();
  await expect(page.getByRole('link', { name: 'Datos Comerciales' })).toBeVisible();
  await page.getByRole('link', { name: 'Datos Comerciales' }).click();
  await expect(page.locator('#CoConceptoVentaLabel').getByText('Co. Concepto de Venta')).toBeVisible();
  await expect(page.getByText('(1) Concepto de Ventas Gené')).toBeVisible();
  await expect(page.getByRole('button', { name: '' })).toBeVisible();
  await page.getByRole('button', { name: '' }).click();
  await page.waitForTimeout(9000); 
  // Generar el remito
  await expect(page.getByText('3254')).toBeVisible();
  await page.getByRole('gridcell', { name: '3254' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Generar' }).locator('a')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Generar' }).locator('a').click();
  await expect(page.getByRole('button', { name: 'Aceptar' })).toBeVisible();
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await page.waitForTimeout(3000);


  // Movimiento de Stock
  await expect(page.locator('#searchlight').nth(1)).toBeVisible();
  await page.locator('#searchlight').nth(1).click();
  await page.getByRole('textbox', { name: 'Buscar con Searchlight...' }).fill('movimiento');
  await expect(page.getByText('Movimientos de Stock', { exact: true }).nth(2)).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar con Searchlight...' }).press('Enter');
  await page.waitForTimeout(2000);

  await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 20000);
  await page.waitForTimeout(2500);

  await expect(page.getByText('3095')).toBeVisible();
  await page.getByRole('gridcell', { name: '3095' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Consultar' }).locator('a')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Consultar' }).locator('a').click();
  await page.waitForTimeout(3000);

  await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 20000);
  await page.waitForTimeout(2500);

  await expect(page.getByText('25.00')).toBeVisible();
});