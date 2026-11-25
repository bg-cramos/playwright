/**
 * Informe HTML ejecutivo del E2E (correo y vista previa). Función pura: recibe el contenido de
 * `test-results/resumen-ejecucion.json` y devuelve { asunto, html }. No depende de Playwright.
 *
 * Estructura (de lo gerencial a lo técnico):
 *  1. Banner con semáforo global, fecha/hora, duración y pruebas OK/total.
 *  2. Franja de comprobantes generados (Pedido, Remito, Factura, Comprobante + estado de cobro/edición).
 *  3. Matriz gerencial: una fila por etapa (Pedidos, Remitos, Facturas, Comprobantes y futuras) con
 *     Pre-grabado / Consultar / Sidebar / Importes / Imputaciones / Estado.
 *  4. Fallas / Observaciones y "Detalle de errores": solo los conceptos que no coinciden (nada si todo OK).
 *
 * Para sumar un módulo nuevo (p. ej. Cobranzas): el spec agrega su clave al `resumen.json`; si trae
 * `pre` / `post` / `sidebar` con la forma de las etapas comerciales, se muestra sola (adaptador
 * genérico). Si tiene otra forma, agregar un adaptador en `ADAPTADORES`.
 */

// ---- Tipos del resumen ----------------------------------------------------------------
export type Totales = Record<string, string>;
export type Imputacion = { totalImputado: string; pendienteImputar: string | null; importes: string[] };
type Imputaciones = { contables: Imputacion; conceptos: Imputacion; provincias: Imputacion };
type Percepcion = { provincia: string; alicuota: number; monto: number; sujeto: number };
export type Importes = Imputaciones & { percepciones?: Percepcion[]; totales: Totales };
type Linea = { CoArticulo: string; Descripcion: string | null; CantidadOriginal: number; PrecioUnitarioDigitado: number; Total: number; NoPedido?: number; NoRemito?: number };
type Sidebar = { imputaciones: { contables: string[]; conceptos: string[]; provincias: string[] }; resumen: { total: string; neto: string; impuestos: string }; totales: Totales };
export type EtapaComercial = { numero: number; numeracionFiscal?: string; detalle?: Linea[]; pre: Importes; post: Importes; sidebar?: Sidebar };
export type Comprobante = {
  noOperacion: number;
  letraLugarNumero: string;
  coCliente: number;
  cliente: string;
  estado: string;
  porcentajeDescuento: number;
  edicion: { permitido: boolean; mensaje: string | null };
  totales: Totales;
  totalesTrasRecalculo?: Totales;
  imputaciones: Imputaciones;
  sidebar: Sidebar;
  diferenciasPendiente?: string[];
};
type ValorCobranza = { operacion: string; noOperacion: number; cuenta: string; subCuenta: string; importe: number };
export type Cobranza = {
  numero: number;
  letraLugarNumero: string;
  totalFactura: string;
  aplicado: { letraLugarNumero: string; importeOriginal: number; deuda: number; importeAplicar: number };
  saldos: string[];
  valoresPre: ValorCobranza[];
  valoresPost: ValorCobranza[];
  comprobantesPost: { letraLugarNumero: string; importeAplicar: number }[];
  grilla: { total: number; liquidado: number; pagado: number } | null;
  diferencias: string[];
};
export type Circuito = {
  pedido?: EtapaComercial;
  remito?: EtapaComercial;
  factura?: EtapaComercial;
  comprobante?: Comprobante;
  cobranza?: Cobranza;
  [etapa: string]: unknown;
};
export type ResultadoTest = { titulo: string; archivo: string; estado: string; duracionSeg: number; error?: string; circuito?: Circuito };
export type ResumenEjecucion = { inicio: string; fin: string; estado: string; total: number; pasaron: number; fallaron: number; tests: ResultadoTest[] };

// ---- Utilidades -----------------------------------------------------------------------
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const num = (s: string | undefined) => Number(String(s ?? '').replace(/,/g, ''));
const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const TIPOS = ['contables', 'conceptos', 'provincias'] as const;
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const C = {
  texto: '#1f2328',
  suave: '#59636e',
  borde: '#d8dee4',
  cabecera: '#f6f8fa',
  okFondo: '#e6f4ea',
  okTexto: '#1a7f37',
  malFondo: '#fdecea',
  malTexto: '#c62828',
  avisoFondo: '#fff4e5',
  avisoTexto: '#9a6700',
  font: "Segoe UI,Roboto,Helvetica,Arial,sans-serif",
};
const td = (extra = '') => `border:1px solid ${C.borde};padding:6px 10px;vertical-align:top;${extra}`;
const th = `border:1px solid ${C.borde};background:${C.cabecera};padding:6px 10px;text-align:left;font-weight:600;white-space:nowrap`;
const numStyle = 'text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap';

function tabla(encabezados: string[], filas: string[][], numericasDesde = 99) {
  const cab = encabezados.map((h, i) => `<th style="${th}${i >= numericasDesde ? ';text-align:right' : ''}">${h}</th>`).join('');
  const cuerpo = filas.map((f) => `<tr>${f.map((c, i) => `<td style="${td(i >= numericasDesde ? numStyle : '')}">${c}</td>`).join('')}</tr>`).join('');
  return `<table style="border-collapse:collapse;font-size:13px;margin:6px 0 14px">${cab ? `<thead><tr>${cab}</tr></thead>` : ''}<tbody>${cuerpo}</tbody></table>`;
}

type Check = 'ok' | 'fail' | 'na';
const ICONO: Record<Check, string> = { ok: '✅ OK', fail: '❌', na: '—' };
const celdaCheck = (c: Check, titulo = '') => {
  const fondo = c === 'ok' ? C.okFondo : c === 'fail' ? C.malFondo : 'transparent';
  const color = c === 'ok' ? C.okTexto : c === 'fail' ? C.malTexto : C.suave;
  return { html: ICONO[c], style: `background:${fondo};color:${color};font-weight:600;text-align:center;white-space:nowrap`, titulo };
};

/** Conceptos de Totales que difieren entre dos fuentes (claves faltantes incluidas). */
function difTotales(base: Totales, otra: Totales | undefined): string[] {
  if (!otra) return Object.keys(base);
  const claves = new Set([...Object.keys(base), ...Object.keys(otra)].filter((k) => k !== 'Total a Discriminar'));
  return [...claves].filter((k) => base[k] !== otra[k]);
}
/** Imputaciones que difieren (Total Imputado + importes por fila). */
function difImputaciones(base: Imputaciones, otra: Imputaciones | undefined): string[] {
  if (!otra) return [...TIPOS];
  return TIPOS.filter((t) => base[t].totalImputado !== otra[t]?.totalImputado || !igual(base[t].importes, otra[t]?.importes));
}
/** El sidebar solo muestra importes por fila. */
const difImputSidebar = (base: Imputaciones, sb: Sidebar) => TIPOS.filter((t) => !igual(base[t].importes, sb.imputaciones[t]));

const sumar = (t: Totales, prefijo: RegExp) => Object.entries(t).filter(([k]) => prefijo.test(k)).reduce((s, [, v]) => s + num(v), 0);
function resumenImportes(t: Totales | undefined) {
  if (!t) return '—';
  const filas: [string, string][] = [
    ['Bruto', t['TOTAL BRUTO']],
    ['Desc', t['DESCUENTO / RECARGO']],
    ['Neto', t['TOTAL NETO']],
    ['IVA', fmt(sumar(t, /^IVA /))],
    ['Perc', fmt(sumar(t, /^PERC\./))],
    ['Total', t['IMPORTE $']],
  ];
  return filas
    .map(([k, v]) => `<span style="color:${C.suave}">${k}</span>&nbsp;<span style="${numStyle}${k === 'Total' ? ';font-weight:700' : ''}">${esc(v ?? '—')}</span>`)
    .join('<br>');
}
function resumenImputaciones(i: Imputaciones | undefined) {
  if (!i) return '—';
  const nombres = { contables: 'Contables', conceptos: 'Conceptos', provincias: 'Provincias' };
  return TIPOS.map((t) => `<span style="color:${C.suave}">${nombres[t]}</span>&nbsp;<span style="${numStyle}">${esc(i[t].totalImputado)}</span>`).join('<br>');
}

// ---- Adaptadores: cada etapa del resumen → fila de la matriz + detalle técnico ------------
type FilaEtapa = {
  etapa: string;
  comprobante: string;
  pre: Check;
  consultar: Check;
  sidebar: Check;
  importes: string;
  imputaciones: string;
  observaciones: string[];
  fallas: string[];
  detalle: string;
};

/** Pedidos / Remitos / Facturas (y cualquier etapa futura con pre/post/sidebar). */
function etapaComercial(nombre: string, e: EtapaComercial): FilaEtapa {
  const fallas: string[] = [];
  const dPost = [...difTotales(e.pre.totales, e.post?.totales), ...difImputaciones(e.pre, e.post).map((t) => `Imputaciones ${t}`)];
  if (e.pre.percepciones && !igual(e.pre.percepciones, e.post?.percepciones)) dPost.push('Percepciones');
  if (dPost.length) fallas.push(`Consultar ≠ Pre-grabado: ${dPost.join(', ')}`);
  let sidebar: Check = 'na';
  if (e.sidebar) {
    const dSb = [...difTotales(e.pre.totales, e.sidebar.totales), ...difImputSidebar(e.pre, e.sidebar).map((t) => `Imputaciones ${t}`)];
    if (e.sidebar.resumen.total !== e.pre.totales['IMPORTE $']) dSb.push('Total del encabezado');
    sidebar = dSb.length ? 'fail' : 'ok';
    if (dSb.length) fallas.push(`Sidebar ≠ Pre-grabado: ${dSb.join(', ')}`);
  }
  const pre: Check = e.pre?.totales && Object.keys(e.pre.totales).length ? 'ok' : 'fail';
  const fiscal = e.numeracionFiscal ? `<br><span style="color:${C.suave}">${esc(e.numeracionFiscal)}</span>` : '';
  return {
    etapa: nombre,
    comprobante: `N° ${e.numero}${fiscal}`,
    pre,
    consultar: e.post ? (dPost.length ? 'fail' : 'ok') : 'na',
    sidebar,
    importes: resumenImportes(e.post?.totales ?? e.pre.totales),
    imputaciones: resumenImputaciones(e.post ?? e.pre),
    observaciones: [],
    fallas,
    detalle: detalleErrorComercial(nombre, e),
  };
}

/** Comprobantes de Ventas: sin pre-grabado; Datos Básicos vs. Factura y Sidebar vs. Datos Básicos. */
function etapaComprobantes(cp: Comprobante, factura: EtapaComercial | undefined): FilaEtapa {
  const fallas: string[] = [];
  const ref = factura?.post;
  const dDb = ref ? [...difTotales(ref.totales, cp.totales), ...difImputaciones(ref, cp.imputaciones).map((t) => `Imputaciones ${t}`)] : [];
  if (dDb.length) fallas.push(`Datos Básicos ≠ Factura: ${dDb.join(', ')}`);
  const dSb = [...difTotales(cp.totales, cp.sidebar.totales), ...difImputSidebar(cp.imputaciones, cp.sidebar).map((t) => `Imputaciones ${t}`)];
  if (dSb.length) fallas.push(`Sidebar ≠ Datos Básicos: ${dSb.join(', ')}`);

  const observaciones: string[] = [];
  observaciones.push(cp.edicion.permitido ? 'Edición permitida (se salió sin grabar).' : `Edición bloqueada: ${cp.edicion.mensaje ?? ''}`);
  const recalc = cp.totalesTrasRecalculo ? difTotales(cp.totales, cp.totalesTrasRecalculo) : [];
  if (recalc.length) {
    observaciones.push(
      `En Consultar, al salir del campo "Total a Discriminar" la pantalla recalcula ${recalc.length} importes ` +
        `(Total $ ${esc(cp.totales['IMPORTE $'])} → ${esc(cp.totalesTrasRecalculo!['IMPORTE $'])}). No se graba; se valida lo leído al abrir.`,
    );
  }
  if (cp.diferenciasPendiente?.length) observaciones.push(`"Pendiente a Imputar" difiere de Facturas (calculado sobre los importes recalculados): ${cp.diferenciasPendiente.join(' | ')}.`);

  return {
    etapa: 'Comprobantes',
    comprobante: `${esc(cp.letraLugarNumero)}<br><span style="color:${C.suave}">${esc(cp.estado)} · ${cp.edicion.permitido ? 'editable' : 'edición bloqueada'}</span>`,
    pre: 'na',
    consultar: ref ? (dDb.length ? 'fail' : 'ok') : 'na',
    sidebar: dSb.length ? 'fail' : 'ok',
    importes: resumenImportes(cp.totales),
    imputaciones: resumenImputaciones(cp.imputaciones),
    observaciones,
    fallas,
    detalle: detalleErrorComprobantes(cp, factura),
  };
}

const sumaValores = (vs: ValorCobranza[]) => Math.round(vs.reduce((s, v) => s + Number(v.importe), 0) * 100) / 100;

/**
 * Cobranzas: Pre-grabado = importe a aplicar igual al total del comprobante/pedido y valores sin saldo;
 * Consultar = comprobante aplicado y valores iguales a lo cargado (y grilla del explorador).
 */
function etapaCobranza(cb: Cobranza): FilaEtapa {
  const esConsulta = (d: string) => /^(Consultar|Grilla):/.test(d);
  const difPre = cb.diferencias.filter((d) => !esConsulta(d));
  const difPost = cb.diferencias.filter(esConsulta);
  const valores = cb.valoresPost.length ? cb.valoresPost : cb.valoresPre;
  const linea = (k: string, v: string, fuerte = false) => `<span style="color:${C.suave}">${k}</span>&nbsp;<span style="${numStyle}${fuerte ? ';font-weight:700' : ''}">${v}</span>`;
  const saldoFinal = cb.saldos[cb.saldos.length - 1] ?? '—';
  const importes = [
    linea('Aplicado', fmt(cb.aplicado.importeAplicar)),
    ...valores.map((v, i) => linea(`Valor ${i + 1} (${esc(v.subCuenta)})`, fmt(Number(v.importe)))),
    linea('Total valores', fmt(sumaValores(valores)), true),
    linea('Saldo', esc(saldoFinal)),
  ].join('<br>');

  let detalle = '';
  if (cb.diferencias.length) {
    const filas = [
      ['Total factura', esc(cb.totalFactura)],
      ['Importe a aplicar (antes de grabar)', fmt(cb.aplicado.importeAplicar)],
      ['Total valores (antes de grabar)', fmt(sumaValores(cb.valoresPre))],
      ['Saldo final (antes de grabar)', esc(saldoFinal)],
      ['Importe aplicado (Consultar)', cb.comprobantesPost.map((c) => `${esc(c.letraLugarNumero)}: ${fmt(c.importeAplicar)}`).join('<br>') || '—'],
      ['Total valores (Consultar)', cb.valoresPost.length ? fmt(sumaValores(cb.valoresPost)) : '—'],
      ['Grilla: total / liquidado / pagado', cb.grilla ? `${fmt(cb.grilla.total)} / ${fmt(cb.grilla.liquidado)} / ${fmt(cb.grilla.pagado)}` : '—'],
    ].map(([k, v]) => {
      const distinto = /^[\d.,-]+$/.test(v) && v !== cb.totalFactura && !k.startsWith('Saldo');
      return [`<b>${k}</b>`, distinto ? malo(v) : v];
    });
    detalle = bloqueError(`Cobranzas N° ${cb.numero} · aplica ${esc(cb.letraLugarNumero)}`, [
      tabla(['Concepto', 'Importe'], filas, 1),
      `<ul style="margin:4px 0;padding-left:18px;font-size:12px">${cb.diferencias.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`,
    ]);
  }
  return {
    etapa: 'Cobranzas',
    comprobante: `N° ${cb.numero}<br><span style="color:${C.suave}">aplica ${esc(cb.letraLugarNumero)}</span>`,
    pre: difPre.length ? 'fail' : 'ok',
    consultar: difPost.length ? 'fail' : 'ok',
    sidebar: 'na',
    importes,
    imputaciones: `<span style="color:${C.suave}">no aplica</span>`,
    observaciones: [],
    fallas: cb.diferencias,
    detalle,
  };
}

/** Etapas conocidas, en orden. Las claves desconocidas con pre/post usan el adaptador genérico. */
const ADAPTADORES: { clave: string; nombre: string; fila: (c: Circuito) => FilaEtapa }[] = [
  { clave: 'pedido', nombre: 'Pedidos', fila: (c) => etapaComercial('Pedidos', c.pedido!) },
  { clave: 'remito', nombre: 'Remitos', fila: (c) => etapaComercial('Remitos', c.remito!) },
  { clave: 'factura', nombre: 'Facturas', fila: (c) => etapaComercial('Facturas', c.factura!) },
  { clave: 'comprobante', nombre: 'Comprobantes', fila: (c) => etapaComprobantes(c.comprobante!, c.factura) },
  { clave: 'cobranza', nombre: 'Cobranzas', fila: (c) => etapaCobranza(c.cobranza!) },
];

function filasDelCircuito(c: Circuito, testFallo: boolean): FilaEtapa[] {
  const filas: FilaEtapa[] = [];
  for (const a of ADAPTADORES) {
    if (c[a.clave]) filas.push(a.fila(c));
    else if (testFallo) filas.push(noEjecutada(a.nombre));
  }
  // Etapas futuras (p. ej. "cobranza") con la forma comercial estándar
  for (const [clave, valor] of Object.entries(c)) {
    if (ADAPTADORES.some((a) => a.clave === clave)) continue;
    const v = valor as Partial<EtapaComercial>;
    if (v && typeof v === 'object' && v.pre && v.numero !== undefined) {
      filas.push(etapaComercial(clave[0].toUpperCase() + clave.slice(1), v as EtapaComercial));
    }
  }
  return filas;
}

function noEjecutada(nombre: string): FilaEtapa {
  return {
    etapa: nombre,
    comprobante: '—',
    pre: 'na',
    consultar: 'na',
    sidebar: 'na',
    importes: '—',
    imputaciones: '—',
    observaciones: [],
    fallas: ['Etapa no completada (el test se detuvo antes).'],
    detalle: '',
  };
}

// ---- Detalle de errores: solo lo que NO coincide (vacío si la etapa está OK) ----------------
const imputTexto = (i: Imputacion | undefined) => (i ? `${esc(i.totalImputado)} <small style="color:${C.suave}">[${i.importes.length ? esc(i.importes.join(' + ')) : 'sin filas'}]</small>` : '—');
const sidebarTexto = (importes: string[] | undefined) => (importes ? (importes.length ? esc(importes.join(' + ')) : 'sin filas') : '—');
const malo = (v: string) => `<span style="color:${C.malTexto};font-weight:600">${v}</span>`;

/** Filas de Totales que difieren entre las fuentes; los valores distintos de la primera fuente van en rojo. */
function filasDiferencias(fuentes: [string, Totales | undefined][], claves: string[]) {
  return claves.map((k) => {
    const base = fuentes[0][1]?.[k];
    return [`<b>${esc(k)}</b>`, ...fuentes.map(([, t], i) => (i > 0 && t?.[k] !== base ? malo(esc(t?.[k] ?? 'falta')) : esc(t?.[k] ?? '—')))];
  });
}

function bloqueError(titulo: string, partes: string[]) {
  const contenido = partes.filter(Boolean).join('');
  if (!contenido) return '';
  return `<div style="border:1px solid ${C.malTexto};border-radius:6px;padding:8px 12px;margin:8px 0"><div style="font-weight:700;color:${C.malTexto};margin-bottom:6px">${titulo}</div>${contenido}</div>`;
}

function detalleErrorComercial(nombre: string, e: EtapaComercial) {
  const fuentes: [string, Totales | undefined][] = [['Pre-grabado', e.pre.totales], ['Consultar', e.post?.totales], ...(e.sidebar ? ([['Sidebar', e.sidebar.totales]] as [string, Totales][]) : [])];
  const claves = [...new Set([...difTotales(e.pre.totales, e.post?.totales), ...(e.sidebar ? difTotales(e.pre.totales, e.sidebar.totales) : [])])];
  const totales = claves.length ? tabla(['Concepto', ...fuentes.map(([n]) => n)], filasDiferencias(fuentes, claves), 1) : '';

  const tipos = [...new Set([...difImputaciones(e.pre, e.post), ...(e.sidebar ? difImputSidebar(e.pre, e.sidebar) : [])])];
  const imputaciones = tipos.length
    ? tabla(
        ['Imputación', 'Pre-grabado', 'Consultar', ...(e.sidebar ? ['Sidebar'] : [])],
        tipos.map((t) => [`<b>${t[0].toUpperCase() + t.slice(1)}</b>`, imputTexto(e.pre[t]), imputTexto(e.post?.[t]), ...(e.sidebar ? [igual(e.sidebar.imputaciones[t], e.pre[t].importes) ? sidebarTexto(e.sidebar.imputaciones[t]) : malo(sidebarTexto(e.sidebar.imputaciones[t]))] : [])]),
      )
    : '';

  const percepciones =
    e.pre.percepciones && !igual(e.pre.percepciones, e.post?.percepciones)
      ? tabla(
          ['Percepción', 'Pre-grabado', 'Consultar'],
          e.pre.percepciones.map((p, i) => [esc(p.provincia), fmt(p.monto), malo(fmt(e.post?.percepciones?.[i]?.monto ?? NaN))]),
        )
      : '';
  return bloqueError(`${nombre} N° ${e.numero}${e.numeracionFiscal ? ` · ${esc(e.numeracionFiscal)}` : ''}`, [totales, imputaciones, percepciones]);
}

function detalleErrorComprobantes(cp: Comprobante, factura: EtapaComercial | undefined) {
  const ref = factura?.post;
  const fuentes: [string, Totales | undefined][] = [['Factura (Consultar)', ref?.totales], ['Datos Básicos', cp.totales], ['Sidebar', cp.sidebar.totales]];
  const claves = [...new Set([...(ref ? difTotales(ref.totales, cp.totales) : []), ...difTotales(cp.totales, cp.sidebar.totales)])];
  const totales = claves.length ? tabla(['Concepto', ...fuentes.map(([n]) => n)], filasDiferencias(fuentes, claves), 1) : '';

  const tipos = [...new Set([...(ref ? difImputaciones(ref, cp.imputaciones) : []), ...difImputSidebar(cp.imputaciones, cp.sidebar)])];
  const imputaciones = tipos.length
    ? tabla(
        ['Imputación', 'Factura (Consultar)', 'Datos Básicos', 'Sidebar'],
        tipos.map((t) => [`<b>${t[0].toUpperCase() + t.slice(1)}</b>`, imputTexto(ref?.[t]), imputTexto(cp.imputaciones[t]), igual(cp.sidebar.imputaciones[t], cp.imputaciones[t].importes) ? sidebarTexto(cp.sidebar.imputaciones[t]) : malo(sidebarTexto(cp.sidebar.imputaciones[t]))]),
      )
    : '';
  return bloqueError(`Comprobantes · ${esc(cp.letraLugarNumero)}`, [totales, imputaciones]);
}

// ---- Informe completo -----------------------------------------------------------------------
function duracion(inicio: string, fin: string) {
  const s = Math.max(0, Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 1000));
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

const fechaAR = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });

export function construirInforme(r: ResumenEjecucion): { asunto: string; html: string } {
  const testCircuito = r.tests.find((t) => t.circuito || /circuito/i.test(t.archivo));
  const circuito = testCircuito?.circuito;
  const filas = circuito ? filasDelCircuito(circuito, testCircuito!.estado !== 'passed') : [];
  const etapasOk = filas.every((f) => !f.fallas.length);
  const todoOk = r.fallaron === 0 && r.estado === 'passed' && etapasOk;

  const p = circuito?.pedido;
  const rm = circuito?.remito;
  const f = circuito?.factura;
  const cp = circuito?.comprobante;
  const asunto =
    `[IG Global E2E] ${todoOk ? '✅ Circuito OK' : '❌ Atención: fallas'} · ${r.pasaron}/${r.total} pruebas` +
    (f ? ` · Factura ${f.numeracionFiscal ?? f.numero}` : '');

  // 1. Banner
  const fondo = todoOk ? C.okTexto : C.malTexto;
  let html = `<div style="font-family:${C.font};color:${C.texto};max-width:1100px">`;
  html +=
    `<table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:12px"><tr>` +
    `<td style="background:${fondo};color:#fff;padding:16px 20px;border-radius:8px">` +
    `<div style="font-size:12px;letter-spacing:.5px;opacity:.9">INFORME E2E · IG GLOBAL (SANDBOX)</div>` +
    `<div style="font-size:22px;font-weight:700;margin:4px 0">${todoOk ? '✅ TODO EN VERDE — CIRCUITO OK' : '⚠️ ATENCIÓN — SE DETECTARON FALLAS'}</div>` +
    `<div style="font-size:13px;opacity:.95">${esc(fechaAR(r.inicio))} · Duración ${duracion(r.inicio, r.fin)} · Pruebas ${r.pasaron}/${r.total} OK` +
    `${filas.length ? ` · Etapas ${filas.filter((x) => !x.fallas.length).length}/${filas.length} OK` : ''}</div>` +
    `</td></tr></table>`;

  // 2. Franja de comprobantes
  if (circuito) {
    const tarjeta = (titulo: string, valor: string, sub = '') =>
      `<td style="border:1px solid ${C.borde};border-radius:6px;padding:8px 12px;vertical-align:top">` +
      `<div style="font-size:11px;color:${C.suave};text-transform:uppercase">${titulo}</div>` +
      `<div style="font-size:16px;font-weight:700">${valor}</div>${sub ? `<div style="font-size:12px;color:${C.suave}">${sub}</div>` : ''}</td>`;
    html += `<table role="presentation" style="border-collapse:separate;border-spacing:6px 0;margin:0 -6px 14px"><tr>`;
    if (p) html += tarjeta('Pedido', `N° ${p.numero}`, p.detalle ? `${p.detalle.length} ítems` : '');
    if (rm) html += tarjeta('Remito', `N° ${rm.numero}`, esc(rm.numeracionFiscal ?? ''));
    if (f) html += tarjeta('Factura', `N° ${f.numero}`, esc(f.numeracionFiscal ?? ''));
    if (cp) html += tarjeta('Comprobante', esc(cp.letraLugarNumero), `${esc(cp.estado)} · ${cp.edicion.permitido ? 'editable' : 'edición bloqueada'}`);
    if (f) html += tarjeta('Importe facturado', `$ ${esc(f.post.totales['IMPORTE $'])}`, `Desc. ${esc(f.post.totales['DESCUENTO / RECARGO'])}`);
    const cb = circuito.cobranza;
    if (cb) html += tarjeta('Cobranza', `N° ${cb.numero}`, `$ ${fmt(sumaValores(cb.valoresPost.length ? cb.valoresPost : cb.valoresPre))} · ${cb.valoresPre.length} valores`);
    html += `</tr></table>`;
  }

  // 3. Matriz gerencial
  if (filas.length) {
    html += `<h3 style="margin:8px 0 4px">Validación por etapa</h3>`;
    const cab = ['Etapa / Comprobante', 'Pre-grabado', 'Consultar', 'Sidebar', 'Importes', 'Imputaciones (imputado)', 'Estado'];
    html += `<table style="border-collapse:collapse;font-size:13px;margin:6px 0 6px"><thead><tr>${cab.map((h) => `<th style="${th}">${h}</th>`).join('')}</tr></thead><tbody>`;
    for (const fila of filas) {
      const ok = !fila.fallas.length;
      const checks = [celdaCheck(fila.pre), celdaCheck(fila.consultar), celdaCheck(fila.sidebar)];
      const estado = celdaCheck(ok ? 'ok' : 'fail');
      html +=
        `<tr>` +
        `<td style="${td()}"><b>${esc(fila.etapa)}</b><br>${fila.comprobante}</td>` +
        checks.map((c) => `<td style="${td(c.style)}">${c.html}</td>`).join('') +
        `<td style="${td('font-size:12px')}">${fila.importes}</td>` +
        `<td style="${td('font-size:12px')}">${fila.imputaciones}</td>` +
        `<td style="${td(estado.style)}">${ok ? '✅ OK' : '❌ FALLO'}</td>` +
        `</tr>`;
    }
    html += `</tbody></table>`;
    html += `<div style="font-size:11px;color:${C.suave};margin-bottom:12px">Pre-grabado = importes capturados antes de grabar (en Cobranzas: importe a aplicar = total y valores sin saldo) · Consultar = igual a Pre-grabado (en Comprobantes: Datos Básicos igual a la Factura) · Sidebar = Más › Ver detalles igual a lo grabado · — = no aplica.</div>`;
  }

  // Fallas y observaciones (visibles: es lo que hay que leer)
  const fallas = [
    ...r.tests.filter((t) => t.estado !== 'passed').map((t) => `<b>${esc(t.titulo)}</b> (${esc(t.estado)})${t.error ? `<pre style="white-space:pre-wrap;margin:4px 0 0;font-size:12px">${esc(t.error)}</pre>` : ''}`),
    ...filas.flatMap((x) => x.fallas.map((m) => `<b>${esc(x.etapa)}:</b> ${esc(m)}`)),
  ];
  if (fallas.length) {
    html += `<div style="background:${C.malFondo};border-left:4px solid ${C.malTexto};padding:8px 12px;margin:8px 0">`;
    html += `<b style="color:${C.malTexto}">Fallas</b><ul style="margin:4px 0;padding-left:18px">${fallas.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
  }
  const observaciones = filas.flatMap((x) => x.observaciones.map((m) => `<b>${esc(x.etapa)}:</b> ${m}`));
  if (observaciones.length) {
    html += `<div style="background:${C.avisoFondo};border-left:4px solid ${C.avisoTexto};padding:8px 12px;margin:8px 0;font-size:13px">`;
    html += `<b style="color:${C.avisoTexto}">Observaciones</b><ul style="margin:4px 0;padding-left:18px">${observaciones.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
  }

  // 4. Detalle SOLO de los errores: conceptos que no coinciden, con el valor de cada fuente
  const detalles = filas.map((x) => x.detalle).filter(Boolean);
  if (detalles.length) {
    html += `<h3 style="margin:16px 0 4px;color:${C.malTexto}">Detalle de errores</h3>`;
    html += `<div style="font-size:12px;color:${C.suave}">Solo se listan los conceptos que no coinciden; en rojo, el valor distinto.</div>`;
    html += detalles.join('');
  }
  html += `<p style="font-size:11px;color:${C.suave};margin-top:14px">Detalle completo de importes en los adjuntos (resumen-ejecucion.json y reporte de Playwright).</p>`;
  html += `</div>`;
  return { asunto, html };
}

/** Documento HTML autónomo (vista previa / adjunto) con el cuerpo del correo. */
export function documentoHtml(asunto: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(asunto)}</title></head><body style="margin:16px;background:#fff">${cuerpo}</body></html>`;
}
