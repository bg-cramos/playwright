import { test, expect } from '@playwright/test';
import { clickIfVisible } from '../utils/playwrightHelpers';

test('crear remito y validar comprobante', async ({ page }) => {
  await page.goto('http://sandbox.igglobal.net/', {
    timeout: 30000,
    waitUntil: 'domcontentloaded',
  });

  // Entrar al Searchlight
  await page.locator('#searchlight').nth(1).click();
  await page.getByRole('textbox', { name: 'Buscar con Searchlight...' }).fill('remitos');
  await expect(page.getByRole('listitem').filter({ hasText: 'Ventas Remitos' }).getByRole('listitem')).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: 'Ventas Remitos' }).getByRole('listitem').dblclick();
  await page.waitForTimeout(4000); // Espera después del doble clic

  // Verificar y hacer clic en "Continuar"
  await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 20000); // Hacer clic si aparece
  await page.waitForTimeout(3000); // Espera después del clic

  // Espera y clic en el botón "+"
  const btnNuevo = page.getByRole('button', { name: '+' });
  await expect(btnNuevo).toBeVisible({ timeout: 15000 });
  await expect(btnNuevo).toBeEnabled({ timeout: 15000 });
  await btnNuevo.click();
  await page.waitForTimeout(4000); // Espera después del clic

  // Buscar Cliente
  await page.getByRole('textbox', { name: 'Buscar...' }).click();
  await page.getByRole('textbox', { name: 'Buscar...' }).fill('59');
  await expect(page.getByRole('link', { name: '(59) Grupo NovaTech' })).toBeVisible();
  await page.getByRole('link', { name: '(59) Grupo NovaTech' }).click();
  await page.waitForTimeout(4000); // Espera después de seleccionar el cliente

  // Botón para agregar artículo
  await page.locator('.ng-scope > .ibox-tools > a').first().click();
  await page.waitForTimeout(4000); // Espera después de hacer clic en el botón de agregar artículo

  // Buscar artículo
  await page.getByRole('textbox', { name: 'Buscar...' }).click();
  await page.getByRole('textbox', { name: 'Buscar...' }).fill('trigo');
  await expect(page.getByRole('link', { name: '(21105) TRIGO (R) MOJADO' })).toBeVisible();
  await page.getByRole('link', { name: '(21105) TRIGO (R) MOJADO' }).click();
  await page.waitForTimeout(4000); // Espera después de seleccionar el artículo

  // Cargar cantidades y precios
  await page.getByRole('textbox', { name: 'Buscar...' }).press('Tab');
  await page.locator('#CantidadOriginal').fill('25');
  await page.locator('#CantidadOriginal').press('Tab');
  await page.locator('#CantidadBultosArticulo').press('Tab');
  await page.locator('#PrecioUnitarioDigitado').fill('3562.30');
  await page.locator('#PrecioUnitarioDigitado').press('Tab');
  await page.locator('#PrecioUnitarioDigitadoConImpuesto').press('Tab');
  await page.locator('#PorcDescArticFinal').press('Enter');
  await page.waitForTimeout(4000); // Espera después de aplicar los valores

  // Confirmar ítem
  await page.locator('.ng-scope > .ibox-tools > a').first().click();
  await page.waitForTimeout(4000); // Espera después de hacer clic en el ítem

  // Agregar otro artículo
  await page.getByRole('textbox', { name: 'Buscar...' }).click();
  await page.getByRole('textbox', { name: 'Buscar...' }).fill('margarina');
  await expect(page.getByRole('link', { name: '(17009) EMULSION MARGARINA' })).toBeVisible();
  await page.getByRole('link', { name: '(17009) EMULSION MARGARINA' }).click();
  await page.waitForTimeout(4000); // Espera después de seleccionar el artículo

  // Cargar cantidades y precios para el nuevo artículo
  await page.getByRole('textbox', { name: 'Buscar...' }).press('Tab');
  await page.locator('#CantidadOriginal').fill('56');
  await page.locator('#CantidadOriginal').press('Tab');
  await page.locator('#CantidadBultosArticulo').press('Tab');
  await page.locator('#PrecioUnitarioDigitado').fill('365.60');
  await page.locator('#PrecioUnitarioDigitado').press('Tab');
  await page.waitForTimeout(4000); // Espera después de aplicar los valores

  // Confirmar y guardar
  await expect(page.getByRole('button', { name: 'Aceptar' })).toBeVisible();
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await page.waitForTimeout(4000); // Espera después de hacer clic en "Aceptar"

  // Guardar remito
  await expect(page.getByRole('button', { name: '' })).toBeVisible();
  await page.getByRole('button', { name: '' }).click();
  await page.waitForTimeout(8000); 
  // Generar remito
  await expect(page.getByText('3254')).toBeVisible();
  await page.getByRole('gridcell', { name: '3254' }).click({
    button: 'right'
  });
  await expect(page.getByRole('menuitem', { name: 'Generar' }).locator('a')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Generar' }).locator('a').click();
  await expect(page.getByRole('button', { name: 'Aceptar' })).toBeVisible();
  await page.getByRole('button', { name: 'Aceptar' }).click();
});
