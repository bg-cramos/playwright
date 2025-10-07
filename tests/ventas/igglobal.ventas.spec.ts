import { test, expect } from '@playwright/test';
import { clickIfVisible } from '../utils/playwrightHelpers';

test('flujo completo: pedido -> remito -> factura', async ({ page }) => {
  // -------------------
  // CREAR PEDIDO
  // -------------------
  await page.goto('http://sandbox.igglobal.net/', { timeout: 30000, waitUntil: 'domcontentloaded' });

  // Abrir Searchlight y buscar "pedido"
  const searchlightBtn = page.locator('#searchlight').nth(1);
  await expect(searchlightBtn).toBeVisible({ timeout: 10000 });
  await searchlightBtn.click();
  await page.waitForTimeout(2000);

  const buscadorPedido = page.getByRole('textbox', { name: 'Buscar con Searchlight...' });
  await expect(buscadorPedido).toBeVisible({ timeout: 10000 });
  await buscadorPedido.fill('pedido');
  await page.waitForTimeout(2000);

  const itemVentasPedidos = page.getByRole('listitem').filter({ hasText: 'Ventas Pedidos' }).getByRole('listitem');
  await expect(itemVentasPedidos).toBeVisible({ timeout: 10000 });

  const ventasBtn = page.locator('#navbar-static-top').getByText('Ventas', { exact: true });
  await expect(ventasBtn).toBeVisible({ timeout: 10000 });
  await ventasBtn.click();
  await page.waitForTimeout(2000);

  await itemVentasPedidos.dblclick();
  await page.waitForTimeout(2000);

  // Modal terminales 1
  await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 20000);
  await page.waitForTimeout(2500);

  // Botón "+"
  const btnNuevoPedido = page.getByRole('button', { name: '+' });
  await btnNuevoPedido.click();
  await page.waitForTimeout(5000);

  // Modal terminal 2
  const continuarBtn = page.getByRole('button', { name: 'Continuar' });
  if (await continuarBtn.isVisible().catch(() => false)) {
    await continuarBtn.click();
    await page.waitForTimeout(3000);
    await expect(continuarBtn).toHaveCount(0, { timeout: 10000 });
  }

  // Seleccionar cliente
  const buscarCliente = page.getByRole('textbox', { name: 'Buscar...' });
  await buscarCliente.fill('59');
  await page.waitForTimeout(3000);
  const clienteLink = page.locator('a', { hasText: '(59) Grupo NovaTech' });
  await clienteLink.first().click();
  await page.waitForTimeout(3000);

  // Agregar artículo
  const btnAgregarArticuloPedido = page.locator('.ng-scope > .ibox-tools > a').first();
  await btnAgregarArticuloPedido.click();
  await page.waitForTimeout(1000);

  const inputArticuloPedido = page.getByRole('textbox', { name: 'Buscar...' });
  await inputArticuloPedido.fill('trigo');
  const linkArticuloPedido = page.getByRole('link', { name: '(21105) TRIGO (R) MOJADO' });
  await linkArticuloPedido.click();
  await page.waitForTimeout(1000);

  // Cantidades y precios
  await inputArticuloPedido.press('Tab');
  const cantidadOriginal = page.locator('#CantidadOriginal');
  await cantidadOriginal.fill('100');
  await cantidadOriginal.press('Tab');

  const bultos = page.locator('#CantidadBultosArticulo');
  await bultos.press('Tab');

  const precioUnitario = page.locator('#PrecioUnitarioDigitado');
  await precioUnitario.fill('1002');
  await precioUnitario.press('Tab');

  // Confirmar ítem y guardar pedido
  const btnAceptarPedido = page.getByRole('button', { name: 'Aceptar' });
  await btnAceptarPedido.click();
  await page.waitForTimeout(500);

  const btnGuardarPedido = page.getByRole('button', { name: '' });
  await btnGuardarPedido.click();
  await page.waitForTimeout(3000);

  // -------------------
  // CREAR REMITO
  // -------------------
  await page.locator('#searchlight').nth(1).click();
  await page.getByRole('textbox', { name: 'Buscar con Searchlight...' }).fill('remitos');
  await page.getByRole('listitem').filter({ hasText: 'Ventas Remitos' }).getByRole('listitem').dblclick();
  await page.waitForTimeout(4000);

  await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 20000);
  await page.waitForTimeout(3000);

  const btnNuevoRemito = page.getByRole('button', { name: '+' });
  await btnNuevoRemito.click();
  await page.waitForTimeout(4000);

  // Cliente
  const buscarClienteRemito = page.getByRole('textbox', { name: 'Buscar...' });
  await buscarClienteRemito.fill('59');
  await page.getByRole('link', { name: '(59) Grupo NovaTech' }).click();
  await page.waitForTimeout(4000);

  // Artículos
  const btnAgregarArticuloRemito = page.locator('.ng-scope > .ibox-tools > a').first();
  await btnAgregarArticuloRemito.click();
  await page.waitForTimeout(4000);

  // Artículo 1
  const inputArticuloRemito = page.getByRole('textbox', { name: 'Buscar...' });
  await inputArticuloRemito.fill('trigo');
  await page.getByRole('link', { name: '(21105) TRIGO (R) MOJADO' }).click();
  await page.waitForTimeout(4000);
  await inputArticuloRemito.press('Tab');
  await page.locator('#CantidadOriginal').fill('25');
  await page.locator('#CantidadOriginal').press('Tab');
  await page.locator('#CantidadBultosArticulo').press('Tab');
  await page.locator('#PrecioUnitarioDigitado').fill('3562.30');
  await page.locator('#PrecioUnitarioDigitado').press('Tab');
  await page.locator('#PrecioUnitarioDigitadoConImpuesto').press('Tab');
  await page.locator('#PorcDescArticFinal').press('Enter');
  await page.waitForTimeout(4000);

  await btnAgregarArticuloRemito.click();
  await page.waitForTimeout(4000);

  // Artículo 2
  await inputArticuloRemito.fill('margarina');
  await page.getByRole('link', { name: '(17009) EMULSION MARGARINA' }).click();
  await page.waitForTimeout(4000);
  await inputArticuloRemito.press('Tab');
  await page.locator('#CantidadOriginal').fill('56');
  await page.locator('#CantidadOriginal').press('Tab');
  await page.locator('#CantidadBultosArticulo').press('Tab');
  await page.locator('#PrecioUnitarioDigitado').fill('365.60');
  await page.locator('#PrecioUnitarioDigitado').press('Tab');
  await page.waitForTimeout(4000);

  const btnAceptarRemito = page.getByRole('button', { name: 'Aceptar' });
  await btnAceptarRemito.click();
  await page.waitForTimeout(4000);

  const btnGuardarRemito = page.getByRole('button', { name: '' });
  await btnGuardarRemito.click();
  await page.waitForTimeout(8000);

  // Generar remito
  await page.getByRole('gridcell', { name: '3254' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Generar' }).locator('a').click();
  await page.getByRole('button', { name: 'Aceptar' }).click();

  // -------------------
  // CREAR FACTURA
  // -------------------
  await page.locator('#searchlight').nth(1).click();
  await page.getByRole('textbox', { name: 'Buscar con Searchlight...' }).fill('factura');
  await page.getByRole('listitem').filter({ hasText: 'Ventas Facturas' }).getByRole('listitem').dblclick();
  await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 20000);
  await page.waitForTimeout(3000);

  // Botón "+"
  await page.getByRole('button', { name: '+' }).click();
  await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 20000);
  await page.waitForTimeout(3000);

  // Cliente
  const buscarClienteFactura = page.getByRole('textbox', { name: 'Buscar...' });
  await buscarClienteFactura.fill('59');
  await page.getByRole('link', { name: '(59) Grupo NovaTech' }).click();

  // Agregar artículos
  const btnAgregarArticuloFactura = page.locator('.ng-scope > .ibox-tools > a').first();
  await btnAgregarArticuloFactura.click();
  await page.waitForTimeout(4000);

  // Artículo 1
  const inputArticuloFactura = page.getByRole('textbox', { name: 'Buscar...' });
  await inputArticuloFactura.fill('trigo');
  await page.getByRole('link', { name: '(21105) TRIGO (R) MOJADO' }).click();
  await page.waitForTimeout(4000);
  await inputArticuloFactura.press('Tab');
  await page.locator('#CantidadOriginal').fill('25');
  await page.locator('#CantidadOriginal').press('Tab');
  await page.locator('#CantidadBultosArticulo').press('Tab');
  await page.locator('#PrecioUnitarioDigitado').fill('3562.30');
  await page.locator('#PrecioUnitarioDigitado').press('Tab');
  await page.locator('#PrecioUnitarioDigitadoConImpuesto').press('Tab');
  await page.locator('#PorcDescArticFinal').press('Enter');
  await page.waitForTimeout(4000);
  await btnAgregarArticuloFactura.click();
  await page.waitForTimeout(4000);

  // Artículo 2
  await inputArticuloFactura.fill('margarina');
  await page.getByRole('link', { name: '(17009) EMULSION MARGARINA' }).click();
  await page.waitForTimeout(4000);
  await inputArticuloFactura.press('Tab');
  await page.locator('#CantidadOriginal').fill('56');
  await page.locator('#CantidadOriginal').press('Tab');
  await page.locator('#CantidadBultosArticulo').press('Tab');
  await page.locator('#PrecioUnitarioDigitado').fill('365.60');
  await page.locator('#PrecioUnitarioDigitado').press('Tab');
  await page.waitForTimeout(4000);

  // Confirmar y guardar factura
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: '' }).click();
  await page.getByRole('button', { name: 'Aceptar' }).click();

  // Validar comprobante
  await page.goto('http://sandbox.igglobal.net/Home/Index#/10/1540/explorer');
  await page.getByRole('button', { name: 'Aceptar' }).click();
});
