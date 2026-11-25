import { expect, Page, Locator } from '@playwright/test';
import { clickIfVisible } from './playwrightHelpers';

// ---- Datos por defecto del sandbox (ver CLAUDE.md) ------------------------------
export const USUARIO = 'supervisor@global.com.ar';
export const PASSWORD = 'supervisor';
/** Se selecciona por código: el nombre del cliente cambia con los datos del sandbox. */
export const CLIENTE_CODIGO = '59';
export const ARTICULO_CODIGO = '1002';
export const ARTICULO_OPCION = '(1002) Artículo';

// ---- Sesión y navegación ----------------------------------------------------------
export async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Alias' }).fill(USUARIO);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.locator('a#searchlight')).toBeVisible({ timeout: 30_000 });
}

/**
 * Espera a que `destino` sea visible aceptando el popup "Continuar" cada vez que aparezca.
 * El popup ("la opción se está utilizando en otra pestaña") puede tardar 5-10 s en mostrarse
 * y la app no avanza hasta que se acepta.
 */
export async function esperarAceptandoContinuar(page: Page, destino: Locator, timeout = 45_000) {
  const continuar = page.getByRole('button', { name: 'Continuar' });
  await expect(async () => {
    await clickIfVisible(continuar, page, 1000);
    await expect(destino).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout });
}

/**
 * Ejecuta `accion` hasta que `destino` sea visible, aceptando el popup "Continuar" cuando aparezca.
 * Si el popup se muestra justo durante la acción, la app descarta la navegación: por eso se reintenta.
 */
export async function accionConContinuar(page: Page, accion: () => Promise<void>, destino: Locator) {
  const continuar = page.getByRole('button', { name: 'Continuar' });
  await expect(async () => {
    await clickIfVisible(continuar, page, 1000);
    if (await destino.isVisible()) return;
    await accion();
    await clickIfVisible(continuar, page, 4000);
    await expect(destino).toBeVisible({ timeout: 8000 });
  }).toPass({ timeout: 90_000 });
}

/**
 * Abre un módulo con Searchlight: escribe el nombre y hace doble clic en el resultado.
 * `categoria` filtra el grupo de resultados (Remitos/Facturas existen en Ventas y en Compras).
 */
export async function abrirModulo(page: Page, modulo: string, destino: Locator, categoria = 'Ventas') {
  const buscador = page.getByRole('textbox', { name: 'Buscar con Searchlight...' });
  const resultado = page
    .locator('li.ng-spotlight-results-category')
    .filter({ has: page.locator('> .ng-spotlight-results-list-header', { hasText: new RegExp(`^\\s*${categoria}\\s*$`, 'i') }) })
    .locator('li.ng-spotlight-results-list-item', { hasText: new RegExp(`^\\s*${modulo}\\s*$`) })
    .first();
  await accionConContinuar(
    page,
    async () => {
      if (!(await buscador.isVisible())) await page.locator('a#searchlight').click({ timeout: 3000 });
      await buscador.fill(modulo, { timeout: 3000 });
      await resultado.dblclick({ timeout: 3000 });
    },
    destino,
  );
}

// ---- Formularios --------------------------------------------------------------------
/** Selecciona una opción del typeahead escribiendo de a una tecla (dispara la búsqueda). */
export async function seleccionarTypeahead(page: Page, input: Locator, texto: string, opcion: string | RegExp) {
  await input.fill('');
  await input.pressSequentially(texto, { delay: 100 });
  const item = page.locator('ul[role=listbox] li:visible', { hasText: opcion }).first();
  await expect(item).toBeVisible();
  await item.click();
}

/** Abre una sección del formulario (Datos Básicos, Imputaciones, Totales…) desde el desplegable. */
export async function irASeccion(page: Page, seccion: string) {
  const menu = page.locator('ul.dropdown-menu', { has: page.locator('li[ng-repeat="section in sections"]') });
  // Coincidencia exacta (con o sin "*"): "Totales" no debe tomar "Totales Otros".
  const opcion = menu.locator('li[ng-repeat="section in sections"]', { hasText: new RegExp(`^\\s*${seccion}\\s*\\*?\\s*$`) });
  if (!(await opcion.isVisible())) {
    await menu.locator('xpath=..').locator('a.dropdown-toggle:visible').click();
  }
  await opcion.click();
}

/** Selecciona el cliente por defecto (por código) en el comprobante abierto. */
export async function seleccionarCliente(page: Page) {
  const cuenta = page.locator('#CoCuenta');
  await expect(cuenta).toBeEditable();
  await seleccionarTypeahead(page, cuenta, CLIENTE_CODIGO, new RegExp(`^\\s*\\(${CLIENTE_CODIGO}\\)`));
  await expect(cuenta).toHaveValue(new RegExp(`^\\(${CLIENTE_CODIGO}\\)`));
}

/**
 * Un artículo a cargar en el detalle. `busqueda` es lo que se escribe en el typeahead (código o
 * descripción) y `opcion` el texto del ítem a elegir (por defecto, `busqueda`).
 * Sin `precio` se deja el precio de lista que propone el sistema.
 */
export type ArticuloACargar = { busqueda: string; opcion?: string | RegExp; cantidad: number; precio?: number };

export const ARTICULO_CAJA = 'CAJA DE CARTON CORRUGADO PARA 2 EQUIPOS';

/** Artículos por defecto: (1002) x 3 a $3500 + caja de cartón x 5 a precio de lista. */
export const ARTICULOS_POR_DEFECTO: ArticuloACargar[] = [
  { busqueda: ARTICULO_CODIGO, opcion: ARTICULO_OPCION, cantidad: 3, precio: 3500 },
  // Se busca por descripción (el typeahead busca también en la descripción) y se elige ese ítem
  { busqueda: ARTICULO_CAJA, cantidad: 5 },
];

/** Presiona Tab (hasta `maxTabs` veces) hasta que `campo` tenga el foco. */
async function tabularHasta(page: Page, campo: Locator, maxTabs = 5) {
  for (let i = 0; i < maxTabs; i++) {
    if (await campo.evaluate((e) => e === document.activeElement).catch(() => false)) return;
    // Dar tiempo a que la app mueva el foco tras el Tab anterior (carga del artículo, precio…)
    if (await expect(campo).toBeFocused({ timeout: 1500 }).then(() => true, () => false)) return;
    await page.keyboard.press('Tab');
  }
  await expect(campo).toBeFocused();
}

/** Agrega una línea al detalle: "+", artículo, Tab por Cantidad / Bultos / Precio y Enter para confirmar. */
export async function cargarArticulo(page: Page, art: ArticuloACargar) {
  await page.locator('.ng-scope > .ibox-tools > a').first().click();
  const articulo = page.locator('#CoArticulo');
  await expect(articulo).toBeVisible();
  await seleccionarTypeahead(page, articulo, art.busqueda, art.opcion ?? art.busqueda);
  await articulo.press('Tab');

  // Algunos artículos agregan campos intermedios (p. ej. "Ruta" entre Artículo y Cantidad):
  // se sigue tabulando hasta llegar a cada campo esperado.
  const cant = page.locator('#CantidadOriginal');
  await tabularHasta(page, cant);
  await cant.fill(String(art.cantidad));
  await cant.press('Tab');

  await tabularHasta(page, page.locator('#CantidadBultosArticulo'));
  await page.keyboard.press('Tab');

  const precio = page.locator('#PrecioUnitarioDigitado');
  await tabularHasta(page, precio);
  if (art.precio !== undefined) {
    await precio.fill(String(art.precio));
  } else {
    // Precio de lista: lo completa el sistema al elegir el artículo
    await expect(precio).not.toHaveValue(/^\s*(0([.,]0+)?)?\s*$/);
  }
  await precio.press('Tab');
  await page.keyboard.press('Enter');
  await expect(articulo).toBeHidden();
}

/** Carga cliente (por código) y las líneas de artículos indicadas (1 o N). */
export async function cargarClienteYArticulos(page: Page, articulos: ArticuloACargar[] = ARTICULOS_POR_DEFECTO) {
  await seleccionarCliente(page);
  for (const art of articulos) await cargarArticulo(page, art);
  await expect.poll(async () => (await leerDetalle(page)).length, { message: 'líneas cargadas en el detalle' }).toBe(articulos.length);
}

// ---- Lectura de importes ------------------------------------------------------------
export function importeTotal(page: Page) {
  return page
    .locator('xpath=//label[normalize-space(.)="IMPORTE $"]/following-sibling::div/p[contains(@class,"form-control-static")]')
    .filter({ visible: true });
}

/** Lee todos los pares etiqueta → monto visibles en la sección Totales (GRAV, IVA, PERC., TOTAL…). */
export async function leerTotales(page: Page): Promise<Record<string, string>> {
  await expect(importeTotal(page)).toHaveText(/\d/);
  const pares = await page.locator('.form-group:visible').evaluateAll((grupos) =>
    grupos
      .map((g) => {
        const label = g.querySelector(':scope > label') as HTMLElement | null;
        const valor = g.querySelector(':scope > div > p.form-control-static') as HTMLElement | null;
        return label && valor ? [label.innerText.replace(/\s+/g, ' ').trim(), valor.innerText.trim()] : null;
      })
      .filter((p): p is string[] => p !== null),
  );
  return Object.fromEntries(pares);
}

export type Imputacion = { totalImputado: string; pendienteImputar: string | null; importes: string[] };

/**
 * Abre una solapa de la sección Imputaciones (Contables, Conceptos, Provincias, Internos)
 * y devuelve el "Total Imputado" del encabezado y los importes de cada fila de la grilla.
 */
export async function leerImputacion(page: Page, solapa: 'Contables' | 'Conceptos' | 'Provincias' | 'Internos'): Promise<Imputacion> {
  const tab = page.locator('.nav-tabs:visible > li', { hasText: solapa }).locator('a');
  await tab.click();
  const panel = page.locator((await tab.getAttribute('href')) as string); // p. ej. #taba-2
  const titulo = panel.locator('.ibox-title h5').first();
  await expect(titulo).toHaveText(/Total Imputado\s*\$\s*[\d.,]+/);
  const totalImputado = (await titulo.innerText()).match(/Total Imputado\s*\$\s*([\d.,]+)/)![1];
  // "Pendiente a Imputar: $X" solo se muestra cuando la imputación no cubre el total (p. ej. Contables)
  const etiquetaPendiente = titulo.locator('span.label:visible');
  const pendienteImputar = (await etiquetaPendiente.count())
    ? ((await etiquetaPendiente.first().innerText()).match(/\$\s*(-?[\d.,]+)/)?.[1] ?? null) // puede ser negativo (Comprobantes)
    : null;
  // La columna "Importe" es la última celda con valor de cada fila de la grilla
  const importes = await panel.locator('.jqx-grid-content [role=row]').evaluateAll((filas) =>
    filas
      .map((f) => [...f.querySelectorAll('[role=gridcell]')].map((c) => (c as HTMLElement).innerText.trim()).filter(Boolean))
      .filter((celdas) => celdas.length > 0 && !/No hay datos/i.test(celdas.join(' ')))
      .map((celdas) => celdas[celdas.length - 1]),
  );
  return { totalImputado, pendienteImputar, importes };
}

export type Percepcion = { provincia: string; alicuota: number; monto: number; sujeto: number };

/** Lee la grilla de la sección Percepciones (facturas). */
export async function leerPercepciones(page: Page): Promise<Percepcion[]> {
  await expect(page.locator('.ibox-title:visible', { hasText: /^\s*Percepciones\s*$/ })).toBeVisible();
  return page.evaluate(() => {
    const $ = (window as any).$;
    for (const g of Array.from(document.querySelectorAll<HTMLElement>('.jqx-grid'))) {
      if (!g.offsetParent) continue;
      const filas = $(g).jqxGrid('getrows') as any[];
      if (filas.length && 'PIBAlicuota' in filas[0]) {
        return filas.map((r) => ({ provincia: r.CoProvinciaDesc, alicuota: r.PIBAlicuota, monto: r.Monto, sujeto: r.Importe }));
      }
    }
    return [];
  });
}

export type Importes = {
  contables: Imputacion;
  conceptos: Imputacion;
  provincias: Imputacion;
  percepciones?: Percepcion[];
  totales: Record<string, string>;
};

/** Captura Imputaciones (Contables, Conceptos y Provincias), Percepciones (opcional) y Totales del comprobante abierto. */
export async function capturarImportes(page: Page, opciones: { percepciones?: boolean } = {}): Promise<Importes> {
  await irASeccion(page, 'Imputaciones');
  const contables = await leerImputacion(page, 'Contables');
  const conceptos = await leerImputacion(page, 'Conceptos');
  const provincias = await leerImputacion(page, 'Provincias');
  let percepciones: Percepcion[] | undefined;
  if (opciones.percepciones) {
    await irASeccion(page, 'Percepciones');
    percepciones = await leerPercepciones(page);
  }
  await irASeccion(page, 'Totales');
  const totales = await leerTotales(page);
  return { contables, conceptos, provincias, ...(percepciones ? { percepciones } : {}), totales };
}

// ---- Detalle y Pendientes -----------------------------------------------------------
export type LineaDetalle = {
  CoArticulo: string;
  Descripcion: string;
  CantidadOriginal: number;
  PrecioUnitarioDigitado: number;
  Total: number;
  NoPedido: number;
  NoRemito: number;
};

/** Lee las líneas del detalle del comprobante abierto desde la grilla jqx (por nombre de campo). */
export async function leerDetalle(page: Page): Promise<LineaDetalle[]> {
  return page.evaluate(() => {
    const filas = (window as any).$('#grid_comprobante_detalles').jqxGrid('getrows') as any[];
    return filas.map((r) => ({
      CoArticulo: r.CoArticulo,
      Descripcion: r.CoArticuloDesc ?? r.DescripcionArticulo ?? r.Descripcion ?? null,
      CantidadOriginal: r.CantidadOriginal,
      PrecioUnitarioDigitado: r.PrecioUnitarioDigitado,
      Total: r.Total,
      NoPedido: r.NoPedido,
      NoRemito: r.NoRemito,
    }));
  });
}

/**
 * Abre "Pendientes" en el comprobante nuevo, filtra por número, tilda el comprobante origen y lo invoca.
 * `prefijo` es el código del origen en la clave de la fila: PDVT (pedido de venta), RTVT (remito de venta).
 */
export async function invocarPendiente(
  page: Page,
  prefijo: 'PDVT' | 'RTVT',
  nro: number,
  opciones: { reabrirComprobante?: () => Promise<void> } = {},
) {
  const modal = page.locator('.modal-dialog:visible', { hasText: 'Selección de Registros' });
  const fila = modal.locator(`tr[data-key^="${prefijo}-${nro}-"]`);
  // El pendiente de un remito recién generado aparece con demora y el formulario abierto no refresca
  // la lista: si no está, se descarta el comprobante y se abre uno nuevo (`reabrirComprobante`).
  let intento = 0;
  await expect(async () => {
    if (await modal.isVisible()) {
      await modal.locator('button.close').first().click();
      await expect(modal).toBeHidden();
    }
    if (intento++ > 0 && opciones.reabrirComprobante) await opciones.reabrirComprobante();
    await page.locator('button[ng-click="pendientes()"]:visible').first().click();
    await expect(modal).toBeVisible();
    const filtro = modal.locator('input[type=text]:visible').first();
    await filtro.fill(String(nro));
    await filtro.press('Enter');
    await expect(fila, `${prefijo} ${nro} en Pendientes`).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 300_000, intervals: [10_000, 20_000, 30_000] });
  await fila.locator('.jqx-tree-grid-checkbox').click();
  await modal.getByRole('button', { name: 'Aceptar' }).click();
  await expect(modal).toBeHidden({ timeout: 15_000 });
  // "Procesando comprobantes pendientes..." -> el detalle se completa en segundo plano
  await expect.poll(async () => (await leerDetalle(page)).length, { timeout: 60_000 }).toBeGreaterThan(0);
}

// ---- Explorador (grilla) ---------------------------------------------------------
/** Columna de la grilla del explorador: confirma que el módulo abrió (en la home también hay un "+"). */
export function grillaExplorador(page: Page) {
  // Comprobantes de Ventas no tiene "No. Comprobante" sino "No. Comprobante Fiscal"
  // (se ancla al encabezado de columna: el formulario de Comprobantes tiene un label con el mismo texto)
  return page
    .locator('[role=columnheader]')
    .filter({ hasText: /^\s*No\. (Comprobante( Fiscal)?|Liquidación)\s*$/ }) // Cobranzas: "No. Liquidación"
    .filter({ visible: true })
    .first();
}

/** Números de comprobante visibles en la grilla del explorador. */
export async function comprobantesEnGrilla(page: Page): Promise<number[]> {
  const textos = await page.locator('span.explorer-grid-clickable-cell[action="ver"]').allInnerTexts();
  return textos.map((t) => t.trim()).filter((t) => /^\d+$/.test(t)).map(Number);
}

export async function esperarGrillaCargada(page: Page) {
  await expect(
    page
      .locator('span.explorer-grid-clickable-cell[action="ver"]')
      // Comprobantes no tiene celdas clickeables: alcanza con ver una numeración fiscal
      .or(page.locator('.jqx-grid:visible [role=gridcell]').filter({ hasText: /^\s*[A-Z]-\d{4}-\d{8}\s*$/ }))
      .or(page.getByText('No hay datos para mostrar.'))
      .filter({ visible: true }) // hay grillas ocultas con "No hay datos" (p. ej. imputaciones del formulario)
      .first(),
  ).toBeVisible({ timeout: 30_000 });
}

function celdaComprobante(page: Page, nro: number) {
  return page.locator('span.explorer-grid-clickable-cell[action="ver"]', { hasText: new RegExp(`^${nro}$`) });
}

/** Abre un explorador por Searchlight, espera la grilla y devuelve el mayor número de comprobante visible. */
export async function abrirExplorador(page: Page, modulo: string, categoria = 'Ventas'): Promise<number> {
  // Destino = breadcrumb "<Categoría> / <Módulo>": si ya estamos en otro explorador (p. ej. Remitos),
  // la grilla genérica también está visible y no alcanza para saber que se abrió el módulo correcto.
  // En el explorador el breadcrumb es una lista "Ventas / <strong>Módulo</strong> (N Registros)".
  const breadcrumb = page
    .getByRole('list')
    .filter({ has: page.getByText(categoria, { exact: true }) })
    .locator('li > strong', { hasText: new RegExp(`^\\s*${modulo}\\s*$`) })
    .filter({ visible: true })
    .first();
  await abrirModulo(page, modulo, breadcrumb, categoria);
  await expect(grillaExplorador(page)).toBeVisible({ timeout: 30_000 });
  await esperarGrillaCargada(page);
  const previos = await comprobantesEnGrilla(page);
  return previos.length ? Math.max(...previos) : 0;
}

/** Abre Pedidos, espera la grilla y devuelve el mayor número de comprobante existente. */
export function abrirPedidos(page: Page): Promise<number> {
  return abrirExplorador(page, 'Pedidos');
}

/** Presiona "+" en el explorador y espera el formulario nuevo. */
export async function nuevoComprobante(page: Page) {
  await accionConContinuar(page, () => page.getByRole('button', { name: '+' }).click({ timeout: 3000 }), page.locator('#CoCuenta'));
}

const conDialogos = new WeakSet<Page>();

/**
 * Guarda con el disquete y acepta todo lo que aparezca hasta volver a la grilla:
 * - modal "Generar Comprobante" (facturas: numeración fiscal / CAE) -> Aceptar
 * - cartel "Generación de comprobante fiscal exitosa" -> Aceptar
 * - popup "Continuar"
 * Devuelve el texto de los carteles mostrados (p. ej. con la numeración fiscal).
 */
export async function guardarComprobante(page: Page): Promise<string[]> {
  if (!conDialogos.has(page)) {
    page.on('dialog', (d) => d.accept());
    conDialogos.add(page);
  }
  const mensajes: string[] = [];
  const modalAceptar = page.locator('.modal-dialog:visible').getByRole('button', { name: 'Aceptar' });
  const sweet = page.locator('.sweet-alert:visible');
  const sweetAceptar = sweet.locator('button:visible', { hasText: /^\s*(Aceptar|OK|Sí|Si)\s*$/ });
  const continuar = page.getByRole('button', { name: 'Continuar' });
  const aceptarCarteles = async () => {
    if (await sweet.first().isVisible()) {
      mensajes.push((await sweet.first().innerText()).replace(/\s+/g, ' ').trim());
      await sweetAceptar.first().click({ timeout: 3000 });
    }
    if (await modalAceptar.first().isVisible()) await modalAceptar.first().click({ timeout: 3000 });
    if (await continuar.first().isVisible()) await continuar.first().click({ timeout: 3000 });
  };

  await page.locator('#s2_form_save').click();
  await expect(async () => {
    await aceptarCarteles();
    await expect(grillaExplorador(page)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 120_000 });
  // El cartel de éxito de las facturas puede aparecer cuando la grilla ya está visible
  const hayCartel = await sweet.first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  if (hayCartel) await aceptarCarteles();
  return mensajes;
}

/**
 * Ubica el comprobante más reciente (número más alto, mayor a `maxPrevio`), hace clic derecho ->
 * Consultar y espera la cabecera "<Tipo> | N°: <nro>". Devuelve el número.
 */
export async function consultarUltimoComprobante(
  page: Page,
  maxPrevio: number,
  cabeceraEsperada?: (nro: number) => RegExp,
): Promise<number> {
  await expect
    .poll(async () => Math.max(0, ...(await comprobantesEnGrilla(page))), { timeout: 30_000 })
    .toBeGreaterThan(maxPrevio);
  const nuevo = Math.max(...(await comprobantesEnGrilla(page)));

  // Cabecera de la consulta: "Pedido | N°: 245"; un comprobante con numeración fiscal (factura generada)
  // muestra esa numeración en su lugar: "FACTURA | A-0010-00000057". Cobranzas: "No. Liquidación: 101".
  const cabecera = page
    .getByText(cabeceraEsperada ? cabeceraEsperada(nuevo) : new RegExp(`\\|\\s*(N[º°]:\\s*${nuevo}\\b|[A-Z]-\\d{4}-\\d{8})`))
    .filter({ visible: true })
    .first();
  // La grilla se refresca tras guardar, por eso se reintenta
  await accionConContinuar(
    page,
    async () => {
      // A veces, tras grabar, el encabezado de la grilla queda encima de la primera fila e intercepta el
      // clic: se refresca la grilla y se reintenta
      await celdaComprobante(page, nuevo)
        .click({ button: 'right', timeout: 3000 })
        .catch(async (e) => {
          await page.locator('#s2_explorer_refresh:visible').click({ timeout: 3000 }).catch(() => {});
          await esperarGrillaCargada(page).catch(() => {});
          throw e;
        });
      await page.locator('#s2_menu_context_details:visible a', { hasText: 'Consultar' }).click({ timeout: 3000 });
    },
    cabecera,
  );
  return nuevo;
}

/** Numeración fiscal (p. ej. A-0010-00000057) que muestra la cabecera del comprobante consultado, si tiene. */
export async function numeracionFiscalEnCabecera(page: Page): Promise<string | null> {
  const cabecera = page.getByText(/\|\s*[A-Z]-\d{4}-\d{8}/).filter({ visible: true }).first();
  if (!(await cabecera.isVisible())) return null;
  return (await cabecera.innerText()).match(/[A-Z]-\d{4}-\d{8}/)![0];
}

/**
 * Sale del formulario (botón Volver) y espera la grilla del explorador. Si el formulario tenía
 * cambios sin guardar y el sistema pide confirmación, la acepta (se descarta el comprobante).
 */
export async function volverAlExplorador(page: Page) {
  const confirmar = page.locator('.sweet-alert:visible button:visible', { hasText: /^\s*(Sí|Si|Aceptar|OK|Salir)\s*$/ });
  await accionConContinuar(
    page,
    async () => {
      if (await page.locator('button[ng-click="cancel()"]:visible').first().isVisible()) {
        await page.locator('button[ng-click="cancel()"]:visible').first().click({ timeout: 3000 });
      }
      await clickIfVisible(confirmar, page, 2000);
    },
    // Solo el explorador muestra "(N Registros)" en el breadcrumb: el formulario de Cobranzas también
    // tiene una columna "No. Liquidación" y no alcanza con `grillaExplorador`
    marcaExplorador(page),
  );
  await expect(grillaExplorador(page)).toBeVisible();
  await esperarGrillaCargada(page);
}

/** Breadcrumb del explorador: "<Categoría> / <Módulo> (N Registros)". El formulario no lo muestra. */
export function marcaExplorador(page: Page) {
  return page.getByRole('list').filter({ hasText: /\(\d+ Registros?\)/ }).filter({ visible: true }).first();
}

/**
 * Selecciona en la grilla del explorador solo la fila del comprobante `nro` (clic en la primera celda:
 * el clic sobre el número abre el PDF) y elige `opcion` del menú "Más" (`#s2_explorer_more`),
 * que se habilita con exactamente una fila seleccionada.
 */
export async function accionMas(page: Page, nroOFila: number | Locator, opcion: string) {
  // Pedidos/Facturas/Remitos: por número (celda clickeable). Comprobantes: se pasa la fila (no tiene celda clickeable).
  const fila = typeof nroOFila === 'number' ? page.locator('[role=row]', { has: celdaComprobante(page, nroOFila) }) : nroOFila;
  const mas = page.locator('#s2_explorer_more');
  await page.evaluate(() => {
    for (const g of Array.from(document.querySelectorAll('.jqx-grid'))) {
      try {
        (window as any).$(g).jqxGrid('clearselection');
      } catch {
        /* grilla sin selección */
      }
    }
  });
  await expect(async () => {
    if (!(await mas.isEnabled())) await fila.locator('[role=gridcell]').first().click({ timeout: 3000 });
    await expect(mas).toBeEnabled({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await mas.click();
  await page.locator('.dropdown-menu:visible a', { hasText: new RegExp(`^\\s*${opcion}\\s*$`) }).first().click();
}

/** Lo que muestra el sidebar "Más > Ver Detalles" de un comprobante. */
export type SidebarDetalles = {
  /** Importes de cada imputación del sidebar ([] si la cuenta no tiene imputaciones de ese tipo). */
  imputaciones: { contables: string[]; conceptos: string[]; provincias: string[] };
  /** Encabezado de Totales: "Total: ARS X", "Neto: ARS X", "Impuestos: ARS X". */
  resumen: { total: string; neto: string; impuestos: string };
  /** Mismos pares etiqueta → monto que la sección Totales del formulario ("IMPORTE ARS" se normaliza a "IMPORTE $"). */
  totales: Record<string, string>;
};

/**
 * Desde la grilla del explorador (Pedidos, Facturas…): selecciona el comprobante `nro`, abre
 * "Más > Ver Detalles" y lee las solapas Imputaciones y Totales del sidebar; al final lo cierra.
 */
export async function leerSidebarDetalles(
  page: Page,
  nroOFila: number | Locator,
  opciones: { sidebarId?: string; cabecera?: RegExp } = {},
): Promise<SidebarDetalles> {
  // Pedidos/Facturas: #showComprobanteDetallesRightSidebar; Comprobantes: #showFacturasDebitosCreditosDetallesRightSidebar
  const sidebarId = opciones.sidebarId ?? 'showComprobanteDetallesRightSidebar';
  const sidebar = page.locator(`#${sidebarId}`);
  // Cabecera de cada solapa: "<Módulo>: <nro> - <cliente>…" (p. ej. "Facturas: 335 - 0 - - MAC TRAVEL SRL - A-0010-…");
  // en Comprobantes: "Comprobantes: MAC TRAVEL SRL - FACTURA - A-0010-00000064" (se pasa `cabecera`)
  const delComprobante = opciones.cabecera ?? new RegExp(`:\\s*${nroOFila}\\s+-`);
  await accionMas(page, nroOFila, 'Ver Detalles');
  await expect(sidebar).toBeVisible();

  // ---- Imputaciones: un acordeón por tipo; el importe de cada fila está en span[title="Importe"]
  await sidebar.locator(`[ng-click="changeSection('imputaciones')"]`).click();
  const seccionImp = sidebar.locator('[ng-show="showImputacionesSection"]');
  await expect(seccionImp.locator('.ibox-title small')).toHaveText(delComprobante);
  const acordeon = (tipo: string) => seccionImp.locator(`uib-accordion[ng-show="imputaciones.${tipo}.length > 0"]`);
  const sinImputaciones = seccionImp.locator('uib-accordion[ng-show^="imputaciones.contables.length == 0"]');
  await expect(acordeon('contables').or(acordeon('conceptos')).or(acordeon('provincias')).or(sinImputaciones).filter({ visible: true }).first()).toBeVisible();
  const importesDe = async (tipo: string) =>
    (await acordeon(tipo).isVisible())
      ? (await acordeon(tipo).locator('.panel-heading span[title="Importe"]').allInnerTexts()).map((t) => t.trim())
      : [];
  const imputaciones = {
    contables: await importesDe('contables'),
    conceptos: await importesDe('conceptos'),
    provincias: await importesDe('provincias'),
  };

  // ---- Totales: resumen (Total / Neto / Impuestos) + los mismos .form-group que el formulario
  await sidebar.locator(`[ng-click="changeSection('totales')"]`).click();
  const seccionTot = sidebar.locator('[ng-show="showTotalesSection"]');
  await expect(seccionTot.locator('.ibox-title small')).toHaveText(delComprobante);
  await expect(seccionTot.locator('ul.stat-list')).toContainText(/Total:\s*\S+\s*[\d.,]+/); // ng-show="totalesLoaded"
  const textoResumen = await seccionTot.locator('ul.stat-list').innerText();
  const monto = (etiqueta: string) => textoResumen.match(new RegExp(`${etiqueta}:\\s*\\S+\\s*([\\d.,]+)`))?.[1] ?? '';
  const resumen = { total: monto('Total'), neto: monto('Neto'), impuestos: monto('Impuestos') };
  const pares = await seccionTot.locator('.form-group').evaluateAll((grupos) =>
    grupos
      .map((g) => {
        const label = g.querySelector(':scope > label') as HTMLElement | null;
        const valor = g.querySelector(':scope > div > p.form-control-static') as HTMLElement | null;
        if (!label || !valor || !(g as HTMLElement).offsetParent) return null;
        // El sidebar muestra la moneda ("IMPORTE ARS"); el formulario, el símbolo ("IMPORTE $")
        const etiqueta = label.innerText.replace(/\s+/g, ' ').trim().replace(/^IMPORTE\s+\S+$/, 'IMPORTE $');
        return [etiqueta, valor.innerText.trim()];
      })
      .filter((p): p is string[] => p !== null),
  );

  await sidebar.locator(`a[ng-click="closeRightSideBar('${sidebarId}')"]:visible`).first().click();
  await expect(sidebar).toBeHidden();
  return { imputaciones, resumen, totales: Object.fromEntries(pares) };
}

/**
 * Remitos: "Más" -> "Generar" -> Aceptar. Genera el remito (numeración fiscal y movimiento de stock);
 * recién entonces aparece como pendiente en Facturas. Devuelve la numeración fiscal (R-XXXX-XXXXXXXX).
 */
export async function generarRemito(page: Page, nro: number): Promise<string> {
  const fila = page.locator('[role=row]', { has: celdaComprobante(page, nro) });
  await accionMas(page, nro, 'Generar');
  const modal = page.locator('.modal-dialog:visible', { hasText: 'Generar Comprobante' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Aceptar' }).click();
  await expect(modal).toBeHidden({ timeout: 60_000 });
  await clickIfVisible(page.locator('.sweet-alert:visible button:visible', { hasText: /^\s*(Aceptar|OK)\s*$/ }), page, 3000);

  await expect(fila).toContainText(/R-\d{4}-\d{8}/, { timeout: 30_000 });
  return (await fila.innerText()).match(/R-\d{4}-\d{8}/)![0];
}

// ---- Comprobantes de Ventas (solo importes, sin líneas de artículos) ------------------
const SIDEBAR_COMPROBANTES = 'showFacturasDebitosCreditosDetallesRightSidebar';

/** Datos de la fila del comprobante en la grilla de Comprobantes (jqxGrid `getrows`). */
export type FilaComprobante = {
  noOperacion: number;
  letraLugarNumero: string;
  coCliente: number;
  cliente: string;
  operacion: string;
  estado: string;
  porcentajeDescuento: number;
  importe: number;
};

/** Abre Ventas > Comprobantes (Searchlight) y espera su grilla ("No. Comprobante Fiscal"). */
export async function abrirComprobantes(page: Page) {
  const breadcrumb = page
    .getByRole('list')
    .filter({ has: page.getByText('Ventas', { exact: true }) })
    .locator('li > strong', { hasText: /^\s*Comprobantes\s*$/ })
    .filter({ visible: true })
    .first();
  await abrirModulo(page, 'Comprobantes', breadcrumb, 'Ventas');
  await expect(page.locator('#s2_explorer_search')).toBeVisible({ timeout: 30_000 });
  await esperarGrillaCargada(page);
}

/** Fila de la grilla que muestra la numeración fiscal (Letra-Lugar-Número). */
export function filaComprobante(page: Page, letraLugarNumero: string) {
  return page.locator('.jqx-grid:visible [role=row]').filter({ hasText: letraLugarNumero });
}

/**
 * Busca en Comprobantes la factura `letraLugarNumero` (p. ej. A-0010-00000064) del cliente `cliente`.
 * El buscador de la grilla (`#s2_explorer_search`) filtra por No. Comprobante = parte numérica de la
 * numeración fiscal; la fila se confirma por `LetraLugarNumero` y `CoCliente` (jqx `getrows`).
 * Reintenta porque el comprobante recién generado puede tardar en aparecer.
 */
export async function buscarComprobante(page: Page, letraLugarNumero: string, cliente = Number(CLIENTE_CODIGO)): Promise<FilaComprobante> {
  const numero = String(Number(letraLugarNumero.split('-').pop()));
  const buscador = page.locator('#s2_explorer_search');
  let encontrada: FilaComprobante | null = null;
  await expect(async () => {
    await clickIfVisible(page.getByRole('button', { name: 'Continuar' }), page, 500);
    await buscador.fill(numero);
    await buscador.press('Enter');
    await expect(filaComprobante(page, letraLugarNumero)).toBeVisible({ timeout: 8000 });
    encontrada = await page.evaluate(
      ({ lln, cli }) => {
        for (const g of Array.from(document.querySelectorAll<HTMLElement>('.jqx-grid'))) {
          if (!g.offsetParent) continue;
          const filas = ((window as any).$(g).jqxGrid('getrows') ?? []) as any[];
          const r = filas.find((x) => x.LetraLugarNumero === lln && Number(x.CoCliente) === cli);
          if (r)
            return {
              noOperacion: r.NoOperacion,
              letraLugarNumero: r.LetraLugarNumero,
              coCliente: r.CoCliente,
              cliente: r.Cliente,
              operacion: r.Operacion,
              estado: r._state_text,
              porcentajeDescuento: r.PorcentajeDescuento,
              importe: r.ImporteOriginal_Base,
            };
        }
        return null;
      },
      { lln: letraLugarNumero, cli: cliente },
    );
    expect(encontrada, `${letraLugarNumero} del cliente ${cliente} en Comprobantes`).not.toBeNull();
  }).toPass({ timeout: 90_000, intervals: [3000, 5000, 10_000] });
  return encontrada!;
}

/** Selecciona solo esa fila (clic en la primera celda) hasta que "Consultar" quede habilitado. */
async function seleccionarFila(page: Page, fila: Locator) {
  const consultar = page.locator('#s2_explorer_details');
  await page.evaluate(() => {
    for (const g of Array.from(document.querySelectorAll('.jqx-grid'))) {
      try {
        (window as any).$(g).jqxGrid('clearselection');
      } catch {
        /* grilla sin selección */
      }
    }
  });
  await expect(async () => {
    if (!(await consultar.isEnabled())) await fila.locator('[role=gridcell]').first().click({ timeout: 3000 });
    await expect(consultar).toBeEnabled({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

export type ResultadoEdicion = { permitido: boolean; mensaje: string | null };

/**
 * Intenta Editar el comprobante. El botón `#s2_explorer_edit` tiene
 * `ng-disabled="getSelectedRowCount() != 1 || !checkActualStateCanEdit()"`: el ESTADO de la fila
 * define si se puede editar (hoy "Pendiente" no permite). Si está habilitado y el sistema muestra un
 * aviso (p. ej. comprobante pagado / con cobranza imputada), se acepta y se informa el mensaje.
 * Nunca graba: si llega a abrirse el formulario de edición, se sale sin guardar.
 */
export async function intentarEditarComprobante(page: Page, fila: Locator, letraLugarNumero: string): Promise<ResultadoEdicion> {
  await seleccionarFila(page, fila);
  const editar = page.locator('#s2_explorer_edit');
  if (!(await editar.isEnabled())) return { permitido: false, mensaje: 'Botón Editar deshabilitado por el estado del comprobante' };

  await editar.click();
  const aviso = page.locator('.sweet-alert:visible, .toast:visible, .modal-dialog:visible').first();
  const formulario = page.getByText(new RegExp(`\\|\\s*${letraLugarNumero}`)).filter({ visible: true }).first();
  await expect(aviso.or(formulario).first()).toBeVisible({ timeout: 20_000 });
  if (await aviso.isVisible()) {
    const mensaje = (await aviso.innerText()).replace(/\s+/g, ' ').trim();
    await clickIfVisible(aviso.locator('button:visible', { hasText: /^\s*(Aceptar|OK|Cerrar)\s*$/ }), page, 2000);
    if (await formulario.isVisible()) await volverAlExplorador(page);
    return { permitido: false, mensaje };
  }
  // Se pudo entrar en edición: salir sin guardar
  await volverAlExplorador(page);
  return { permitido: true, mensaje: null };
}

/** Consultar el comprobante y esperar la cabecera "FACTURA | <Letra-Lugar-Número>". */
export async function consultarComprobante(page: Page, fila: Locator, letraLugarNumero: string) {
  const cabecera = page.getByText(new RegExp(`\\|\\s*${letraLugarNumero}`)).filter({ visible: true }).first();
  await accionConContinuar(
    page,
    async () => {
      await seleccionarFila(page, fila);
      await page.locator('#s2_explorer_details').click({ timeout: 3000 });
    },
    cabecera,
  );
}

const formatoImporte = (texto: string) => {
  const n = Number(texto.replace(/,/g, '').trim());
  return texto.trim() !== '' && Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : texto.trim();
};

/**
 * Lee el bloque "Totales" de Datos Básicos de Comprobantes (`#_tasas_impuestos_totales`):
 * labels con input (GRAV/IVA/PERC.: "126980.00") o texto (PERC. IIBB) y encabezados h5 con su valor
 * al lado ("TOTAL BRUTO:", "DESCUENTO/RECARGO:", "TOTAL NETO:", "TOTAL $:"). Devuelve las mismas
 * claves y formato que `leerTotales` (DESCUENTO / RECARGO, IMPORTE $) + "Total a Discriminar".
 *
 * IMPORTANTE: al abrir Consultar el foco queda en "Total a Discriminar" (`autofocus`,
 * `ng-blur="onTotalDiscriminarChange()"`): cualquier clic que le saque el foco RECALCULA en pantalla
 * GRAV/IVA/Bruto/Neto a partir de ese total. Por eso se lee apenas abre el formulario (Datos Básicos
 * es la sección inicial) y solo se navega con `irASeccion` si el bloque no está visible.
 */
export async function leerTotalesComprobante(page: Page): Promise<Record<string, string>> {
  const bloque = page.locator('#_tasas_impuestos_totales');
  if (!(await bloque.isVisible())) await irASeccion(page, 'Datos Básicos');
  await expect(bloque.locator('input#Monto1')).toHaveValue(/\d/);
  const pares = await bloque.evaluate((root) => {
    const res: [string, string][] = [];
    for (const label of Array.from(root.querySelectorAll('label'))) {
      if (!(label as HTMLElement).offsetParent) continue;
      const cont = label.nextElementSibling as HTMLElement | null;
      const input = cont?.querySelector('input') as HTMLInputElement | null;
      res.push([label.textContent!.replace(/\s+/g, ' ').trim(), input ? input.value : (cont?.innerText ?? '').trim()]);
    }
    for (const h5 of Array.from(root.querySelectorAll('h5'))) {
      if (!(h5 as HTMLElement).offsetParent) continue;
      const valor = h5.parentElement?.nextElementSibling as HTMLElement | null;
      res.push([h5.textContent!.replace(/\s+/g, ' ').replace(/:\s*$/, '').trim(), (valor?.innerText ?? '').trim()]);
    }
    return res;
  });
  const clave = (k: string) => (k === 'TOTAL $' ? 'IMPORTE $' : k.replace(/^DESCUENTO\s*\/\s*RECARGO$/, 'DESCUENTO / RECARGO'));
  return Object.fromEntries(pares.map(([k, v]) => [clave(k), formatoImporte(v)]));
}

/** Imputaciones (Contables, Conceptos, Provincias) del comprobante consultado en Comprobantes. */
export async function leerImputacionesComprobante(page: Page) {
  await irASeccion(page, 'Imputaciones');
  return {
    contables: await leerImputacion(page, 'Contables'),
    conceptos: await leerImputacion(page, 'Conceptos'),
    provincias: await leerImputacion(page, 'Provincias'),
  };
}

/** Sidebar "Más > Ver Detalles" de Comprobantes (otro id y otra cabecera que Pedidos/Facturas). */
export function leerSidebarComprobante(page: Page, fila: Locator, letraLugarNumero: string) {
  return leerSidebarDetalles(page, fila, { sidebarId: SIDEBAR_COMPROBANTES, cabecera: new RegExp(`-\\s*${letraLugarNumero}\\s*$`) });
}

// ---- Cobranzas (Financiera › Cobranzas) --------------------------------------------------
/** Valor a cargar en "Detalle de Valores" (modal "Detalle de Valor"). `importe` en formato "74854.71". */
export type ValorACargar = { operacion: string; noOperacion: string; cuenta: string; subCuenta: string; importe: string };
/** Valor leído de la grilla `#grid_valores_id` (en Consultar solo vienen descripciones, no códigos). */
export type ValorCobranza = { operacion: string; noOperacion: number; cuenta: string; subCuenta: string; importe: number };
/** Comprobante aplicado (grilla de deudas de la sección Comprobantes). */
export type ComprobanteAplicado = { letraLugarNumero: string; importeOriginal: number; deuda: number; importeAplicar: number };

/** Abre Financiera › Cobranzas; devuelve la mayor No. Liquidación de la grilla. */
export function abrirCobranzas(page: Page): Promise<number> {
  return abrirExplorador(page, 'Cobranzas', 'Financiera');
}

/** "Agregar" (+) en el explorador de Cobranzas y espera el formulario (Co. Cuenta). */
export async function nuevaCobranza(page: Page) {
  await accionConContinuar(page, () => page.locator('button[ng-click="add()"]:visible').first().click({ timeout: 3000 }), page.locator('#CoCuenta'));
}

/** Etiqueta "Saldo: X" del ibox de Valores (se oculta cuando el saldo es 0). Devuelve el monto o '0.00'. */
export async function leerSaldoCobranza(page: Page, opciones: { esperarSaldo?: boolean } = {}): Promise<string> {
  // Está en el ibox de Comprobantes ("Detalle de Liquidación") y en el de Valores: se lee el visible.
  // La etiqueta tarda un instante en actualizarse: con `esperarSaldo` se espera a que aparezca.
  const etiqueta = page.locator('.ibox-title span.label', { hasText: 'Saldo:' }).filter({ visible: true }).first();
  if (opciones.esperarSaldo) await etiqueta.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  else await page.waitForTimeout(1000);
  if (!(await etiqueta.isVisible())) return '0.00';
  return ((await etiqueta.innerText()).match(/Saldo:\s*(-?[\d.,]+)/)?.[1] ?? '').trim();
}

/**
 * Grillas de la cobranza. El id de la grilla de deudas es incremental (`jqxGrid1` solo si es la primera
 * grilla de la sesión; en el circuito completo es otro): se toma la jqx visible con la columna "Deuda ARS".
 */
const grillaDeudas = (page: Page) => page.locator('.jqx-grid').filter({ visible: true }).filter({ hasText: 'Deuda ARS' }).last();
const grillaValores = (page: Page) => page.locator('[id=grid_valores_id]').filter({ visible: true }).last();
/** Ejecuta un método jqxGrid sobre la grilla indicada. */
const jqx = <T>(grilla: Locator, metodo: string, arg?: unknown, timeout = 15_000): Promise<T> =>
  // (undefined dentro del arreglo llega como null al navegador)
  grilla.evaluate((el, [m, a]) => (a == null ? (window as any).$(el).jqxGrid(m) : (window as any).$(el).jqxGrid(m, a)), [metodo, arg ?? null] as const, { timeout });

/** Lee los comprobantes de la sección Comprobantes: en alta, los tildados; en Consultar, todos los aplicados. */
export async function leerComprobantesCobranza(page: Page): Promise<ComprobanteAplicado[]> {
  return grillaDeudas(page).evaluate((el) => {
    const g = (window as any).$(el);
    const seleccionados = (g.jqxGrid('getselectedrowindexes') as number[]).filter((i) => i >= 0);
    const filas = seleccionados.length ? seleccionados.map((i) => g.jqxGrid('getrowdata', i)) : (g.jqxGrid('getrows') as any[]);
    return filas.map((r: any) => ({
      letraLugarNumero: r.LetraLugarNumero,
      importeOriginal: r.ImporteOriginalPesos,
      deuda: r.DeudaPesos,
      importeAplicar: r.ImporteAplicacionPesos,
    }));
  });
}

/**
 * Sección Comprobantes: tilda la deuda `letraLugarNumero` (checkbox de la primera celda). Al tildarla,
 * "Importe Aplicar en ARS" (`ImporteAplicacionPesos`) toma el saldo de la deuda. Devuelve la fila.
 */
export async function seleccionarComprobanteCobranza(page: Page, letraLugarNumero: string): Promise<ComprobanteAplicado> {
  await irASeccion(page, 'Comprobantes');
  const grilla = grillaDeudas(page);
  let ultimoError = '';
  const indiceDe = async () => {
    try {
      return (await jqx<any[]>(grilla, 'getrows', undefined, 2000)).findIndex((r) => r.LetraLugarNumero === letraLugarNumero);
    } catch (e) {
      ultimoError = (e as Error).message.split('\n')[0];
      return -1;
    }
  };
  // La grilla de deudas se carga al elegir la cuenta
  try {
    await expect.poll(indiceDe, { timeout: 30_000 }).toBeGreaterThanOrEqual(0);
  } catch {
    // Diagnóstico: qué grillas jqx hay y qué contienen
    const grillas = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.jqx-grid')).map((g) => {
        let filas: unknown = null;
        try {
          filas = ((window as any).$(g).jqxGrid('getrows') as any[]).map((r) => r.LetraLugarNumero).slice(0, 25);
        } catch (e) {
          filas = `error: ${(e as Error).message}`;
        }
        return { visible: !!g.offsetParent, conDeuda: g.innerText.includes('Deuda ARS'), filas };
      }),
    );
    throw new Error(`${letraLugarNumero} no aparece en las deudas del cliente. Último error: ${ultimoError || '—'}. Grillas: ${JSON.stringify(grillas)}`);
  }
  const indice = await indiceDe();
  await jqx(grilla, 'ensurerowvisible', indice);
  const fila = grilla.locator('[role=row]').filter({ hasText: letraLugarNumero });
  await expect(async () => {
    const seleccionada = (await jqx<number[]>(grilla, 'getselectedrowindexes')).includes(indice);
    if (!seleccionada) await fila.locator('[role=gridcell]').first().click({ timeout: 3000 });
    await expect.poll(async () => (await jqx<any>(grilla, 'getrowdata', indice)).ImporteAplicacionPesos, { timeout: 3000 }).toBeGreaterThan(0);
  }).toPass({ timeout: 20_000 });
  const [aplicado] = (await leerComprobantesCobranza(page)).filter((c) => c.letraLugarNumero === letraLugarNumero);
  return aplicado;
}

/** Abre el ui-select (si está cerrado), busca `texto` y elige la opción que empieza con "(texto)". */
async function elegirUiSelect(page: Page, contenedor: Locator, texto: string) {
  const buscar = contenedor.locator('input.ui-select-search');
  if (!(await buscar.isVisible())) await contenedor.locator('.ui-select-toggle').filter({ visible: true }).first().click();
  await buscar.fill(texto);
  await contenedor.locator('.ui-select-choices-row', { hasText: new RegExp(`^\\s*\\(${texto}\\)`) }).filter({ visible: true }).first().click();
}

/**
 * Detalle de Valores › "+" (`add_item_valores()`, tooltip "Agregar") → modal "Detalle de Valor":
 * Tipo (`#CoOperacion`, ui-select) → No. Operación (`#NoOperacion`) → Co.Cta.Ig/Eg (`#CoBancoOrigen`,
 * typeahead) → al elegir la cuenta aparece "Co. Cuenta" = subcuenta (`#CoCuentaOrigen`, typeahead) →
 * Importe (`#Importe`) → Aceptar. Espera a que el valor aparezca en `#grid_valores_id`.
 */
export async function agregarValorCobranza(page: Page, valor: ValorACargar) {
  await irASeccion(page, 'Detalle de Valores');
  const cantidad = async () => (await jqx<any[]>(grillaValores(page), 'getrows')).length;
  const antes = await cantidad();
  await page.locator('[ng-click="add_item_valores()"]:visible').click();
  const modal = page.locator('.modal-dialog:visible', { hasText: 'Detalle de Valor' }).last();
  await expect(modal).toBeVisible();

  await elegirUiSelect(page, modal.locator('#CoOperacion'), valor.operacion);
  await modal.locator('#NoOperacion').fill(valor.noOperacion);
  await seleccionarTypeahead(page, modal.locator('#CoBancoOrigen'), valor.cuenta, new RegExp(`^\\s*\\(${valor.cuenta}\\)`));
  const subCuenta = modal.locator('#CoCuentaOrigen');
  await expect(subCuenta).toBeVisible();
  await seleccionarTypeahead(page, subCuenta, valor.subCuenta, new RegExp(`^\\s*\\(${valor.subCuenta}\\)\\s`));
  const importe = modal.locator('#Importe');
  await importe.fill(valor.importe);
  await importe.press('Tab');
  await modal.getByRole('button', { name: 'Aceptar' }).click();
  await expect(modal).toBeHidden({ timeout: 15_000 });
  await expect.poll(cantidad).toBe(antes + 1);
}

/** Valores de la grilla `#grid_valores_id` (descripciones, porque en Consultar no vienen los códigos). */
export async function leerValoresCobranza(page: Page): Promise<ValorCobranza[]> {
  return (await jqx<any[]>(grillaValores(page), 'getrows')).map((r) => ({
    operacion: r.CoOperacionDesc,
    noOperacion: r.NoOperacion,
    cuenta: r.CtaOrigenDesc,
    subCuenta: r.SubCtaOrigenDesc,
    importe: r.ImporteTotalPesos ?? r.Importe,
  }));
}

/** Datos de la cobranza en la grilla del explorador (Total, liquidado en comprobantes y pagado en valores). */
export async function filaCobranzaEnGrilla(page: Page, nro: number) {
  // Solo la grilla del explorador (columna "No. Liquidación" y filas con TotalPesos): las grillas del
  // formulario de la cobranza también tienen un campo NoAplicacion
  return page.evaluate((n) => {
    for (const g of Array.from(document.querySelectorAll<HTMLElement>('.jqx-grid'))) {
      if (!g.offsetParent || !g.innerText.includes('No. Liquidación')) continue;
      let filas: any[] = [];
      try {
        filas = ((window as any).$(g).jqxGrid('getrows') ?? []) as any[];
      } catch {
        continue;
      }
      const r = filas.find((x) => Number(x.NoAplicacion) === n && x.TotalPesos !== undefined);
      if (r) return { coCliente: r.CoCliente, cliente: r.Cliente, total: r.TotalPesos, liquidado: r.LiqPesos, pagado: r.PagPesos, anulado: r.Anulado };
    }
    return null;
  }, nro);
}

/** Cabecera de la cobranza consultada: breadcrumb "Financiera / Cobranzas / No. Liquidación: 101". */
export const cabeceraCobranza = (nro: number) => new RegExp(`No\\. Liquidación:\\s*${nro}\\b`);
