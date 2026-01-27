import { test, expect } from '@playwright/test';
import { clickIfVisible } from '../utils/playwrightHelpers';

test('flujo control de percepciones', async ({ page }) => {
  await page.goto('http://sandbox.igglobal.net/', { timeout: 30000, waitUntil: 'domcontentloaded' });

  await expect(page.locator('#searchlight').nth(1)).toBeVisible();
  await page.locator('#searchlight').nth(1).click();
  await page.waitForTimeout(2000);
  await page.getByRole('textbox', { name: 'Buscar con Searchlight...' }).fill('fact');
  await expect(page.getByRole('listitem').filter({ hasText: 'Ventas Facturas' }).getByRole('listitem')).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: 'Ventas Facturas' }).getByRole('listitem').dblclick();
  await page.waitForTimeout(2000);

// Segundo terminar "Continuar"

  await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 20000);
  await page.waitForTimeout(2500);

  await expect(page.getByRole('button', { name: '+' })).toBeVisible();
  await page.getByRole('button', { name: '+' }).click();

// Segundo terminar "Continuar"

  await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 20000);
  await page.waitForTimeout(2000);

// Agrego un Cliente
  const buscarClienteRemito = page.getByRole('textbox', { name: 'Buscar...' });
  await buscarClienteRemito.fill('59');
  await page.getByRole('link', { name: '(59) Grupo NovaTech' }).click();
  await page.waitForTimeout(2000);

 // Artículos
  const btnAgregarArticuloRemito = page.locator('.ng-scope > .ibox-tools > a').first();
  await btnAgregarArticuloRemito.click();
  await page.waitForTimeout(4000);

  // Artículo 1
  const inputArticuloRemito = page.getByRole('textbox', { name: 'Buscar...' });
  await inputArticuloRemito.fill('trigo');
  await page.getByRole('link', { name: '(21105) TRIGO (R) MOJADO' }).click();
  await page.waitForTimeout(4000);
  await page.locator('#CoArticulo').press('Tab');
  await page.locator('#CoRuta').press('Tab');
  await page.locator('#CantidadBultosArticulo').press('Tab');
  await page.locator('#CantidadOriginal').fill('25');
  await page.locator('#CantidadOriginal').press('Tab');
  await page.locator('#CantidadBultosArticulo').press('Tab');
  await page.locator('#PrecioUnitarioDigitado').fill('3562.30');
  await page.locator('#PrecioUnitarioDigitado').press('Tab');
  await page.locator('#PrecioUnitarioDigitadoConImpuesto').press('Enter');
  await page.waitForTimeout(3000);


  await btnAgregarArticuloRemito.click();
  await page.waitForTimeout(4000);

  // Artículo 2
  await inputArticuloRemito.fill('margarina');
  await page.getByRole('link', { name: '(17009) EMULSION MARGARINA' }).click();
  await page.waitForTimeout(4000);
  await page.locator('#CoArticulo').press('Tab');
  await page.locator('#CoRuta').press('Tab');
  await page.locator('#CantidadBultosArticulo').press('Tab');
  await page.locator('#CantidadOriginal').fill('963');
  await page.locator('#CantidadOriginal').press('Tab');
  await page.locator('#CantidadBultosArticulo').press('Tab');
  await page.locator('#PrecioUnitarioDigitado').fill('109.60');
  await page.locator('#PrecioUnitarioDigitado').press('Tab');
  await page.locator('#PrecioUnitarioDigitadoConImpuesto').press('Enter');

//Cambio de sección a Percepciones 

  await page.locator('#dropdownMenuButton:visible').click();
  await page.getByText('Percepciones *').click();
  await page.waitForTimeout(1000);
  //await page.getByText('Percepciones *').click();

  await expect(page.getByText('Capital Federal')).toBeVisible();
  const percepcionCapitalFederalPre = await page.getByText('5.00', { exact: true }).textContent();
  const percepcionCapitalPre = await page.getByRole('gridcell', { name: '10,241.92' }).locator('div').textContent();
  const percepcionCapitalTotalPre = await page.getByText('204,838.38', { exact: true }).nth(1).textContent();

  await expect(page.getByText('Misiones', { exact: true })).toBeVisible();
  const percepcionMisionesPre = await page.getByText('3.31', { exact: true }).textContent();
  const percepcionMisionesImportePre = await page.getByText('6,780.15').textContent();
  const percepcionMisionesTotalPre = await page.getByText('204,838.38', { exact: true }).nth(2).textContent();

//Cambio de Sección a Totales

  await page.locator('#dropdownMenuButton:visible').click();
  await page.getByText('Percepciones *').click();
  await page.waitForTimeout(1000);
  await page.locator('#dropdownMenuButton:visible').click();
  await expect(page.getByText('Totales *')).toBeVisible();
  await page.getByText('Totales *').click();
  await expect(page.locator('span').filter({ hasText: 'GRAV 21%' })).toBeVisible();
  await expect(page.getByText('194,602.30').nth(1)).toBeVisible();

  await expect(page.locator('#content').getByText('TOTAL BRUTO', { exact: true })).toBeVisible();
  const brutoPre = await page.getByText('194,602.30').nth(1).textContent();

  await expect(page.locator('#content').getByText('DESCUENTO / RECARGO')).toBeVisible();
  const descuentoPre = await page.getByRole('paragraph').filter({ hasText: '10,236.08' }).textContent();

  await expect(page.locator('#content').getByText('TOTAL NETO', { exact: true })).toBeVisible();
  const netoPre = await page.getByRole('paragraph').filter({ hasText: '204,838.38' }).textContent();

  await expect(page.locator('span').filter({ hasText: 'IVA 21%' })).toBeVisible();
  const ivaPre = await page.getByText('43,016.06').textContent();

  await expect(page.locator('span').filter({ hasText: 'PERC. IVA' })).toBeVisible();
  const percIvaPre = await page.getByRole('paragraph').filter({ hasText: '10,241.92' }).textContent();

  await expect(page.locator('span').filter({ hasText: 'PERC. IIBB' })).toBeVisible();
  const percIIBBPre = await page.getByRole('paragraph').filter({ hasText: '17,022.07' }).textContent();

 await expect(page.getByText('IMPORTE $')).toBeVisible();

  const importePre = await page
    .getByRole('paragraph')
    .filter({ hasText: '275,118.43' })
    .textContent();
  
  await page.getByRole('button', { name: '' }).click();
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await page.waitForTimeout(6000);


 // CONSULTA EL COMPROBANTE 3877
const fila3877 = page.locator('span.explorer-grid-clickable-cell', { hasText: '3877' });

await expect(fila3877).toBeVisible();
await fila3877.click({ button: 'right' });

const opcionConsultar = page.locator('a[ng-click="details()"]:visible', { hasText: 'Consultar' });

await expect(opcionConsultar).toBeVisible();
await opcionConsultar.click();

 
  // Consultar - Percepciones
  await page.locator('#dropdownMenuButton:visible').click();
  await expect(page.getByText('Percepciones *')).toBeVisible();
  await page.getByText('Percepciones *').click();

  await expect(page.getByText('Capital Federal')).toBeVisible();
  const percepcionCapitalFederalPost = await page.getByText('5.00', { exact: true }).textContent();
  const percepcionCapitalPost = await page.getByRole('gridcell', { name: '10,241.92' }).locator('div').textContent();
  const percepcionCapitalTotalPost = await page.getByText('204,838.38', { exact: true }).nth(1).textContent();

  await expect(page.getByText('Misiones', { exact: true })).toBeVisible();
  const percepcionMisionesPost = await page.getByText('3.31', { exact: true }).textContent();
  const percepcionMisionesImportePost = await page.getByText('6,780.15').textContent();
  const percepcionMisionesTotalPost = await page.getByText('204,838.38', { exact: true }).nth(2).textContent();

// Consultar - Totales
  await page.locator('#dropdownMenuButton:visible').click();
  await expect(page.getByText('Totales *')).toBeVisible();
  await page.getByText('Totales *').click();

  await expect(page.locator('span').filter({ hasText: 'GRAV 21%' })).toBeVisible();
  await expect(page.getByText('194,602.30', { exact: true }).nth(2)).toBeVisible();

  await expect(page.locator('#content').getByText('TOTAL BRUTO', { exact: true })).toBeVisible();
  const brutoPost = await page.getByText('194,602.30').nth(2).textContent();

  await expect(page.locator('#content').getByText('DESCUENTO / RECARGO')).toBeVisible();
  const descuentoPost = await page.getByRole('paragraph').filter({ hasText: '10,236.08' }).textContent();

  await expect(page.locator('#content').getByText('TOTAL NETO', { exact: true })).toBeVisible();
  const netoPost = await page.getByRole('paragraph').filter({ hasText: '204,838.38' }).textContent();

  await expect(page.locator('span').filter({ hasText: 'IVA 21%' })).toBeVisible();
  const ivaPost = await page.getByText('43,016.06').textContent();

  await expect(page.locator('span').filter({ hasText: 'PERC. IVA' })).toBeVisible();
  const percIvaPost = await page.getByRole('paragraph').filter({ hasText: '10,241.92' }).textContent();

  await expect(page.locator('span').filter({ hasText: 'PERC. IIBB' })).toBeVisible();
  const percIIBBPost = await page.getByRole('paragraph').filter({ hasText: '17,022.07' }).textContent();

  const importePost = await page
    .getByRole('paragraph')
    .filter({ hasText: '275,118.43' })
    .textContent();

//  Comparación Percepciones 
expect(percepcionCapitalFederalPre?.trim()).toBe(percepcionCapitalFederalPost?.trim());
expect(percepcionCapitalPost?.trim()).toBe(percepcionCapitalPre?.trim());
expect(percepcionCapitalTotalPost?.trim()).toBe(percepcionCapitalTotalPre?.trim());
expect(percepcionMisionesPost?.trim()).toBe(percepcionMisionesPre?.trim());
expect(percepcionMisionesImportePost?.trim()).toBe(percepcionMisionesImportePre?.trim());
expect(percepcionMisionesTotalPost?.trim()).toBe(percepcionMisionesTotalPre?.trim());


// Comparación Totales

expect(brutoPost?.trim()).toBe(brutoPre?.trim());
expect(descuentoPost?.trim()).toBe(descuentoPre?.trim());
expect(netoPost?.trim()).toBe(netoPre?.trim());
expect(ivaPost?.trim()).toBe(ivaPre?.trim());
expect(percIvaPost?.trim()).toBe(percIvaPre?.trim());
expect(percIIBBPost?.trim()).toBe(percIIBBPre?.trim());
expect(importePost?.trim()).toBe(importePre?.trim());


});