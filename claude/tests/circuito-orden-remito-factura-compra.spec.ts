import { test, expect, Page } from '@playwright/test';
import {
  login,
  abrirExploradorCompras,
  nuevoComprobante,
  seleccionarProveedor,
  cargarArticulos,
  cargarComprobanteProveedor,
  comprobanteFicticio,
  invocarPendiente,
  leerDetalle,
  capturarImportes,
  agregarPercepcionCompra,
  cargarPercepcionesTotales,
  leerPercepciones,
  leerPercepcionesConsulta,
  leerTotalesOtros,
  irASeccion,
  leerTotales,
  guardarComprobante,
  consultarUltimoComprobante,
  volverAlExplorador,
  leerSidebarDetalles,
  ARTICULOS_COMPRA,
  PROVEEDOR_CODIGO,
  Importes,
  LineaDetalle,
  SidebarDetalles,
  ComprobanteProveedor,
} from '../utils/igglobal';

/**
 * Circuito de Compras (primera etapa, sin pagos): Orden de Compra → Remito de Compra → Factura de Compra,
 * Remito y Factura invocados desde Pendientes. Cada corrida arma el circuito completo desde cero con el
 * proveedor 10 y compara, en cada comprobante, Pre-grabado vs. Consultar vs. Sidebar (Más › Ver Detalles).
 *
 * Las diferencias se registran con `expect.soft` (el test sigue y el informe muestra cada concepto) y se
 * guardan en `diferencias` de cada etapa del resumen.json.
 */

const ARTICULOS = ARTICULOS_COMPRA;
/** Imputaciones que se exigen en Compras (Conceptos depende de la parametrización: se informa). */
const IMPUTACIONES_EXIGIDAS = ['contables', 'provincias'] as const;
const PROVINCIAS_PERCEPCION = ['2', '3', '6', '8', '12', '13', '18', '21']; // Bs. As., Entre Ríos, Córdoba, Santa Fe, Tucumán, Salta, Mendoza, Río Negro

const aNumero = (monto: string | undefined) => Number(String(monto ?? '').replace(/,/g, ''));
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Importe aleatorio con 2 decimales entre `min` y `max` (formato "123.45"). */
const importeAleatorio = (min: number, max: number) => (Math.round((min + Math.random() * (max - min)) * 100) / 100).toFixed(2);
const elegirDistintas = <T,>(lista: T[], n: number) => [...lista].sort(() => Math.random() - 0.5).slice(0, n);

/** Acumula diferencias de una etapa (van al informe) y las registra como soft assertion. */
function controlador(etapa: string) {
  const diferencias: string[] = [];
  const observaciones: string[] = [];
  const igual = (actual: unknown, esperado: unknown, concepto: string) => {
    const ok = JSON.stringify(actual) === JSON.stringify(esperado);
    if (!ok) diferencias.push(`${concepto}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(esperado)}`);
    expect.soft(actual, `${etapa} › ${concepto}`).toEqual(esperado);
  };
  const observar = (texto: string) => {
    observaciones.push(texto);
    test.info().annotations.push({ type: `${etapa} › observación`, description: texto });
    console.log(`${etapa} › ${texto}`);
  };
  return { diferencias, observaciones, igual, observar };
}

type Control = ReturnType<typeof controlador>;

/** Pre-grabado vs. Consultar: Totales (todos), Contables, Provincias y Percepciones; Conceptos se informa. */
function compararPreVsConsultar(c: Control, pre: Importes, post: Importes) {
  for (const concepto of new Set([...Object.keys(pre.totales), ...Object.keys(post.totales)])) {
    c.igual(post.totales[concepto], pre.totales[concepto], `Consultar vs. Pre-grabado › Totales › ${concepto}`);
  }
  for (const tipo of IMPUTACIONES_EXIGIDAS) {
    c.igual(post[tipo].totalImputado, pre[tipo].totalImputado, `Consultar vs. Pre-grabado › Imputaciones › ${tipo} › Total Imputado`);
    c.igual(post[tipo].importes, pre[tipo].importes, `Consultar vs. Pre-grabado › Imputaciones › ${tipo} › importes`);
  }
  if (pre.percepciones) {
    c.igual(post.percepciones?.map((p) => [p.provincia, p.monto]), pre.percepciones.map((p) => [p.provincia, p.monto]), 'Consultar vs. Pre-grabado › Percepciones');
  }
  if (JSON.stringify(pre.conceptos) !== JSON.stringify(post.conceptos)) {
    c.observar(`Imputaciones › Conceptos: Pre-grabado ${pre.conceptos.totalImputado} [${pre.conceptos.importes.join(' + ') || 'sin filas'}] → Consultar ${post.conceptos.totalImputado} [${post.conceptos.importes.join(' + ') || 'sin filas'}]`);
  }
}

/**
 * Separa del sidebar los conceptos que el formulario no muestra (Ordenes de Compra agrega AJUSTE IMPUESTOS,
 * AJUSTE DIFERENCIA DIVISA, IMPORTE Divisa): quedan en `extras` y se informan si no son 0.00.
 */
function normalizarSidebar(c: Control, sidebar: SidebarDetalles, conceptosFormulario: string[]) {
  const totales: Record<string, string> = {};
  const extras: Record<string, string> = {};
  for (const [k, v] of Object.entries(sidebar.totales)) (conceptosFormulario.includes(k) ? totales : extras)[k] = v;
  const extrasConImporte = Object.entries(extras).filter(([, v]) => aNumero(v) !== 0);
  if (extrasConImporte.length) c.observar(`Sidebar › conceptos extra con importe: ${extrasConImporte.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  return { sidebar: { ...sidebar, totales }, extras };
}

/**
 * Sidebar vs. Pre-grabado (lo que se cargó y grabó): Totales, resumen (Total/Neto/Impuestos) e imputaciones
 * Contables y Provincias. Consultar ya se compara contra Pre-grabado: si Consultar difiere, el ❌ queda en
 * Consultar y no se arrastra al Sidebar.
 */
function compararSidebar(c: Control, pre: Importes, post: Importes, sidebar: SidebarDetalles) {
  for (const concepto of Object.keys(pre.totales)) {
    c.igual(sidebar.totales[concepto], pre.totales[concepto], `Sidebar vs. Pre-grabado › Totales › ${concepto}`);
  }
  c.igual(sidebar.resumen.total, pre.totales['IMPORTE $'], 'Sidebar vs. Pre-grabado › Total (encabezado)');
  c.igual(sidebar.resumen.neto, pre.totales['TOTAL NETO'], 'Sidebar vs. Pre-grabado › Neto (encabezado)');
  c.igual(fmt(aNumero(sidebar.resumen.impuestos)), fmt(aNumero(sidebar.resumen.total) - aNumero(sidebar.resumen.neto)), 'Sidebar › Impuestos = Total - Neto');
  for (const tipo of IMPUTACIONES_EXIGIDAS) {
    c.igual(sidebar.imputaciones[tipo], pre[tipo].importes, `Sidebar vs. Pre-grabado › Imputaciones › ${tipo}`);
  }
  if (JSON.stringify(sidebar.imputaciones.conceptos) !== JSON.stringify(post.conceptos.importes)) {
    c.observar(`Sidebar › Imputaciones › Conceptos [${sidebar.imputaciones.conceptos.join(' + ') || 'sin filas'}] vs. Consultar [${post.conceptos.importes.join(' + ') || 'sin filas'}]`);
  }
}

/** En Compras se espera ver imputaciones Contables y Provincias por el neto del comprobante. */
function verificarImputacionesCompras(c: Control, momento: string, imp: Importes) {
  for (const tipo of IMPUTACIONES_EXIGIDAS) {
    c.igual(imp[tipo].importes.length > 0, true, `${momento} › Imputaciones › ${tipo} con filas`);
    c.igual(imp[tipo].totalImputado, imp.totales['TOTAL NETO'], `${momento} › Imputaciones › ${tipo} › Total Imputado = Total Neto`);
  }
}

/** Coherencia interna de Totales: IMPORTE $ = Neto + IVA + percepciones. */
function verificarCuadreTotales(c: Control, momento: string, t: Record<string, string>) {
  const sumaImpuestos = Object.entries(t)
    .filter(([k]) => /^(IVA |PERC\.)/.test(k))
    .reduce((s, [, v]) => s + aNumero(v), 0);
  c.igual(t['IMPORTE $'], fmt(aNumero(t['TOTAL NETO']) + sumaImpuestos), `${momento} › IMPORTE $ = Neto + IVA + Percepciones`);
}

const porArticulo = (d: LineaDetalle[]) => [...d].sort((a, b) => String(a.CoArticulo).localeCompare(String(b.CoArticulo)));
const clave = (l: LineaDetalle) => ({ CoArticulo: String(l.CoArticulo), CantidadOriginal: l.CantidadOriginal, PrecioUnitarioDigitado: l.PrecioUnitarioDigitado, Total: l.Total });

function verificarLineas(c: Control, momento: string, detalle: LineaDetalle[], referencia?: LineaDetalle[]) {
  c.igual(detalle.length, ARTICULOS.length, `${momento} › cantidad de líneas`);
  const art1 = detalle.find((l) => String(l.CoArticulo) === ARTICULOS[0].busqueda);
  c.igual(art1 && { cantidad: art1.CantidadOriginal, precio: art1.PrecioUnitarioDigitado }, { cantidad: ARTICULOS[0].cantidad, precio: ARTICULOS[0].precio }, `${momento} › línea (${ARTICULOS[0].busqueda})`);
  const art2 = detalle.find((l) => String(l.CoArticulo) !== ARTICULOS[0].busqueda);
  c.igual(art2?.CantidadOriginal, ARTICULOS[1].cantidad, `${momento} › cantidad de la caja de cartón`);
  c.igual((art2?.PrecioUnitarioDigitado ?? 0) > 0, true, `${momento} › precio de lista de la caja > 0`);
  if (referencia) c.igual(porArticulo(detalle).map(clave), porArticulo(referencia).map(clave), `${momento} › mismas líneas que la Orden de Compra`);
}

async function guardarYConsultar(page: Page, maxPrevio: number, cabecera?: (nro: number) => RegExp) {
  const mensajes = await guardarComprobante(page);
  const numero = await consultarUltimoComprobante(page, maxPrevio, cabecera);
  return { numero, mensajes };
}

const cabeceraFiscal = (cp: ComprobanteProveedor) => () => new RegExp(`\\|\\s*${cp.letraLugarNumero}\\b`);

test('circuito de compras: Orden de Compra -> Remito -> Factura (desde Pendientes)', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  const resumen: Record<string, unknown> = {};
  const registrarEtapa = async (clave: string, datos: unknown) => {
    resumen[clave] = datos;
    await test.info().attach('resumen.json', { body: JSON.stringify(resumen, null, 2), contentType: 'application/json' });
  };
  await login(page);

  // ---- Etapa 1: Orden de Compra ----------------------------------------------------------
  const ordenCompra = await test.step('Etapa 1 - Orden de Compra', async () => {
    const c = controlador('Orden de Compra');
    const maxPrevio = await abrirExploradorCompras(page, 'Ordenes de Compra');
    await nuevoComprobante(page);
    await seleccionarProveedor(page);
    await cargarArticulos(page, ARTICULOS);
    await expect.poll(async () => (await leerDetalle(page)).length, { message: 'líneas de la OC' }).toBe(ARTICULOS.length);
    const detallePre = await leerDetalle(page);
    verificarLineas(c, 'Pre-grabado', detallePre);
    const pre = await capturarImportes(page);
    verificarImputacionesCompras(c, 'Pre-grabado', pre);
    verificarCuadreTotales(c, 'Pre-grabado', pre.totales);

    const { numero } = await guardarYConsultar(page, maxPrevio);
    const post = await capturarImportes(page);
    const detalle = await leerDetalle(page);
    verificarLineas(c, 'Consultar', detalle, detallePre);
    compararPreVsConsultar(c, pre, post);

    await volverAlExplorador(page);
    const { sidebar, extras } = normalizarSidebar(c, await leerSidebarDetalles(page, numero), Object.keys(pre.totales));
    compararSidebar(c, pre, post, sidebar);
    return { numero, proveedor: PROVEEDOR_CODIGO, detalle, pre, post, sidebar, sidebarExtras: extras, diferencias: c.diferencias, observaciones: c.observaciones };
  });
  await registrarEtapa('ordenCompra', ordenCompra);

  // ---- Etapa 2: Remito de Compra desde Pendientes (Orden de Compra) -------------------------------
  const remitoCompra = await test.step('Etapa 2 - Remito de Compra', async () => {
    const c = controlador('Remito de Compra');
    const comprobante = comprobanteFicticio('R');
    const maxPrevio = await abrirExploradorCompras(page, 'Remitos');
    await nuevoComprobante(page);
    await seleccionarProveedor(page);
    await invocarPendiente(page, 'OCCP', ordenCompra.numero);
    await cargarComprobanteProveedor(page, comprobante);
    const detallePre = await leerDetalle(page);
    verificarLineas(c, 'Pre-grabado', detallePre, ordenCompra.detalle);
    c.igual([...new Set(detallePre.map((l) => l.NoDespacho))], [ordenCompra.numero], 'Pre-grabado › líneas con la Orden de Compra de origen (NoDespacho)');
    const pre = await capturarImportes(page);
    verificarImputacionesCompras(c, 'Pre-grabado', pre);
    for (const concepto of Object.keys(ordenCompra.post.totales)) {
      c.igual(pre.totales[concepto], ordenCompra.post.totales[concepto], `Pre-grabado vs. Orden de Compra › Totales › ${concepto}`);
    }

    const { numero } = await guardarYConsultar(page, maxPrevio, cabeceraFiscal(comprobante));
    const post = await capturarImportes(page);
    await irASeccion(page, 'Datos Básicos');
    c.igual(await page.locator('#LetraLugarNumero').inputValue(), comprobante.letraLugarNumero, 'Consultar › No. Comprobante Fiscal');
    const detalle = await leerDetalle(page);
    c.igual(porArticulo(detalle).map(clave), porArticulo(detallePre).map(clave), 'Consultar vs. Pre-grabado › detalle');
    compararPreVsConsultar(c, pre, post);

    await volverAlExplorador(page);
    const { sidebar, extras } = normalizarSidebar(c, await leerSidebarDetalles(page, numero), Object.keys(pre.totales));
    compararSidebar(c, pre, post, sidebar);
    return {
      numero,
      numeracionFiscal: comprobante.letraLugarNumero,
      noOperacion: comprobante.noOperacion,
      ordenCompra: ordenCompra.numero,
      detalle,
      pre,
      post,
      sidebar,
      sidebarExtras: extras,
      diferencias: c.diferencias,
      observaciones: c.observaciones,
    };
  });
  await registrarEtapa('remitoCompra', remitoCompra);

  // ---- Etapa 3: Factura de Compra desde Pendientes + Percepciones + Totales -------------------------
  const facturaCompra = await test.step('Etapa 3 - Factura de Compra', async () => {
    const c = controlador('Factura de Compra');
    const comprobante = comprobanteFicticio('A', 1);
    const maxPrevio = await abrirExploradorCompras(page, 'Facturas');
    await nuevoComprobante(page);
    await seleccionarProveedor(page);
    await invocarPendiente(page, 'RTCP', remitoCompra.numero, {
      reabrirComprobante: async () => {
        await volverAlExplorador(page);
        await nuevoComprobante(page);
        await seleccionarProveedor(page);
      },
    });
    await cargarComprobanteProveedor(page, comprobante);
    const detallePre = await leerDetalle(page);
    verificarLineas(c, 'Pre-grabado', detallePre, ordenCompra.detalle);
    c.igual([...new Set(detallePre.map((l) => `${l.NoDespacho}/${l.NoRemito}`))], [`${ordenCompra.numero}/${remitoCompra.numero}`], 'Pre-grabado › líneas con OC/Remito de origen');

    // Importes iniciales (desde el remito, sin percepciones)
    const inicial = await capturarImportes(page, { percepciones: true });
    for (const concepto of Object.keys(remitoCompra.post.totales)) {
      c.igual(inicial.totales[concepto], remitoCompra.post.totales[concepto], `Importes iniciales vs. Remito › Totales › ${concepto}`);
    }

    // Percepciones: 2 provincias distintas con importes aleatorios
    const percepcionesCargadas = elegirDistintas(PROVINCIAS_PERCEPCION, 2).map((provincia) => ({ provincia, importe: importeAleatorio(50, 900) }));
    for (const p of percepcionesCargadas) await agregarPercepcionCompra(page, p);
    const percepcionesPre = await leerPercepciones(page);
    c.igual(percepcionesPre.map((p) => fmt(p.monto)), percepcionesCargadas.map((p) => fmt(Number(p.importe))), 'Pre-grabado › percepciones cargadas (importes)');
    c.igual(new Set(percepcionesPre.map((p) => p.provincia)).size, 2, 'Pre-grabado › dos provincias distintas');
    const sumaPercepciones = percepcionesCargadas.reduce((s, p) => s + Number(p.importe), 0);

    // Totales: PERC. IIBB = suma de percepciones; PERC. IVA y PERC. GAN. aleatorios
    await irASeccion(page, 'Totales');
    const totalesConPercepciones = await leerTotales(page);
    c.igual(totalesConPercepciones['PERC. IIBB'], fmt(sumaPercepciones), 'Totales › PERC. IIBB = suma de percepciones');
    c.igual(
      totalesConPercepciones['IMPORTE $'],
      fmt(aNumero(inicial.totales['IMPORTE $']) + sumaPercepciones),
      'Totales › IMPORTE $ = importe inicial + percepciones',
    );
    // PERC. IVA / PERC. GAN.: se cargan en "Totales Otros" (en "Totales" son de solo lectura). Al agregar
    // percepciones la factura pasa a priorizar Totales Otros: esos son los importes que se graban.
    const percTotales = await cargarPercepcionesTotales(page, importeAleatorio(10, 400), importeAleatorio(10, 400));
    const totalesOtrosPre = await leerTotalesOtros(page);
    if (percTotales.cargado && totalesOtrosPre) {
      c.igual(totalesOtrosPre['PERC. IVA'], fmt(Number(percTotales.percIva)), 'Totales Otros › PERC. IVA cargada');
      c.igual(totalesOtrosPre['PERC. GAN.'], fmt(Number(percTotales.percGan)), 'Totales Otros › PERC. GAN. cargada');
      c.igual(totalesOtrosPre['PERC. IIBB'], fmt(sumaPercepciones), 'Totales Otros › PERC. IIBB = suma de percepciones');
      c.igual(
        totalesOtrosPre['IMPORTE $'],
        fmt(aNumero(totalesConPercepciones['IMPORTE $']) + Number(percTotales.percIva) + Number(percTotales.percGan)),
        'Totales Otros › IMPORTE $ = importe con percepciones + PERC. IVA + PERC. GAN.',
      );
    } else {
      c.observar(`PERC. IVA ${percTotales.percIva} / PERC. GAN. ${percTotales.percGan} no cargados: ${percTotales.motivo}`);
    }

    // Pre-grabado: imputaciones y percepciones del formulario; Totales = Totales Otros si la factura los prioriza
    const preSeccion = await capturarImportes(page, { percepciones: true });
    const pre: Importes = totalesOtrosPre ? { ...preSeccion, totales: totalesOtrosPre } : preSeccion;
    const vistaTotales = (momento: string, seccion: Record<string, string>, efectivos: Record<string, string>) => {
      const distintos = Object.keys(efectivos).filter((k) => seccion[k] !== efectivos[k]);
      if (distintos.length) {
        c.observar(`${momento} › la sección "Totales" no refleja "Totales Otros" (lo grabado): ${distintos.map((k) => `${k} ${seccion[k]} vs. ${efectivos[k]}`).join(', ')}`);
      }
    };
    vistaTotales('Pre-grabado', preSeccion.totales, pre.totales);
    verificarImputacionesCompras(c, 'Pre-grabado', pre);
    verificarCuadreTotales(c, 'Pre-grabado', pre.totales);

    const { numero, mensajes } = await guardarYConsultar(page, maxPrevio, cabeceraFiscal(comprobante));
    const postSeccion = await capturarImportes(page);
    const percepcionesPost = await leerPercepcionesConsulta(page);
    const totalesOtrosPost = await leerTotalesOtros(page);
    const post: Importes = { ...postSeccion, percepciones: percepcionesPost, totales: totalesOtrosPost ?? postSeccion.totales };
    vistaTotales('Consultar', postSeccion.totales, post.totales);
    await irASeccion(page, 'Datos Básicos');
    c.igual(await page.locator('#LetraLugarNumero').inputValue(), comprobante.letraLugarNumero, 'Consultar › No. Comprobante Fiscal');
    const detalle = await leerDetalle(page);
    c.igual(porArticulo(detalle).map(clave), porArticulo(detallePre).map(clave), 'Consultar vs. Pre-grabado › detalle');
    compararPreVsConsultar(c, pre, post);
    if (mensajes.length) console.log(`Factura de Compra ${numero}: ${mensajes.join(' | ')}`);

    await volverAlExplorador(page);
    const { sidebar, extras } = normalizarSidebar(c, await leerSidebarDetalles(page, numero), Object.keys(pre.totales));
    compararSidebar(c, pre, post, sidebar);
    // El sidebar no tiene solapa de Percepciones: se valida por PERC. IIBB de Totales
    c.igual(sidebar.totales['PERC. IIBB'], fmt(sumaPercepciones), 'Sidebar › PERC. IIBB = suma de percepciones cargadas');
    return {
      numero,
      numeracionFiscal: comprobante.letraLugarNumero,
      noOperacion: comprobante.noOperacion,
      remitoCompra: remitoCompra.numero,
      ordenCompra: ordenCompra.numero,
      detalle,
      inicial: inicial.totales,
      percepcionesCargadas,
      percepcionesTotales: percTotales,
      totalesConPercepciones,
      totalesSeccion: { pre: preSeccion.totales, post: postSeccion.totales },
      pre,
      post,
      sidebar,
      sidebarExtras: extras,
      diferencias: c.diferencias,
      observaciones: c.observaciones,
    };
  });
  await registrarEtapa('facturaCompra', facturaCompra);
  console.log(`RESUMEN ${JSON.stringify(resumen)}`);
});
