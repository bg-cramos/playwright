import { test, expect, Page } from '@playwright/test';
import {
  ARTICULO_CODIGO,
  ARTICULOS_POR_DEFECTO,
  login,
  abrirPedidos,
  abrirExplorador,
  nuevoComprobante,
  seleccionarCliente,
  cargarClienteYArticulos,
  invocarPendiente,
  leerDetalle,
  capturarImportes,
  guardarComprobante,
  consultarUltimoComprobante,
  volverAlExplorador,
  generarRemito,
  numeracionFiscalEnCabecera,
  leerSidebarDetalles,
  abrirComprobantes,
  buscarComprobante,
  filaComprobante,
  intentarEditarComprobante,
  consultarComprobante,
  leerTotalesComprobante,
  leerImputacionesComprobante,
  leerSidebarComprobante,
  irASeccion,
  abrirCobranzas,
  nuevaCobranza,
  seleccionarComprobanteCobranza,
  agregarValorCobranza,
  leerSaldoCobranza,
  leerComprobantesCobranza,
  leerValoresCobranza,
  filaCobranzaEnGrilla,
  cabeceraCobranza,
  CLIENTE_CODIGO,
  Importes,
  LineaDetalle,
  SidebarDetalles,
} from '../utils/igglobal';

// (1002) x 3 a $3500 + CAJA DE CARTON CORRUGADO PARA 2 EQUIPOS x 5 a precio de lista
const ARTICULOS = ARTICULOS_POR_DEFECTO;
const DESCUENTO = 'DESCUENTO / RECARGO';

/** Compara campo por campo los importes capturados antes de grabar contra los de la consulta. */
function compararImportes(etapa: string, pre: Importes, post: Importes) {
  expect.soft(post.contables, `${etapa} › Imputaciones › Contables`).toEqual(pre.contables);
  expect.soft(post.conceptos, `${etapa} › Imputaciones › Conceptos`).toEqual(pre.conceptos);
  expect.soft(post.provincias, `${etapa} › Imputaciones › Provincias`).toEqual(pre.provincias);
  if (pre.percepciones) {
    expect.soft(post.percepciones, `${etapa} › Percepciones`).toEqual(pre.percepciones);
  }
  for (const [concepto, valor] of Object.entries(pre.totales)) {
    expect.soft(post.totales[concepto], `${etapa} › Totales › ${concepto}`).toBe(valor);
  }
  expect(Object.keys(post.totales), `${etapa} › mismos conceptos en Totales`).toEqual(Object.keys(pre.totales));
}

const aNumero = (monto: string) => Number(monto.replace(/,/g, ''));
const igualesSinOrden = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/**
 * Tercera fuente: el sidebar "Más > Ver Detalles" de la grilla debe mostrar exactamente lo mismo
 * que el formulario antes de grabar (`pre`) y en Consultar (`post`).
 */
function compararSidebar(etapa: string, pre: Importes, post: Importes, sidebar: SidebarDetalles) {
  for (const [momento, fuente] of [['antes de grabar', pre], ['Consultar', post]] as const) {
    for (const tipo of ['contables', 'conceptos', 'provincias'] as const) {
      expect.soft(sidebar.imputaciones[tipo], `${etapa} › Sidebar vs. ${momento} › Imputaciones › ${tipo}`).toEqual(fuente[tipo].importes);
    }
    for (const [concepto, valor] of Object.entries(fuente.totales)) {
      expect.soft(sidebar.totales[concepto], `${etapa} › Sidebar vs. ${momento} › Totales › ${concepto}`).toBe(valor);
    }
    expect.soft(sidebar.resumen.total, `${etapa} › Sidebar vs. ${momento} › Total`).toBe(fuente.totales['IMPORTE $']);
    expect.soft(sidebar.resumen.neto, `${etapa} › Sidebar vs. ${momento} › Neto`).toBe(fuente.totales['TOTAL NETO']);
  }
  expect(Object.keys(sidebar.totales).sort(), `${etapa} › Sidebar › mismos conceptos en Totales`).toEqual(Object.keys(pre.totales).sort());
  // Impuestos del sidebar = Total - Neto
  expect.soft(aNumero(sidebar.resumen.impuestos), `${etapa} › Sidebar › Impuestos = Total - Neto`).toBeCloseTo(
    aNumero(sidebar.resumen.total) - aNumero(sidebar.resumen.neto),
    2,
  );
}

/** El descuento del cliente 59 tiene que estar aplicado (DESCUENTO / RECARGO distinto de 0.00). */
function verificarDescuento(etapa: string, totales: Record<string, string>) {
  expect(totales, `${etapa} › Totales muestra "${DESCUENTO}"`).toHaveProperty([DESCUENTO]);
  expect(aNumero(totales[DESCUENTO]), `${etapa} › ${DESCUENTO} aplicado (≠ 0.00)`).not.toBe(0);
}

/** Remito y Factura respetan el descuento y la base del pedido (mismo Bruto, Descuento y Neto). */
function verificarDescuentoDelPedido(etapa: string, totales: Record<string, string>, pedido: Record<string, string>) {
  for (const concepto of ['TOTAL BRUTO', DESCUENTO, 'TOTAL NETO']) {
    expect.soft(totales[concepto], `${etapa} › ${concepto} igual al Pedido`).toBe(pedido[concepto]);
  }
}

const porArticulo = (detalle: LineaDetalle[]) => [...detalle].sort((a, b) => String(a.CoArticulo).localeCompare(String(b.CoArticulo)));

/**
 * Verifica las dos líneas: (1002) x 3 a $3500 y la caja x 5 con precio de lista > 0.
 * `extra` se exige en todas las líneas (NoPedido, NoRemito); `referencia` = detalle del pedido.
 */
function verificarLineas(etapa: string, detalle: LineaDetalle[], extra: Partial<LineaDetalle> = {}, referencia?: LineaDetalle[]) {
  expect(detalle, `${etapa} › líneas del detalle`).toHaveLength(ARTICULOS.length);
  const art1 = detalle.find((l) => String(l.CoArticulo) === ARTICULO_CODIGO);
  const art2 = detalle.find((l) => String(l.CoArticulo) !== ARTICULO_CODIGO);
  expect(art1, `${etapa} › línea (1002)`).toMatchObject({ CantidadOriginal: ARTICULOS[0].cantidad, PrecioUnitarioDigitado: ARTICULOS[0].precio, ...extra });
  expect(art2, `${etapa} › línea caja de cartón`).toMatchObject({ CantidadOriginal: ARTICULOS[1].cantidad, ...extra });
  expect(art2!.PrecioUnitarioDigitado, `${etapa} › precio de lista de la caja`).toBeGreaterThan(0);
  if (referencia) {
    const clave = (l: LineaDetalle) => ({ CoArticulo: l.CoArticulo, CantidadOriginal: l.CantidadOriginal, PrecioUnitarioDigitado: l.PrecioUnitarioDigitado });
    expect.soft(porArticulo(detalle).map(clave), `${etapa} › mismas líneas que el Pedido`).toEqual(porArticulo(referencia).map(clave));
  }
}

async function guardarYConsultar(page: Page, maxPrevio: number) {
  const mensajes = await guardarComprobante(page);
  const numero = await consultarUltimoComprobante(page, maxPrevio);
  return { numero, mensajes };
}

test('circuito comercial: Pedido -> Remito -> Factura (desde Pendientes)', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  // Resumen para el informe: se adjunta después de cada etapa, así una falla muestra hasta dónde llegó
  // (el reporter toma el último adjunto "resumen.json").
  const resumen: Record<string, unknown> = {};
  const registrarEtapa = async (clave: string, datos: unknown) => {
    resumen[clave] = datos;
    await test.info().attach('resumen.json', { body: JSON.stringify(resumen, null, 2), contentType: 'application/json' });
  };
  await login(page);

  // ---- Etapa 1: Pedido -------------------------------------------------------------
  const pedido = await test.step('Etapa 1 - Pedido', async () => {
    const maxPrevio = await abrirPedidos(page);
    await nuevoComprobante(page);
    await cargarClienteYArticulos(page, ARTICULOS);
    const detallePre = await leerDetalle(page);
    verificarLineas('Pedido (antes de grabar)', detallePre);
    const pre = await capturarImportes(page);
    verificarDescuento('Pedido › antes de grabar', pre.totales);

    const { numero } = await guardarYConsultar(page, maxPrevio);
    const post = await capturarImportes(page);
    const detalle = await leerDetalle(page);
    verificarLineas('Pedido (Consultar)', detalle, {}, detallePre);
    compararImportes('Pedido', pre, post);

    // Tercera fuente: grilla de Pedidos > Más > Ver Detalles
    await volverAlExplorador(page);
    const sidebar = await leerSidebarDetalles(page, numero);
    verificarDescuento('Pedido › Sidebar', sidebar.totales);
    compararSidebar('Pedido', pre, post, sidebar);
    return { numero, detalle, pre, post, sidebar };
  });
  await registrarEtapa('pedido', pedido);

  // ---- Etapa 2: Remito desde Pendientes (Pedido) --------------------------------------
  const remito = await test.step('Etapa 2 - Remito', async () => {
    const maxPrevio = await abrirExplorador(page, 'Remitos');
    await nuevoComprobante(page);
    await seleccionarCliente(page);
    await invocarPendiente(page, 'PDVT', pedido.numero);
    const detallePre = await leerDetalle(page);
    verificarLineas('Remito', detallePre, { NoPedido: pedido.numero }, pedido.detalle);
    const pre = await capturarImportes(page);
    verificarDescuento('Remito › antes de grabar', pre.totales);
    verificarDescuentoDelPedido('Remito', pre.totales, pedido.pre.totales);

    const { numero } = await guardarYConsultar(page, maxPrevio);
    const post = await capturarImportes(page);
    const detallePost = await leerDetalle(page);
    expect.soft(detallePost, 'Remito › detalle grabado vs. consultado').toEqual(detallePre);
    compararImportes('Remito', pre, post);

    // Generar el remito (numeración fiscal + stock): sin esto no aparece en Pendientes de Facturas
    await volverAlExplorador(page);
    const numeracionFiscal = await generarRemito(page, numero);
    return { numero, numeracionFiscal, detalle: detallePost, pre, post };
  });
  await registrarEtapa('remito', remito);

  // ---- Etapa 3: Factura desde Pendientes (Remito) -------------------------------------
  const factura = await test.step('Etapa 3 - Factura', async () => {
    const maxPrevio = await abrirExplorador(page, 'Facturas');
    await nuevoComprobante(page);
    await seleccionarCliente(page);
    // El remito generado puede tardar en aparecer como pendiente: si no está, se reabre la factura
    await invocarPendiente(page, 'RTVT', remito.numero, {
      reabrirComprobante: async () => {
        await volverAlExplorador(page);
        await nuevoComprobante(page);
        await seleccionarCliente(page);
      },
    });
    const detallePre = await leerDetalle(page);
    verificarLineas('Factura', detallePre, { NoPedido: pedido.numero, NoRemito: remito.numero }, pedido.detalle);
    const pre = await capturarImportes(page, { percepciones: true });
    verificarDescuento('Factura › antes de grabar', pre.totales);
    verificarDescuentoDelPedido('Factura', pre.totales, pedido.pre.totales);

    const { numero, mensajes } = await guardarYConsultar(page, maxPrevio);
    // Factura GENERADA (requisito para impactar en cuenta corriente): la consulta muestra la numeración fiscal
    const numeracionFiscal = await numeracionFiscalEnCabecera(page);
    expect(numeracionFiscal, 'Factura generada con numeración fiscal').toMatch(/^[A-Z]-\d{4}-\d{8}$/);
    const post = await capturarImportes(page, { percepciones: true });
    const detallePost = await leerDetalle(page);
    expect.soft(detallePost, 'Factura › detalle grabado vs. consultado').toEqual(detallePre);
    compararImportes('Factura', pre, post);
    console.log(`Factura ${numero}: ${mensajes.join(' | ')}`);

    // Tercera fuente: grilla de Ventas Facturas > Más > Ver Detalles
    await volverAlExplorador(page);
    const sidebar = await leerSidebarDetalles(page, numero);
    verificarDescuento('Factura › Sidebar', sidebar.totales);
    compararSidebar('Factura', pre, post, sidebar);
    return { numero, numeracionFiscal, detalle: detallePost, pre, post, sidebar };
  });
  await registrarEtapa('factura', factura);

  // ---- Etapa 4: Comprobantes de Ventas (solo importes) --------------------------------
  const comprobante = await test.step('Etapa 4 - Comprobantes', async () => {
    const lln = factura.numeracionFiscal!;
    await abrirComprobantes(page);
    // Búsqueda por Letra-Lugar-Número + cliente 59
    const datosFila = await buscarComprobante(page, lln);
    expect(datosFila, 'Comprobantes › fila de la factura').toMatchObject({ letraLugarNumero: lln, coCliente: Number(CLIENTE_CODIGO) });
    expect.soft(aNumero(String(datosFila.importe)), 'Comprobantes › importe de la grilla = IMPORTE $ de la factura').toBeCloseTo(
      aNumero(factura.post.totales['IMPORTE $']),
      2,
    );
    const fila = filaComprobante(page, lln);

    // Editar: según el estado puede estar bloqueado (pagado / estado sin edición); nunca graba
    const edicion = await intentarEditarComprobante(page, fila, lln);
    console.log(`Comprobantes ${lln}: estado "${datosFila.estado}", edición ${edicion.permitido ? 'permitida' : `bloqueada (${edicion.mensaje})`}`);

    // Datos Básicos (Consultar): importes apenas abre (antes de sacar el foco de "Total a Discriminar")
    await consultarComprobante(page, fila, lln);
    const totales = await leerTotalesComprobante(page);
    const imputaciones = await leerImputacionesComprobante(page);
    // Al salir de "Total a Discriminar" la pantalla recalcula los importes: se informa, no se graba
    await irASeccion(page, 'Datos Básicos');
    const totalesTrasRecalculo = await leerTotalesComprobante(page);
    const recalculados = Object.keys(totales).filter((k) => totalesTrasRecalculo[k] !== totales[k]);
    if (recalculados.length) {
      const detalle = recalculados.map((k) => `${k}: ${totales[k]} → ${totalesTrasRecalculo[k]}`).join(' | ');
      test.info().annotations.push({ type: 'Comprobantes › recálculo en pantalla al salir de "Total a Discriminar"', description: detalle });
      console.log(`Comprobantes › recálculo en pantalla: ${detalle}`);
    }
    await volverAlExplorador(page);

    // Sidebar Más > Ver Detalles sobre la misma fila
    await buscarComprobante(page, lln);
    const sidebar = await leerSidebarComprobante(page, fila, lln);

    // ---- Validaciones: Datos Básicos vs. Factura, Sidebar vs. Datos Básicos y Factura
    verificarDescuento('Comprobantes › Datos Básicos', totales);
    verificarDescuento('Comprobantes › Sidebar', sidebar.totales);
    for (const [concepto, valor] of Object.entries(factura.post.totales)) {
      expect.soft(totales[concepto], `Comprobantes › Datos Básicos vs. Factura › ${concepto}`).toBe(valor);
      expect.soft(sidebar.totales[concepto], `Comprobantes › Sidebar vs. Factura › ${concepto}`).toBe(valor);
      expect.soft(sidebar.totales[concepto], `Comprobantes › Sidebar vs. Datos Básicos › ${concepto}`).toBe(totales[concepto]);
    }
    expect.soft(sidebar.resumen.total, 'Comprobantes › Sidebar › Total').toBe(totales['IMPORTE $']);
    expect.soft(sidebar.resumen.neto, 'Comprobantes › Sidebar › Neto').toBe(totales['TOTAL NETO']);
    const diferenciasPendiente: string[] = [];
    for (const tipo of ['contables', 'conceptos', 'provincias'] as const) {
      expect.soft(imputaciones[tipo].totalImputado, `Comprobantes › Imputaciones › ${tipo} › Total Imputado vs. Factura`).toBe(factura.post[tipo].totalImputado);
      expect.soft(imputaciones[tipo].importes, `Comprobantes › Imputaciones › ${tipo} › importes vs. Factura`).toEqual(factura.post[tipo].importes);
      expect.soft(sidebar.imputaciones[tipo], `Comprobantes › Sidebar vs. Datos Básicos › Imputaciones › ${tipo}`).toEqual(imputaciones[tipo].importes);
      // "Pendiente a Imputar" se calcula distinto en Comprobantes: se informa, no se exige
      if (imputaciones[tipo].pendienteImputar !== factura.post[tipo].pendienteImputar) {
        diferenciasPendiente.push(`${tipo}: Comprobantes ${imputaciones[tipo].pendienteImputar ?? '—'} vs. Factura ${factura.post[tipo].pendienteImputar ?? '—'}`);
      }
    }
    if (diferenciasPendiente.length) {
      test.info().annotations.push({ type: 'Comprobantes › Pendiente a Imputar difiere', description: diferenciasPendiente.join(' | ') });
      console.log(`Comprobantes › Pendiente a Imputar difiere: ${diferenciasPendiente.join(' | ')}`);
    }
    return { ...datosFila, edicion, totales, totalesTrasRecalculo, imputaciones, sidebar, diferenciasPendiente };
  });
  await registrarEtapa('comprobante', comprobante);

  // ---- Etapa 5: Cobranza de la factura (2 valores por transferencia) -------------------
  const cobranza = await test.step('Etapa 5 - Cobranza', async () => {
    const lln = factura.numeracionFiscal!;
    const totalFactura = factura.post.totales['IMPORTE $'];
    const centavos = Math.round(aNumero(totalFactura) * 100);
    // Dos valores que suman exactamente el total (el segundo absorbe el centavo impar)
    const importes = [Math.floor(centavos / 2), centavos - Math.floor(centavos / 2)].map((c) => (c / 100).toFixed(2));
    const noOperacionAleatorio = () => String(Math.floor(100_000 + Math.random() * 900_000));
    const valoresACargar = importes.map((importe, i) => ({ operacion: '53', noOperacion: noOperacionAleatorio(), cuenta: '1000', subCuenta: String(i + 1), importe }));
    const diferencias: string[] = [];
    const registrar = (ok: boolean, mensaje: string) => {
      if (!ok) diferencias.push(mensaje.replace(' = ', ' ≠ ')); // en el informe se lee la diferencia
      expect.soft(ok, `Cobranza › ${mensaje}`).toBe(true);
    };
    const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const suma = (vs: { importe: number }[]) => Math.round(vs.reduce((s, v) => s + v.importe, 0) * 100) / 100;

    const maxPrevio = await abrirCobranzas(page);
    await nuevaCobranza(page);
    await seleccionarCliente(page); // Datos Básicos: solo la cuenta 59

    // Comprobantes: la factura del circuito; "Importe a aplicar" = total del comprobante
    const aplicado = await seleccionarComprobanteCobranza(page, lln);
    registrar(fmt(aplicado.importeAplicar) === totalFactura, `Importe a aplicar ${fmt(aplicado.importeAplicar)} = Total factura ${totalFactura}`);
    registrar(fmt(aplicado.importeAplicar) === comprobante.totales['IMPORTE $'], `Importe a aplicar ${fmt(aplicado.importeAplicar)} = Total en Comprobantes ${comprobante.totales['IMPORTE $']}`);
    registrar(fmt(aplicado.importeAplicar) === pedido.post.totales['IMPORTE $'], `Importe a aplicar ${fmt(aplicado.importeAplicar)} = Total del Pedido ${pedido.post.totales['IMPORTE $']}`);
    registrar(fmt(aplicado.deuda) === totalFactura, `Deuda del comprobante ${fmt(aplicado.deuda)} = Total factura ${totalFactura}`);

    // Valores: 2 transferencias (53) a la cuenta 1000, subcuentas 1 y 2
    const saldos: string[] = [await leerSaldoCobranza(page, { esperarSaldo: true })];
    registrar(saldos[0] === totalFactura, `Saldo inicial ${saldos[0]} = Total factura ${totalFactura}`);
    for (const [i, valor] of valoresACargar.entries()) {
      await agregarValorCobranza(page, valor);
      saldos.push(await leerSaldoCobranza(page, { esperarSaldo: i < valoresACargar.length - 1 }));
    }
    const valoresPre = await leerValoresCobranza(page); // sección Detalle de Valores (abierta por agregarValorCobranza)
    await irASeccion(page, 'Comprobantes');
    const comprobantesPre = await leerComprobantesCobranza(page);
    registrar(valoresPre.length === 2, `2 valores cargados (hay ${valoresPre.length})`);
    registrar(fmt(suma(valoresPre)) === fmt(aplicado.importeAplicar), `Total valores ${fmt(suma(valoresPre))} = Importe a aplicar ${fmt(aplicado.importeAplicar)}`);
    registrar(saldos[saldos.length - 1] === '0.00', `Sin saldo pendiente (saldo final ${saldos[saldos.length - 1]})`);

    // Grabar y consultar
    await guardarComprobante(page);
    const numero = await consultarUltimoComprobante(page, maxPrevio, cabeceraCobranza);
    await irASeccion(page, 'Comprobantes');
    await expect.poll(async () => (await leerComprobantesCobranza(page)).length, { message: 'comprobantes de la cobranza consultada' }).toBeGreaterThan(0);
    const comprobantesPost = await leerComprobantesCobranza(page);
    await irASeccion(page, 'Detalle de Valores');
    await expect.poll(async () => (await leerValoresCobranza(page)).length, { message: 'valores de la cobranza consultada' }).toBeGreaterThan(0);
    const valoresPost = await leerValoresCobranza(page);

    const aplicadoPost = comprobantesPost.find((c) => c.letraLugarNumero === lln);
    registrar(!!aplicadoPost, `Consultar: comprobante ${lln} aplicado`);
    registrar(comprobantesPost.length === 1, `Consultar: un solo comprobante aplicado (hay ${comprobantesPost.length})`);
    if (aplicadoPost) registrar(fmt(aplicadoPost.importeAplicar) === fmt(aplicado.importeAplicar), `Consultar: importe aplicado ${fmt(aplicadoPost.importeAplicar)} = antes de grabar ${fmt(aplicado.importeAplicar)}`);
    registrar(valoresPost.length === 2, `Consultar: 2 valores (hay ${valoresPost.length})`);
    const clave = (v: { noOperacion: number; subCuenta: string; importe: number }) => `${v.noOperacion}|${v.subCuenta}|${fmt(v.importe)}`;
    registrar(
      igualesSinOrden(valoresPost.map(clave), valoresPre.map(clave)),
      `Consultar: valores iguales a los cargados (${valoresPost.map(clave).join(', ')} vs. ${valoresPre.map(clave).join(', ')})`,
    );
    registrar(fmt(suma(valoresPost)) === totalFactura, `Consultar: total valores ${fmt(suma(valoresPost))} = Total factura ${totalFactura}`);

    await volverAlExplorador(page);
    // La grilla se recarga al volver: esperar a que traiga la cobranza
    await expect.poll(() => filaCobranzaEnGrilla(page, numero), { timeout: 20_000 }).not.toBeNull().catch(() => {});
    const grilla = await filaCobranzaEnGrilla(page, numero);
    const dondeEstoy = grilla ? '' : ` (no encontrada; URL ${page.url()}, ubicación "${(await page.getByRole('list').filter({ has: page.locator('li > strong:visible') }).first().innerText().catch(() => '?')).replace(/\s+/g, ' ')}")`;
    registrar(!!grilla && grilla.coCliente === Number(CLIENTE_CODIGO), `Grilla: cobranza ${numero} del cliente ${CLIENTE_CODIGO}${grilla ? ` (cliente ${grilla.coCliente})` : dondeEstoy}`);
    if (grilla) {
      registrar(fmt(grilla.total) === totalFactura, `Grilla: Total ${fmt(grilla.total)} = Total factura ${totalFactura}`);
      registrar(fmt(grilla.liquidado) === fmt(grilla.pagado), `Grilla: liquidado ${fmt(grilla.liquidado)} = pagado ${fmt(grilla.pagado)}`);
    }
    console.log(`Cobranza ${numero}: aplica ${lln} por ${fmt(aplicado.importeAplicar)} con ${valoresPre.map((v) => `${v.subCuenta} ${fmt(v.importe)}`).join(' + ')}${diferencias.length ? ` · DIFERENCIAS: ${diferencias.join(' | ')}` : ''}`);
    return { numero, letraLugarNumero: lln, totalFactura, aplicado, saldos, valoresCargados: valoresACargar, comprobantesPre, valoresPre, comprobantesPost, valoresPost, grilla, diferencias };
  });
  await registrarEtapa('cobranza', cobranza);
  console.log(`RESUMEN ${JSON.stringify(resumen)}`);
});
