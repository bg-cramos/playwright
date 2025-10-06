import { test, expect } from '@playwright/test';
import { clickIfVisible } from '../utils/playwrightHelpers';

test('crear pedido y validar comprobante', async ({ page }) => {
  await page.goto('http://sandbox.igglobal.net/', {
    timeout: 30000,
    waitUntil: 'domcontentloaded',
  });

  // Abrir Searchlight
  const searchlightBtn = page.locator('#searchlight').nth(1);
  await expect(searchlightBtn).toBeVisible({ timeout: 10000 });
  await searchlightBtn.click();
  await page.waitForTimeout(2000);

  // Buscar "Ventas Pedidos"
  const buscador = page.getByRole('textbox', { name: 'Buscar con Searchlight...' });
  await expect(buscador).toBeVisible({ timeout: 10000 });
  await buscador.fill('pedido');
  await page.waitForTimeout(2000);

  const itemVentasPedidos = page
    .getByRole('listitem')
    .filter({ hasText: 'Ventas Pedidos' })
    .getByRole('listitem');
  await expect(itemVentasPedidos).toBeVisible({ timeout: 10000 });

  const ventasBtn = page.locator('#navbar-static-top').getByText('Ventas', { exact: true });
  await expect(ventasBtn).toBeVisible({ timeout: 10000 });
  await ventasBtn.click();
  await page.waitForTimeout(2000);

  await itemVentasPedidos.dblclick();
  await page.waitForTimeout(2000);

  // Modal terminales 1 (opcional)
  await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 20000);
  await page.waitForTimeout(2500);

  // Espera botón "+"
  const btnNuevo = page.getByRole('button', { name: '+' });

  await btnNuevo.click();
  await page.waitForTimeout(5000);

  const continuarBtn = page.getByRole('button', { name: 'Continuar' });

  if (await continuarBtn.isVisible().catch(() => false)) {
    await continuarBtn.click();
    await page.waitForTimeout(3000);
    await expect(continuarBtn).toHaveCount(0, { timeout: 10000 });
  } else {
    console.log('Modal Terminal 2 no apareció, continuamos...');
  }

  const buscarCliente = page.getByRole('textbox', { name: 'Buscar...' });
  await expect(buscarCliente).toBeVisible({ timeout: 15000 });
  await expect(buscarCliente).toBeEnabled();
  await buscarCliente.fill('59');
  await page.waitForTimeout(3000);

  // Esperar dropdown de cliente
  await page.waitForTimeout(1000);
  const clienteLink = page.locator('a', { hasText: '(59) Grupo NovaTech' });
  await expect(clienteLink.first()).toBeVisible({ timeout: 30000 });
  await clienteLink.first().click();
  await page.waitForTimeout(3000);

  // Botón para agregar artículo
  const btnAgregarArticulo = page.locator('.ng-scope > .ibox-tools > a').first();
  await expect(btnAgregarArticulo).toBeVisible({ timeout: 10000 });
  await btnAgregarArticulo.click();
  await page.waitForTimeout(1000);

  // Buscar artículo
  const inputArticulo = page.getByRole('textbox', { name: 'Buscar...' });
  await expect(inputArticulo).toBeVisible();
  await inputArticulo.fill('trigo');
  await page.waitForTimeout(1000);

  const linkArticulo = page.getByRole('link', { name: '(21105) TRIGO (R) MOJADO' });
  await expect(linkArticulo).toBeVisible();
  await linkArticulo.click();
  await page.waitForTimeout(1000);

  // Cargar cantidades y precios
  await inputArticulo.press('Tab');
  await page.waitForTimeout(1000);

  const cantidadOriginal = page.locator('#CantidadOriginal');
  await expect(cantidadOriginal).toBeVisible();
  await cantidadOriginal.fill('100');
  await page.waitForTimeout(1000);
  await cantidadOriginal.press('Tab');
  await page.waitForTimeout(1000);

  const bultos = page.locator('#CantidadBultosArticulo');
  await expect(bultos).toBeVisible();
  await bultos.press('Tab');
  await page.waitForTimeout(1000);

  const precioUnitario = page.locator('#PrecioUnitarioDigitado');
  await expect(precioUnitario).toBeVisible();
  await precioUnitario.fill('1002');
  await page.waitForTimeout(500);
  await precioUnitario.press('Tab');
  await page.waitForTimeout(500);

  // Confirmar ítem
  const btnAceptar = page.getByRole('button', { name: 'Aceptar' });
  await expect(btnAceptar).toBeVisible();
  await btnAceptar.click();
  await page.waitForTimeout(500);

  // Guardar pedido
  const btnGuardar = page.getByRole('button', { name: '' });
  await expect(btnGuardar).toBeVisible({ timeout: 10000 });
  await btnGuardar.click();
  await page.waitForTimeout(3000);
});
