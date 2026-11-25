import { test, expect } from '@playwright/test';
import {
  login,
  abrirPedidos,
  nuevoComprobante,
  cargarClienteYArticulos,
  irASeccion,
  importeTotal,
  guardarComprobante,
  consultarUltimoComprobante,
} from '../utils/igglobal';


test('alta de pedido y verificación del total al consultarlo', async ({ page }) => {
  await login(page);
  const maxPrevio = await abrirPedidos(page);

  await nuevoComprobante(page);
  await cargarClienteYArticulos(page); // artículos por defecto: (1002) x 3 + caja de cartón x 5

  // Totales antes de guardar
  await irASeccion(page, 'Totales');
  const total = importeTotal(page);
  await expect(total).toHaveText(/\d/);
  const totalAlta = (await total.innerText()).trim();
  console.log(`Total del pedido: ${totalAlta}`);

  await guardarComprobante(page);
  const nuevo = await consultarUltimoComprobante(page, maxPrevio);
  console.log(`Pedido creado: Nº ${nuevo}`);

  // Verificar que el total coincide
  await irASeccion(page, 'Totales');
  await expect(importeTotal(page)).toHaveText(totalAlta);
});
