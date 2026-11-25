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
  articulosCompraAleatorios,
  MONTO_MINIMO_OC,
  PROVEEDOR_CODIGO,
  Importes,
  LineaDetalle,
  SidebarDetalles,
  ComprobanteProveedor,
  abrirComprobantesCompra,
  buscarComprobanteCompra,
  filaComprobante,
  intentarEditarComprobante,
  consultarComprobante,
  leerTotalesComprobante,
  leerImputacionesComprobante,
  leerPercepcionesComprobante,
  leerSidebarComprobante,
  abrirPagos,
  nuevoPago,
  seleccionarComprobanteCobranza,
  leerRetencionesPago,
  totalRetenciones,
  RetencionComprobante,
  agregarValorCobranza,
  leerSaldoCobranza,
  leerValoresCobranza,
  leerComprobantesCobranza,
  filaCobranzaEnGrilla,
  cabeceraCobranza,
} from '../utils/igglobal';

/**
 * Circuito de Compras (primera etapa, sin pagos): Orden de Compra → Remito de Compra → Factura de Compra,
 * Remito y Factura invocados desde Pendientes. Cada corrida arma el circuito completo desde cero con el
 * proveedor 10 y compara, en cada comprobante, Pre-grabado vs. Consultar vs. Sidebar (Más › Ver Detalles).
 *
 * Las diferencias se registran con `expect.soft` (el test sigue y el informe muestra cada concepto) y se
 * guardan en `diferencias` de cada etapa del resumen.json.
 */

/** (1003) x 4 a un precio aleatorio con decimales (neto > $ 869,000.00) + caja a precio de lista. */
const ARTICULOS = articulosCompraAleatorios(MONTO_MINIMO_OC);
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
    // Monto alto para que Pagos calcule retenciones reales (IIBB, Ganancias)
    c.igual(aNumero(pre.totales['TOTAL NETO']) > MONTO_MINIMO_OC, true, `Pre-grabado › Total Neto ${pre.totales['TOTAL NETO']} > ${fmt(MONTO_MINIMO_OC)}`);
    c.igual(aNumero(pre.totales['IMPORTE $']) > MONTO_MINIMO_OC, true, `Pre-grabado › IMPORTE $ ${pre.totales['IMPORTE $']} > ${fmt(MONTO_MINIMO_OC)}`);

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

  // ---- Etapa 4: Comprobantes de Compra (solo importes) ----------------------------------------
  // Referencia = lo GRABADO en la factura (Pre-grabado con Totales Otros, que coincide con su Sidebar). La vista
  // Consultar de Facturas pierde las percepciones (defecto conocido): se contrasta aparte, sin tomarla como verdad.
  const comprobanteCompra = await test.step('Etapa 4 - Comprobantes de Compra', async () => {
    const c = controlador('Comprobantes de Compra');
    const lln = facturaCompra.numeracionFiscal;
    const grabado = facturaCompra.pre;
    const percepcionesGrabadas = (grabado.percepciones ?? []).map((p) => [p.provincia, fmt(Number(p.monto))]);
    const sinDiscriminar = (t: Record<string, string>) => Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'Total a Discriminar'));

    await abrirComprobantesCompra(page);
    const datosFila = await buscarComprobanteCompra(page, lln);
    const fila = filaComprobante(page, lln);
    // Grilla: proveedor, No. Operación e importes (Impuesto4 = PERC. IVA, Impuesto5 = PERC. IIBB, Impuesto6 = PERC. GAN.)
    c.igual(datosFila.coCliente, Number(PROVEEDOR_CODIGO), 'Grilla › proveedor');
    c.igual(datosFila.noOperacion, facturaCompra.noOperacion, 'Grilla › No. Operación = el cargado en la factura');
    c.igual(fmt(datosFila.importe), grabado.totales['IMPORTE $'], 'Grilla › Importe Original = IMPORTE $ grabado');
    const columnasGrilla: [string, string][] = [['Monto1', 'GRAV 21%'], ['Impuesto1', 'IVA 21%'], ['Impuesto4', 'PERC. IVA'], ['Impuesto5', 'PERC. IIBB'], ['Impuesto6', 'PERC. GAN.']];
    for (const [campo, concepto] of columnasGrilla) {
      c.igual(fmt(datosFila.montos[campo] ?? NaN), grabado.totales[concepto], `Grilla › ${concepto} (${campo})`);
    }

    // Editar: según el estado puede estar bloqueado; si abre, se leen Totales y Percepciones y se sale SIN grabar
    const edicion = await intentarEditarComprobante(page, fila, lln, async () => ({
      totales: sinDiscriminar(await leerTotalesComprobante(page)), // antes de sacar el foco de "Total a Discriminar"
      percepciones: await leerPercepcionesComprobante(page),
    }));
    c.observar(`Estado "${datosFila.estado}": edición ${edicion.permitido ? 'permitida (se salió sin grabar)' : `bloqueada (${edicion.mensaje})`}`);
    if (edicion.datos) {
      for (const [k, v] of Object.entries(grabado.totales)) c.igual(edicion.datos.totales[k], v, `Editar vs. Factura grabada › Totales › ${k}`);
      c.igual(edicion.datos.percepciones.map((p) => [p.provincia, fmt(Number(p.monto))]), percepcionesGrabadas, 'Editar vs. Factura grabada › Percepciones');
    }

    // Consultar: Totales apenas abre (recálculo al salir de "Total a Discriminar"), Imputaciones y Percepciones
    await consultarComprobante(page, fila, lln);
    const totales = sinDiscriminar(await leerTotalesComprobante(page));
    const imputaciones = await leerImputacionesComprobante(page);
    const percepciones = await leerPercepcionesComprobante(page);
    await irASeccion(page, 'Datos Básicos');
    const totalesTrasRecalculo = sinDiscriminar(await leerTotalesComprobante(page));
    const recalculados = Object.keys(totales).filter((k) => totalesTrasRecalculo[k] !== totales[k]);
    if (recalculados.length) c.observar(`Recálculo en pantalla al salir de "Total a Discriminar": ${recalculados.map((k) => `${k} ${totales[k]} → ${totalesTrasRecalculo[k]}`).join(', ')}`);
    await volverAlExplorador(page);

    for (const [k, v] of Object.entries(grabado.totales)) c.igual(totales[k], v, `Consultar vs. Factura grabada › Totales › ${k}`);
    c.igual(percepciones.map((p) => [p.provincia, fmt(Number(p.monto))]), percepcionesGrabadas, 'Consultar vs. Factura grabada › Percepciones');
    for (const tipo of IMPUTACIONES_EXIGIDAS) {
      c.igual(imputaciones[tipo].totalImputado, grabado[tipo].totalImputado, `Consultar vs. Factura grabada › Imputaciones › ${tipo} › Total Imputado`);
      c.igual(imputaciones[tipo].importes, grabado[tipo].importes, `Consultar vs. Factura grabada › Imputaciones › ${tipo} › importes`);
    }
    if (JSON.stringify(imputaciones.conceptos.importes) !== JSON.stringify(facturaCompra.post.conceptos.importes)) {
      c.observar(`Imputaciones › Conceptos [${imputaciones.conceptos.importes.join(' + ') || 'sin filas'}] vs. Factura › Consultar [${facturaCompra.post.conceptos.importes.join(' + ') || 'sin filas'}]`);
    }

    // Sidebar Más › Ver Detalles (#showFacturasDebitosCreditosDetallesRightSidebar)
    await buscarComprobanteCompra(page, lln);
    const sidebarLeido = await leerSidebarComprobante(page, fila, lln);
    const { sidebar } = normalizarSidebar(c, sidebarLeido, Object.keys(grabado.totales));
    for (const [k, v] of Object.entries(totales)) c.igual(sidebar.totales[k], v, `Sidebar vs. Consultar › Totales › ${k}`);
    c.igual(sidebar.resumen.total, totales['IMPORTE $'], 'Sidebar vs. Consultar › Total (encabezado)');
    c.igual(sidebar.resumen.neto, totales['TOTAL NETO'], 'Sidebar vs. Consultar › Neto (encabezado)');
    for (const tipo of IMPUTACIONES_EXIGIDAS) c.igual(sidebar.imputaciones[tipo], imputaciones[tipo].importes, `Sidebar vs. Consultar › Imputaciones › ${tipo}`);
    for (const [k, v] of Object.entries(facturaCompra.sidebar.totales)) c.igual(sidebar.totales[k], v, `Sidebar vs. Sidebar de Facturas › Totales › ${k}`);

    // Contraste con la vista Consultar de Facturas (defecto conocido): se informa qué recupera Comprobantes
    const perdidasEnFactura = Object.keys(totales).filter((k) => facturaCompra.post.totales[k] !== undefined && facturaCompra.post.totales[k] !== totales[k]);
    if (perdidasEnFactura.length || (facturaCompra.post.percepciones ?? []).length !== percepciones.length) {
      c.observar(
        `Comprobantes recupera lo que Facturas › Consultar pierde: percepciones ${percepciones.length} vs. ${(facturaCompra.post.percepciones ?? []).length}` +
          `${perdidasEnFactura.length ? `; ${perdidasEnFactura.map((k) => `${k} ${totales[k]} vs. ${facturaCompra.post.totales[k]}`).join(', ')}` : ''}`,
      );
    }
    return {
      numero: datosFila.noOperacion,
      ...datosFila,
      edicion,
      totales,
      totalesTrasRecalculo,
      percepciones,
      imputaciones,
      sidebar,
      referencia: { factura: facturaCompra.numero, totales: grabado.totales, percepciones: grabado.percepciones ?? [] },
      diferencias: c.diferencias,
      observaciones: c.observaciones,
    };
  });
  await registrarEtapa('comprobanteCompra', comprobanteCompra);

  // ---- Etapa 5: Pago de la factura (retenciones + 2 valores, cuenta 1000) ---------------------------
  const pago = await test.step('Etapa 5 - Pago', async () => {
    const c = controlador('Pago');
    const lln = facturaCompra.numeracionFiscal;
    const totalFactura = facturaCompra.pre.totales['IMPORTE $']; // lo grabado (= Sidebar y Comprobantes de Compra)
    const noOperacionAleatorio = () => Math.floor(100_000 + Math.random() * 900_000);
    const suma = (vs: { importe: number }[]) => Math.round(vs.reduce((s, v) => s + Number(v.importe), 0) * 100) / 100;

    const maxPrevio = await abrirPagos(page);
    await nuevoPago(page);
    await seleccionarProveedor(page); // Datos Básicos: solo el proveedor 10

    // Comprobantes: la factura del circuito; "Importe Aplicar" = deuda = total grabado
    const aplicado = await seleccionarComprobanteCobranza(page, lln);
    c.igual(fmt(aplicado.importeAplicar), totalFactura, 'Pre-grabado › Importe a aplicar = Total de la factura grabada');
    c.igual(fmt(aplicado.deuda), totalFactura, 'Pre-grabado › Deuda del comprobante = Total de la factura grabada');
    c.igual(fmt(aplicado.importeAplicar), fmt(comprobanteCompra.importe), 'Pre-grabado › Importe a aplicar = Importe en Comprobantes de Compra');

    // Retenciones: se abre el detalle de cada una (Ret. IVA / Ganancias / IIBB / SUSS / Otros)
    const retencionesPre = await leerRetencionesPago(page, { detalle: true });
    const retPre = retencionesPre.find((r) => r.letraLugarNumero === lln);
    c.igual(!!retPre, true, `Pre-grabado › Retenciones › fila de ${lln}`);
    const totalRet = retPre ? totalRetenciones(retPre) : 0;
    if (retPre) {
      c.igual(fmt(retPre.aplicado), fmt(aplicado.importeAplicar), 'Pre-grabado › Retenciones › Aplicado = Importe a aplicar');
      c.igual(fmt(retPre.sujeto), facturaCompra.pre.totales['TOTAL NETO'], 'Pre-grabado › Retenciones › Sujeto = Neto de la factura');
      c.igual(fmt(retPre.iva), facturaCompra.pre.totales['IVA 21%'], 'Pre-grabado › Retenciones › IVA = IVA de la factura');
      for (const [clave, d] of Object.entries(retPre.detalle ?? {})) {
        if (typeof d === 'string') c.observar(`Retención ${clave}: ${d}`);
        else c.igual(fmt(suma(d.filas.map((f) => ({ importe: f.importe })))), fmt(Number(retPre[clave as keyof typeof retPre] ?? 0)), `Pre-grabado › Retenciones › ${d.titulo || clave}: detalle = celda`);
      }
      // Con neto > $ 869,000.00 el ERP debe calcular retenciones reales de IIBB y Ganancias
      if (aNumero(facturaCompra.pre.totales['TOTAL NETO']) > MONTO_MINIMO_OC) {
        c.igual(retPre.retIIBB > 0, true, `Pre-grabado › Retención IIBB calculada (> 0) con neto ${facturaCompra.pre.totales['TOTAL NETO']}`);
        c.igual(retPre.retGanancias > 0, true, `Pre-grabado › Retención Ganancias calculada (> 0) con neto ${facturaCompra.pre.totales['TOTAL NETO']}`);
      }
      c.observar(`Retenciones calculadas: IVA ${fmt(retPre.retIva)}, Ganancias ${fmt(retPre.retGanancias)}, IIBB ${fmt(retPre.retIIBB)}, SUSS ${fmt(retPre.retSUSS)}, Otros ${fmt(retPre.retOtros)} (total ${fmt(totalRet)})`);
    }

    // Valores: neto a pagar = aplicado - retenciones, repartido al azar entre subcuentas 1 y 2 (2 decimales)
    const netoAPagar = Math.round((aplicado.importeAplicar - totalRet) * 100);
    const saldos: string[] = [await leerSaldoCobranza(page, { esperarSaldo: true })];
    c.igual(saldos[0], fmt(netoAPagar / 100), 'Pre-grabado › Saldo inicial = Importe a aplicar - Retenciones');
    const primero = Math.round(netoAPagar * (0.3 + Math.random() * 0.4));
    const valoresACargar = [primero, netoAPagar - primero].map((cent, i) => ({
      operacion: '53',
      noOperacion: String(noOperacionAleatorio()),
      cuenta: '1000',
      subCuenta: String(i + 1),
      importe: (cent / 100).toFixed(2),
    }));
    for (const [i, valor] of valoresACargar.entries()) {
      await agregarValorCobranza(page, valor);
      saldos.push(await leerSaldoCobranza(page, { esperarSaldo: i < valoresACargar.length - 1 }));
    }
    const valoresPre = await leerValoresCobranza(page);
    c.igual(valoresPre.length, 2, 'Pre-grabado › 2 valores cargados');
    c.igual(fmt(suma(valoresPre) + totalRet), fmt(aplicado.importeAplicar), 'Pre-grabado › Valores + Retenciones = Importe a aplicar');
    c.igual(saldos[saldos.length - 1], '0.00', 'Pre-grabado › Saldo final');

    // Grabar y Consultar
    await guardarComprobante(page);
    const numero = await consultarUltimoComprobante(page, maxPrevio, cabeceraCobranza);
    await irASeccion(page, 'Comprobantes');
    await expect.poll(async () => (await leerComprobantesCobranza(page)).length, { message: 'comprobantes del pago consultado' }).toBeGreaterThan(0);
    const comprobantesPost = await leerComprobantesCobranza(page);
    const aplicadoPost = comprobantesPost.find((x) => x.letraLugarNumero === lln);
    c.igual(comprobantesPost.map((x) => x.letraLugarNumero), [lln], 'Consultar › Comprobantes › solo la factura del circuito');
    c.igual(aplicadoPost && fmt(aplicadoPost.importeAplicar), fmt(aplicado.importeAplicar), 'Consultar › Comprobantes › Importe aplicado = antes de grabar');
    c.igual(aplicadoPost && fmt(aplicadoPost.deuda), '0.00', 'Consultar › Comprobantes › Deuda cancelada');
    const retencionesPost = await leerRetencionesPago(page, { detalle: true });
    const retPost = retencionesPost.find((r) => r.letraLugarNumero === lln);
    const sinDetalle = (r?: RetencionComprobante) => r && { ...r, detalle: undefined };
    c.igual(sinDetalle(retPost), sinDetalle(retPre), 'Consultar › Retenciones = antes de grabar');
    await irASeccion(page, 'Detalle de Valores');
    await expect.poll(async () => (await leerValoresCobranza(page)).length, { message: 'valores del pago consultado' }).toBeGreaterThan(0);
    const valoresPost = await leerValoresCobranza(page);
    const clave = (v: { noOperacion: number; cuenta: string; subCuenta: string; importe: number }) => `${v.noOperacion}|${v.cuenta}|${v.subCuenta}|${fmt(Number(v.importe))}`;
    c.igual(valoresPost.map(clave).sort(), valoresPre.map(clave).sort(), 'Consultar › Valores = cargados (No. Operación | cuenta | subcuenta | importe)');
    c.igual(fmt(suma(valoresPost)), fmt(netoAPagar / 100), 'Consultar › Total valores = neto a pagar');

    await volverAlExplorador(page);
    await expect.poll(() => filaCobranzaEnGrilla(page, numero), { timeout: 20_000 }).not.toBeNull().catch(() => {});
    const grilla = await filaCobranzaEnGrilla(page, numero);
    c.igual(grilla?.coCliente, Number(PROVEEDOR_CODIGO), `Grilla › pago ${numero} del proveedor ${PROVEEDOR_CODIGO}`);
    if (grilla) {
      c.igual(fmt(grilla.total), totalFactura, 'Grilla › Total = Total de la factura grabada');
      // Con retenciones: Liquidado (comprobantes) = Pagado (valores) + Retenciones
      c.igual(fmt(grilla.liquidado), fmt(aplicado.importeAplicar), 'Grilla › Liquidado = Importe aplicado');
      c.igual(fmt(grilla.pagado), fmt(suma(valoresPre)), 'Grilla › Pagado = Total valores');
      c.igual(fmt(grilla.liquidado - grilla.pagado), fmt(totalRet), 'Grilla › Liquidado - Pagado = Retenciones');
      if (retPre) {
        const r = grilla.retenciones;
        c.igual(
          [r.iva, r.ganancias, r.iibb, r.suss, r.otros].map((n) => fmt(Number(n))),
          [retPre.retIva, retPre.retGanancias, retPre.retIIBB, retPre.retSUSS, retPre.retOtros].map((n) => fmt(Number(n))),
          'Grilla › Retenciones por tipo (IVA, Ganancias, IIBB, SUSS, Otros) = solapa Retenciones',
        );
      }
      const conImporte = [retPre?.retIva, retPre?.retGanancias, retPre?.retIIBB, retPre?.retSUSS, retPre?.retOtros].filter((n) => Number(n) !== 0).length;
      if (grilla.cantidadRetenciones !== conImporte) c.observar(`Grilla › campo "Retenciones" = ${grilla.cantidadRetenciones} (retenciones con importe en la solapa: ${conImporte})`);
    }
    console.log(`Pago ${numero}: aplica ${lln} por ${fmt(aplicado.importeAplicar)}, retenciones ${fmt(totalRet)}, valores ${valoresPre.map((v) => `${v.subCuenta} ${fmt(v.importe)}`).join(' + ')}${c.diferencias.length ? ` · DIFERENCIAS: ${c.diferencias.join(' | ')}` : ''}`);
    return {
      numero,
      letraLugarNumero: lln,
      totalFactura,
      aplicado,
      retencionesPre,
      retencionesPost,
      totalRetenciones: totalRet,
      saldos,
      valoresCargados: valoresACargar,
      valoresPre,
      comprobantesPost,
      valoresPost,
      grilla,
      diferencias: c.diferencias,
      observaciones: c.observaciones,
    };
  });
  await registrarEtapa('pago', pago);
  console.log(`RESUMEN ${JSON.stringify(resumen)}`);
});
