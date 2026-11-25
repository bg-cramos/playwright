import { test, expect, Page } from '@playwright/test';
import {
  login,
  abrirPedidos,
  nuevoComprobante,
  cargarClienteYArticulos,
  irASeccion,
  leerImputacion,
  leerTotales,
  guardarComprobante,
  consultarUltimoComprobante,
  Imputacion,
} from '../utils/igglobal';


type Snapshot = {
  conceptos: Imputacion;
  provincias: Imputacion;
  totales: Record<string, string>;
};

/** Captura Imputaciones (Conceptos y Provincias) y Totales del comprobante abierto. */
async function capturarImportes(page: Page): Promise<Snapshot> {
  await irASeccion(page, 'Imputaciones');
  const conceptos = await leerImputacion(page, 'Conceptos');
  const provincias = await leerImputacion(page, 'Provincias');
  await irASeccion(page, 'Totales');
  const totales = await leerTotales(page);
  return { conceptos, provincias, totales };
}

test('pedido: imputaciones y totales coinciden antes de guardar y al consultar', async ({ page }) => {
  await login(page);
  const maxPrevio = await abrirPedidos(page);

  // 1. Carga del comprobante
  await nuevoComprobante(page);
  await cargarClienteYArticulos(page); // artículos por defecto: (1002) x 3 + caja de cartón x 5

  // 2. Captura antes de guardar
  const pre = await capturarImportes(page);
  // Sanidad mínima: que haya algo que comparar
  expect(pre.conceptos.importes.length, 'filas en Conceptos').toBeGreaterThan(0);
  expect(pre.provincias.importes.length, 'filas en Provincias').toBeGreaterThan(0);
  for (const clave of ['TOTAL BRUTO', 'DESCUENTO / RECARGO', 'TOTAL NETO', 'IMPORTE $']) {
    expect(pre.totales, `Totales debe mostrar "${clave}"`).toHaveProperty([clave]);
  }

  // 3. Guardado y consulta del más reciente
  await guardarComprobante(page);
  const nro = await consultarUltimoComprobante(page, maxPrevio);

  // 4. Captura y validación después de guardar
  const post = await capturarImportes(page);

  console.log(`RESULTADO ${JSON.stringify({ nro, pre, post })}`);
  test.info().annotations.push({ type: 'pedido', description: String(nro) });

  expect.soft(post.conceptos, 'Imputaciones > Conceptos').toEqual(pre.conceptos);
  expect.soft(post.provincias, 'Imputaciones > Provincias').toEqual(pre.provincias);
  for (const [concepto, valor] of Object.entries(pre.totales)) {
    expect.soft(post.totales[concepto], `Totales > ${concepto}`).toBe(valor);
  }
  expect(Object.keys(post.totales), 'mismos conceptos en Totales').toEqual(Object.keys(pre.totales));
});
