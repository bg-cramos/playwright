import { test, expect } from '@playwright/test';
import {
  ARTICULO_CODIGO,
  ARTICULOS_POR_DEFECTO,
  CLIENTE_CODIGO,
  login,
  abrirPedidos,
  abrirExplorador,
  nuevoComprobante,
  cargarClienteYArticulos,
  seleccionarCliente,
  leerDetalle,
  capturarImportes,
  guardarComprobante,
  consultarUltimoComprobante,
  consultarPorNumero,
  nuevoNumeroEnGrilla,
  volverAlExplorador,
  generarRemito,
  numeracionFiscalEnCabecera,
  leerSidebarDetalles,
  convertirComprobante,
  esperarEnExplorador,
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
  Importes,
  LineaDetalle,
  SidebarDetalles,
} from '../utils/igglobal';

/**
 * Circuito de Ventas por CONVERTIR (ver CLAUDE.md › "Circuito Ventas (Convertir)"):
 *  1. Pedido nuevo (cuenta 59, (1002) x 3 a $3500 + caja x 5 a precio de lista): Precarga, Consultar y Sidebar.
 *  2. Pedidos › Más › Convertir a Remito → Remitos de Venta › Consultar + Sidebar.
 *  3. Remitos › Más › Convertir a Factura (queda GENERADA) → Facturas de Venta › Consultar + Sidebar + Percepciones IIBB.
 *  4. Comprobantes de Venta sobre la factura convertida.
 *  5. Cobranza (2 valores 53 / 1000 / subcuentas 1 y 2) que cancela la factura.
 */
const ARTICULOS = ARTICULOS_POR_DEFECTO;
const DESCUENTO = 'DESCUENTO / RECARGO';
const TIPOS = ['contables', 'conceptos', 'provincias'] as const;

const aNumero = (monto: string | number | undefined) => Number(String(monto ?? '').replace(/,/g, ''));
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const igualesSinOrden = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** Acumula diferencias (van al informe) y las exige con expect.soft (el test queda en rojo si hay alguna). */
function registro(etapa: string) {
  const diferencias: string[] = [];
  const observaciones: string[] = [];
  return {
    diferencias,
    observaciones,
    exigir(ok: boolean, mensaje: string) {
      if (!ok) diferencias.push(mensaje);
      expect.soft(ok, `${etapa} › ${mensaje}`).toBe(true);
    },
    observar(mensaje: string) {
      observaciones.push(mensaje);
      test.info().annotations.push({ type: `${etapa} › observación`, description: mensaje });
      console.log(`${etapa} › observación: ${mensaje}`);
    },
  };
}

/** Compara campo por campo dos capturas (Imputaciones de todas las solapas, Percepciones y Totales). */
function compararImportes(etapa: string, pre: Importes, post: Importes) {
  for (const tipo of TIPOS) expect.soft(post[tipo], `${etapa} › Imputaciones › ${tipo}`).toEqual(pre[tipo]);
  if (pre.otrasImputaciones) expect.soft(post.otrasImputaciones, `${etapa} › Imputaciones › otras solapas`).toEqual(pre.otrasImputaciones);
  if (pre.percepciones) expect.soft(post.percepciones, `${etapa} › Percepciones`).toEqual(pre.percepciones);
  for (const [concepto, valor] of Object.entries(pre.totales)) {
    expect.soft(post.totales[concepto], `${etapa} › Totales › ${concepto}`).toBe(valor);
  }
  expect(Object.keys(post.totales), `${etapa} › mismos conceptos en Totales`).toEqual(Object.keys(pre.totales));
}

/** El sidebar "Más > Ver Detalles" debe mostrar lo mismo que cada fuente indicada (Imputaciones y Totales). */
function compararSidebar(etapa: string, fuentes: [string, Importes][], sidebar: SidebarDetalles) {
  for (const [momento, fuente] of fuentes) {
    for (const tipo of TIPOS) {
      expect.soft(sidebar.imputaciones[tipo], `${etapa} › Sidebar vs. ${momento} › Imputaciones › ${tipo}`).toEqual(fuente[tipo].importes);
    }
    for (const [concepto, valor] of Object.entries(fuente.totales)) {
      expect.soft(sidebar.totales[concepto], `${etapa} › Sidebar vs. ${momento} › Totales › ${concepto}`).toBe(valor);
    }
    expect.soft(sidebar.resumen.total, `${etapa} › Sidebar vs. ${momento} › Total`).toBe(fuente.totales['IMPORTE $']);
    expect.soft(sidebar.resumen.neto, `${etapa} › Sidebar vs. ${momento} › Neto`).toBe(fuente.totales['TOTAL NETO']);
  }
  expect(Object.keys(sidebar.totales).sort(), `${etapa} › Sidebar › mismos conceptos en Totales`).toEqual(Object.keys(fuentes[0][1].totales).sort());
  expect.soft(aNumero(sidebar.resumen.impuestos), `${etapa} › Sidebar › Impuestos = Total - Neto`).toBeCloseTo(aNumero(sidebar.resumen.total) - aNumero(sidebar.resumen.neto), 2);
}

/** El descuento del cliente 59 tiene que estar aplicado (DESCUENTO / RECARGO distinto de 0.00). */
function verificarDescuento(etapa: string, totales: Record<string, string>) {
  expect(totales, `${etapa} › Totales muestra "${DESCUENTO}"`).toHaveProperty([DESCUENTO]);
  expect(aNumero(totales[DESCUENTO]), `${etapa} › ${DESCUENTO} aplicado (≠ 0.00)`).not.toBe(0);
}

const porArticulo = (detalle: LineaDetalle[]) => [...detalle].sort((a, b) => String(a.CoArticulo).localeCompare(String(b.CoArticulo)));
const claveLinea = (l: LineaDetalle) => ({ CoArticulo: l.CoArticulo, CantidadOriginal: l.CantidadOriginal, PrecioUnitarioDigitado: l.PrecioUnitarioDigitado });

/** (1002) x 3 a $3500 y la caja x 5 con precio de lista > 0; con `referencia`, mismas líneas que el Pedido. */
function verificarLineas(etapa: string, detalle: LineaDetalle[], referencia?: LineaDetalle[]) {
  expect(detalle, `${etapa} › líneas del detalle`).toHaveLength(ARTICULOS.length);
  const art1 = detalle.find((l) => String(l.CoArticulo) === ARTICULO_CODIGO);
  const art2 = detalle.find((l) => String(l.CoArticulo) !== ARTICULO_CODIGO);
  expect(art1, `${etapa} › línea (1002)`).toMatchObject({ CantidadOriginal: ARTICULOS[0].cantidad, PrecioUnitarioDigitado: ARTICULOS[0].precio });
  expect(art2, `${etapa} › línea caja de cartón`).toMatchObject({ CantidadOriginal: ARTICULOS[1].cantidad });
  expect(art2!.PrecioUnitarioDigitado, `${etapa} › precio de lista de la caja`).toBeGreaterThan(0);
  if (referencia) expect.soft(porArticulo(detalle).map(claveLinea), `${etapa} › mismas líneas que el Pedido`).toEqual(porArticulo(referencia).map(claveLinea));
}

/**
 * Comprobante convertido vs. su origen: Bruto / Descuento / Neto y gravados/IVA deben ser iguales (FALLA si no);
 * PERC.* e IMPORTE $ pueden cambiar por percepciones propias del tipo de comprobante (se informan como observación).
 */
function compararConOrigen(r: ReturnType<typeof registro>, origen: string, totalesOrigen: Record<string, string>, totales: Record<string, string>) {
  for (const [concepto, valor] of Object.entries(totalesOrigen)) {
    if (totales[concepto] === valor) continue;
    const mensaje = `Conversión: ${concepto} ${totales[concepto] ?? 'falta'} ≠ ${origen} ${valor}`;
    if (/^(PERC\.|IMPORTE)/.test(concepto)) r.observar(mensaje);
    else r.exigir(false, mensaje);
  }
}

test('circuito comercial por Convertir: Pedido -> Remito -> Factura -> Comprobantes -> Cobranza', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  // Se adjunta el resumen después de cada etapa (el reporter de correo toma el último "resumen.json")
  const resumen: Record<string, unknown> = {};
  const registrarEtapa = async (clave: string, datos: unknown) => {
    resumen[clave] = datos;
    await test.info().attach('resumen.json', { body: JSON.stringify(resumen, null, 2), contentType: 'application/json' });
  };
  await login(page);

  // IMPORTANTE (sandbox 25/11/2026): un comprobante abierto con **Consultar** queda "en uso" de forma persistente y
  // "Convertir a …" responde "No se pudo procesar la conversión. Comprobante en uso…". Ver Detalles no bloquea.
  // Por eso, en Pedido y Remito: Precarga/Sidebar → Convertir → recién después Consultar (mismas validaciones).

  // ---- Etapa 1: Pedido (Precarga, grabado y Sidebar) ----------------------------------------
  const pedidoBase = await test.step('Etapa 1 - Pedido (Precarga y Sidebar)', async () => {
    const maxPrevio = await abrirPedidos(page);
    await nuevoComprobante(page);
    await cargarClienteYArticulos(page, ARTICULOS);
    const detallePre = await leerDetalle(page);
    verificarLineas('Pedido (Precarga)', detallePre);
    const pre = await capturarImportes(page, { todasLasSolapas: true });
    verificarDescuento('Pedido › Precarga', pre.totales);

    await guardarComprobante(page);
    const numero = await nuevoNumeroEnGrilla(page, maxPrevio); // sin Consultar (bloquearía la conversión)
    const sidebar = await leerSidebarDetalles(page, numero);
    verificarDescuento('Pedido › Sidebar', sidebar.totales);
    compararSidebar('Pedido', [['Precarga', pre]], sidebar);
    return { numero, detallePre, pre, sidebar };
  });
  await registrarEtapa('pedido', pedidoBase);

  // ---- Etapa 2: Pedidos › Más › Convertir a Remito → Consultar Pedido → Remitos de Venta --------
  const remitoBase = await test.step('Etapa 2 - Convertir Pedido a Remito', async () => {
    const conversion = await convertirComprobante(page, pedidoBase.numero, 'Remito');
    console.log(`Pedido ${pedidoBase.numero} convertido a Remito ${conversion.numero}: ${conversion.mensajes.join(' | ')}`);

    // Remitos de Venta: ubicar el remito convertido y su Sidebar (Consultar va después de convertirlo a Factura)
    await abrirExplorador(page, 'Remitos');
    let fila = await esperarEnExplorador(page, conversion.numero);
    const generado = !!fila.letraLugarNumero;
    // El remito convertido hoy ya nace con numeración fiscal; si no la tuviera, se genera (requisito para facturar)
    if (!generado) {
      await generarRemito(page, conversion.numero);
      fila = await esperarEnExplorador(page, conversion.numero);
    }
    expect(fila.letraLugarNumero, 'Remito con numeración fiscal').toMatch(/^R-\d{4}-\d{8}$/);
    const sidebar = await leerSidebarDetalles(page, conversion.numero);
    verificarDescuento('Remito › Sidebar', sidebar.totales);
    return { conversion, fila, generado, sidebar };
  });

  // ---- Etapa 3: Remitos › Más › Convertir a Factura → Consultar Pedido y Remito → Facturas -------
  // Consultar el Pedido de origen también bloquea la conversión del Remito derivado: Pedido y Remito se
  // consultan recién cuando ambas conversiones terminaron.
  let pedido!: Awaited<ReturnType<typeof validarPedido>>;
  async function validarPedido() {
    await abrirPedidos(page);
    await consultarPorNumero(page, pedidoBase.numero);
    const post = await capturarImportes(page, { todasLasSolapas: true });
    const detalle = await leerDetalle(page);
    verificarLineas('Pedido (Consultar)', detalle, pedidoBase.detallePre);
    compararImportes('Pedido', pedidoBase.pre, post);
    compararSidebar('Pedido', [['Consultar', post]], pedidoBase.sidebar);
    await volverAlExplorador(page);
    return { numero: pedidoBase.numero, detalle, pre: pedidoBase.pre, post, sidebar: pedidoBase.sidebar };
  }

  let remito!: Awaited<ReturnType<typeof validarRemito>>;
  async function validarRemito() {
    const r = registro('Remito');
    const { conversion, fila, generado, sidebar } = remitoBase;
    r.observar('Consultar deja el comprobante "en uso" y bloquea "Convertir a …" sobre él y sobre lo convertido desde él (Ver Detalles no bloquea): Pedido y Remito se consultan después de ambas conversiones.');
    if (!generado) r.observar('El remito convertido no tenía numeración fiscal: se ejecutó Más › Generar.');
    r.exigir(fila.coCliente === Number(CLIENTE_CODIGO), `Grilla: cliente ${fila.coCliente} = ${CLIENTE_CODIGO}`);

    await abrirExplorador(page, 'Remitos');
    await consultarPorNumero(page, conversion.numero);
    const post = await capturarImportes(page, { todasLasSolapas: true });
    const detalle = await leerDetalle(page);
    verificarLineas('Remito (Consultar)', detalle, pedido.detalle);
    r.exigir(detalle.every((l) => Number(l.NoPedido) === pedido.numero), `Detalle: NoPedido = ${pedido.numero} en todas las líneas (${detalle.map((l) => l.NoPedido).join(', ')})`);
    verificarDescuento('Remito › Consultar', post.totales);
    compararConOrigen(r, `Pedido ${pedido.numero}`, pedido.post.totales, post.totales);
    for (const tipo of TIPOS) {
      if (post[tipo].totalImputado !== pedido.post[tipo].totalImputado) r.observar(`Imputaciones ${tipo}: Total Imputado ${post[tipo].totalImputado} vs. Pedido ${pedido.post[tipo].totalImputado}`);
    }
    r.exigir(Math.abs(fila.total - aNumero(post.totales['IMPORTE $'])) < 0.005, `Grilla: Total ${fmt(fila.total)} = IMPORTE $ ${post.totales['IMPORTE $']}`);
    compararSidebar('Remito', [['Consultar', post]], sidebar);
    await volverAlExplorador(page);
    // No hay "antes de grabar" (la conversión graba sola): pre = Consultar para el formato del informe
    return {
      numero: conversion.numero,
      numeracionFiscal: fila.letraLugarNumero!,
      conversion: { desde: `Pedido N° ${pedido.numero}`, origen: pedido.numero, mensajes: conversion.mensajes },
      estado: fila.estado,
      detalle,
      pre: post,
      post,
      sidebar,
      diferencias: r.diferencias,
      observaciones: r.observaciones,
    };
  }

  const factura = await test.step('Etapa 3 - Convertir Remito a Factura', async () => {
    const r = registro('Factura');
    // Seguimos en la grilla de Remitos de Venta (después del sidebar)
    const conversion = await convertirComprobante(page, remitoBase.conversion.numero, 'Factura');
    console.log(`Remito ${remitoBase.conversion.numero} convertido a Factura ${conversion.numero}: ${conversion.mensajes.join(' | ')}`);
    pedido = await validarPedido();
    await registrarEtapa('pedido', pedido);
    remito = await validarRemito();
    await registrarEtapa('remito', remito);

    await abrirExplorador(page, 'Facturas');
    const fila = await esperarEnExplorador(page, conversion.numero);
    const numeracionFiscal = conversion.numeracionFiscal ?? fila.letraLugarNumero;
    expect(numeracionFiscal, 'Factura GENERADA con numeración fiscal').toMatch(/^[A-Z]-\d{4}-\d{8}$/);
    r.exigir(fila.letraLugarNumero === numeracionFiscal, `Grilla: numeración ${fila.letraLugarNumero} = cartel ${numeracionFiscal}`);
    r.exigir(fila.coCliente === Number(CLIENTE_CODIGO), `Grilla: cliente ${fila.coCliente} = ${CLIENTE_CODIGO}`);
    r.exigir(fila.remitoOrigen === remito.numeracionFiscal, `Grilla: remito de origen ${fila.remitoOrigen ?? '—'} = ${remito.numeracionFiscal}`);

    await consultarPorNumero(page, conversion.numero);
    r.exigir((await numeracionFiscalEnCabecera(page)) === numeracionFiscal, `Consultar: cabecera con ${numeracionFiscal}`);
    const post = await capturarImportes(page, { percepciones: true, todasLasSolapas: true });
    const detalle = await leerDetalle(page);
    verificarLineas('Factura (Consultar)', detalle, pedido.detalle);
    r.exigir(detalle.every((l) => Number(l.NoPedido) === pedido.numero), `Detalle: NoPedido = ${pedido.numero} (${detalle.map((l) => l.NoPedido).join(', ')})`);
    r.exigir(detalle.every((l) => Number(l.NoRemito) === remito.numero), `Detalle: NoRemito = ${remito.numero} (${detalle.map((l) => l.NoRemito).join(', ')})`);
    verificarDescuento('Factura › Consultar', post.totales);
    compararConOrigen(r, `Remito ${remito.numero}`, remito.post.totales, post.totales);
    compararConOrigen(r, `Pedido ${pedido.numero}`, pedido.post.totales, post.totales);
    r.exigir(Math.abs(fila.total - aNumero(post.totales['IMPORTE $'])) < 0.005, `Grilla: Total ${fmt(fila.total)} = IMPORTE $ ${post.totales['IMPORTE $']}`);

    // Percepciones (solo Factura): la suma de la grilla de IIBB = PERC. IIBB de Totales
    const percepciones = post.percepciones ?? [];
    const sumaIIBB = fmt(Math.round(percepciones.reduce((s, p) => s + Number(p.monto), 0) * 100) / 100);
    const percIIBB = post.totales['PERC. IIBB'] ?? '0.00';
    r.exigir(sumaIIBB === percIIBB, `Percepciones IIBB ${sumaIIBB} (${percepciones.map((p) => `${p.provincia} ${p.alicuota}% s/ ${fmt(p.sujeto)} = ${fmt(p.monto)}`).join(' + ') || 'sin filas'}) = Totales PERC. IIBB ${percIIBB}`);
    for (const p of percepciones) {
      const calculado = Math.round(p.sujeto * p.alicuota) / 100;
      r.exigir(Math.abs(calculado - p.monto) <= 0.01, `Percepción ${p.provincia}: ${p.alicuota}% de ${fmt(p.sujeto)} = ${fmt(calculado)} (grilla ${fmt(p.monto)})`);
      r.exigir(fmt(p.sujeto) === post.totales['TOTAL NETO'], `Percepción ${p.provincia}: sujeto ${fmt(p.sujeto)} = Total Neto ${post.totales['TOTAL NETO']}`);
    }
    if (!percepciones.length) r.observar('La factura no tiene percepciones de IIBB (depende de la configuración del cliente/sandbox).');
    if (post.totales['PERC. IVA'] && aNumero(post.totales['PERC. IVA']) !== 0 && post.totales['PERC. IVA'] === percIIBB) {
      r.observar(`PERC. IVA (${post.totales['PERC. IVA']}) es igual a PERC. IIBB: verificar la parametrización de percepciones de IVA del cliente.`);
    }

    await volverAlExplorador(page);
    const sidebar = await leerSidebarDetalles(page, conversion.numero);
    verificarDescuento('Factura › Sidebar', sidebar.totales);
    compararSidebar('Factura', [['Consultar', post]], sidebar);
    r.exigir(sidebar.totales['PERC. IIBB'] === percIIBB, `Sidebar: PERC. IIBB ${sidebar.totales['PERC. IIBB'] ?? 'falta'} = Totales ${percIIBB}`);
    return {
      numero: conversion.numero,
      numeracionFiscal,
      conversion: { desde: `Remito N° ${remito.numero} (${remito.numeracionFiscal})`, origen: remito.numero, mensajes: conversion.mensajes },
      estado: fila.estado,
      detalle,
      pre: post,
      post,
      sidebar,
      percepcionesIIBB: { suma: sumaIIBB, totales: percIIBB, sidebar: sidebar.totales['PERC. IIBB'] ?? null, detalle: percepciones },
      diferencias: r.diferencias,
      observaciones: r.observaciones,
    };
  });
  await registrarEtapa('factura', factura);

  // ---- Etapa 4: Comprobantes de Venta -------------------------------------------------------
  const comprobante = await test.step('Etapa 4 - Comprobantes de Venta', async () => {
    const lln = factura.numeracionFiscal!;
    await abrirComprobantes(page);
    const datosFila = await buscarComprobante(page, lln);
    expect(datosFila, 'Comprobantes › fila de la factura').toMatchObject({ letraLugarNumero: lln, coCliente: Number(CLIENTE_CODIGO) });
    expect.soft(aNumero(String(datosFila.importe)), 'Comprobantes › importe de la grilla = IMPORTE $ de la factura').toBeCloseTo(aNumero(factura.post.totales['IMPORTE $']), 2);
    const fila = filaComprobante(page, lln);

    const edicion = await intentarEditarComprobante(page, fila, lln);
    console.log(`Comprobantes ${lln}: estado "${datosFila.estado}", edición ${edicion.permitido ? 'permitida' : `bloqueada (${edicion.mensaje})`}`);

    await consultarComprobante(page, fila, lln);
    const totales = await leerTotalesComprobante(page); // apenas abre (antes del recálculo de "Total a Discriminar")
    const imputaciones = await leerImputacionesComprobante(page);
    await irASeccion(page, 'Datos Básicos');
    const totalesTrasRecalculo = await leerTotalesComprobante(page);
    const recalculados = Object.keys(totales).filter((k) => totalesTrasRecalculo[k] !== totales[k]);
    if (recalculados.length) {
      const detalle = recalculados.map((k) => `${k}: ${totales[k]} → ${totalesTrasRecalculo[k]}`).join(' | ');
      test.info().annotations.push({ type: 'Comprobantes › recálculo en pantalla al salir de "Total a Discriminar"', description: detalle });
    }
    await volverAlExplorador(page);

    await buscarComprobante(page, lln);
    const sidebar = await leerSidebarComprobante(page, fila, lln);

    verificarDescuento('Comprobantes › Datos Básicos', totales);
    verificarDescuento('Comprobantes › Sidebar', sidebar.totales);
    for (const [concepto, valor] of Object.entries(factura.post.totales)) {
      expect.soft(totales[concepto], `Comprobantes › Datos Básicos vs. Factura › ${concepto}`).toBe(valor);
      expect.soft(sidebar.totales[concepto], `Comprobantes › Sidebar vs. Factura › ${concepto}`).toBe(valor);
    }
    expect.soft(sidebar.resumen.total, 'Comprobantes › Sidebar › Total').toBe(totales['IMPORTE $']);
    expect.soft(sidebar.resumen.neto, 'Comprobantes › Sidebar › Neto').toBe(totales['TOTAL NETO']);
    const diferenciasPendiente: string[] = [];
    for (const tipo of TIPOS) {
      expect.soft(imputaciones[tipo].totalImputado, `Comprobantes › Imputaciones › ${tipo} › Total Imputado vs. Factura`).toBe(factura.post[tipo].totalImputado);
      expect.soft(imputaciones[tipo].importes, `Comprobantes › Imputaciones › ${tipo} › importes vs. Factura`).toEqual(factura.post[tipo].importes);
      expect.soft(sidebar.imputaciones[tipo], `Comprobantes › Sidebar vs. Datos Básicos › Imputaciones › ${tipo}`).toEqual(imputaciones[tipo].importes);
      if (imputaciones[tipo].pendienteImputar !== factura.post[tipo].pendienteImputar) {
        diferenciasPendiente.push(`${tipo}: Comprobantes ${imputaciones[tipo].pendienteImputar ?? '—'} vs. Factura ${factura.post[tipo].pendienteImputar ?? '—'}`);
      }
    }
    return { ...datosFila, edicion, totales, totalesTrasRecalculo, imputaciones, sidebar, diferenciasPendiente };
  });
  await registrarEtapa('comprobante', comprobante);

  // ---- Etapa 5: Cobranza de la factura convertida (2 valores) -------------------------------
  const cobranza = await test.step('Etapa 5 - Cobranza', async () => {
    const lln = factura.numeracionFiscal!;
    const totalFactura = factura.post.totales['IMPORTE $'];
    // Valor 1 = mitad (redondeo hacia abajo); Valor 2 = Total - Valor 1 → suma exacta, sin saldo
    const centavos = Math.round(aNumero(totalFactura) * 100);
    const valor1 = Math.floor(centavos / 2);
    const importes = [valor1, centavos - valor1].map((c) => (c / 100).toFixed(2));
    const noOperacionAleatorio = () => String(Math.floor(1 + Math.random() * 999_999)); // hasta 6 caracteres
    const valoresACargar = importes.map((importe, i) => ({ operacion: '53', noOperacion: noOperacionAleatorio(), cuenta: '1000', subCuenta: String(i + 1), importe }));
    const diferencias: string[] = [];
    const registrar = (ok: boolean, mensaje: string) => {
      if (!ok) diferencias.push(mensaje.replace(' = ', ' ≠ '));
      expect.soft(ok, `Cobranza › ${mensaje}`).toBe(true);
    };
    const suma = (vs: { importe: number }[]) => Math.round(vs.reduce((s, v) => s + v.importe, 0) * 100) / 100;

    const maxPrevio = await abrirCobranzas(page);
    await nuevaCobranza(page);
    await seleccionarCliente(page);

    const aplicado = await seleccionarComprobanteCobranza(page, lln);
    registrar(fmt(aplicado.importeAplicar) === totalFactura, `Importe a aplicar ${fmt(aplicado.importeAplicar)} = Total factura ${totalFactura}`);
    registrar(fmt(aplicado.importeAplicar) === comprobante.totales['IMPORTE $'], `Importe a aplicar ${fmt(aplicado.importeAplicar)} = Total en Comprobantes ${comprobante.totales['IMPORTE $']}`);
    registrar(fmt(aplicado.importeAplicar) === pedido.post.totales['IMPORTE $'], `Importe a aplicar ${fmt(aplicado.importeAplicar)} = Total del Pedido ${pedido.post.totales['IMPORTE $']}`);
    registrar(fmt(aplicado.deuda) === totalFactura, `Deuda del comprobante ${fmt(aplicado.deuda)} = Total factura ${totalFactura}`);

    const saldos: string[] = [await leerSaldoCobranza(page, { esperarSaldo: true })];
    registrar(saldos[0] === totalFactura, `Saldo inicial ${saldos[0]} = Total factura ${totalFactura}`);
    for (const [i, valor] of valoresACargar.entries()) {
      await agregarValorCobranza(page, valor);
      saldos.push(await leerSaldoCobranza(page, { esperarSaldo: i < valoresACargar.length - 1 }));
    }
    const valoresPre = await leerValoresCobranza(page);
    await irASeccion(page, 'Comprobantes');
    const comprobantesPre = await leerComprobantesCobranza(page);
    registrar(comprobantesPre.some((c) => c.letraLugarNumero === lln), `Antes de grabar: ${lln} en Comprobantes`);
    registrar(valoresPre.length === 2, `2 valores cargados (hay ${valoresPre.length})`);
    registrar(fmt(suma(valoresPre)) === fmt(aplicado.importeAplicar), `Total valores ${fmt(suma(valoresPre))} = Importe a aplicar ${fmt(aplicado.importeAplicar)}`);
    registrar(saldos[saldos.length - 1] === '0.00', `Sin saldo pendiente (saldo final ${saldos[saldos.length - 1]})`);

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
    registrar(igualesSinOrden(valoresPost.map(clave), valoresPre.map(clave)), `Consultar: valores iguales a los cargados (${valoresPost.map(clave).join(', ')} vs. ${valoresPre.map(clave).join(', ')})`);
    registrar(fmt(suma(valoresPost)) === totalFactura, `Consultar: total valores ${fmt(suma(valoresPost))} = Total factura ${totalFactura}`);

    await volverAlExplorador(page);
    await expect.poll(() => filaCobranzaEnGrilla(page, numero), { timeout: 20_000 }).not.toBeNull().catch(() => {});
    const grilla = await filaCobranzaEnGrilla(page, numero);
    registrar(!!grilla && grilla.coCliente === Number(CLIENTE_CODIGO), `Grilla: cobranza ${numero} del cliente ${CLIENTE_CODIGO}${grilla ? ` (cliente ${grilla.coCliente})` : ' (no encontrada)'}`);
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

