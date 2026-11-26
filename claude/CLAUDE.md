# Automatización E2E — sistema de gestión IG Global

Proyecto de tests E2E con Playwright + TypeScript. Tests en `tests/`, helpers en `utils/`.
Ejecutar: `npx playwright test`.

## Entorno
- URL base: http://sandbox.igglobal.net/Home/Index#/home
- Usuario: `supervisor@global.com.ar` / Password: `supervisor` (entorno sandbox).
- Login: campo **Alias** → botón **Siguiente** → campo **Contraseña** → botón **Ingresar**.

## Reglas de navegación
- Usar siempre el buscador **`#searchlight`** de la barra superior: escribir el nombre del módulo
  y hacer **doble clic** en el resultado. No navegar por menús.
- **Popups:** después de abrir un módulo o presionar `+`, verificar siempre si aparece el botón
  **"Continuar"** usando `clickIfVisible` de `utils/playwrightHelpers.ts`.
- **Carga de artículos:** seleccionar el artículo del desplegable, avanzar por los campos con `Tab`
  (Cantidad, Bultos, Precio Unitario…) y confirmar con `Enter`.

## Datos por defecto (sandbox)
- **Cliente:** código `59`. Seleccionar siempre por código (`(59)` en el desplegable), nunca por
  nombre: el nombre cambia con los datos del sandbox (hoy es "MAC TRAVEL SRL").
- **Artículos por defecto** (`ARTICULOS_POR_DEFECTO`), dos líneas:
  1. `(1002) Artículo` (búsqueda por código `1002`) → **3** unidades a Precio Unitario **3500**.
  2. **`CAJA DE CARTON CORRUGADO PARA 2 EQUIPOS`** (búsqueda por descripción) → **5** unidades a
     **precio de lista** (no se escribe precio; el helper exige que el sistema lo complete con un valor > 0).
  (`(21105) TRIGO (R) MOJADO` ya no existe.)
- **Descuento del cliente `59`:** la ficha del cliente tiene un descuento configurado (hoy 10 %:
  con (1002) x 3 → Bruto 10,500.00, `DESCUENTO / RECARGO` -1,050.00, Neto 9,450.00). Se aplica solo
  en Totales al elegir el cliente. Los tests exigen `DESCUENTO / RECARGO` ≠ 0.00 en Pedido, Remito y
  Factura (pre, Consultar y sidebar) y que Remito y Factura mantengan el Bruto/Descuento/Neto del Pedido.
  No hardcodear el importe ni el porcentaje.
- Para buscar un artículo por descripción el typeahead (`#CoArticulo`, request `id=ST-10&like=…`)
  busca también en la descripción; si no aparece, verificar que el artículo exista y esté activo para ventas.

## Helpers compartidos
- **Carga de artículos:** `cargarClienteYArticulos(page, articulos = ARTICULOS_POR_DEFECTO)` recibe un
  array `ArticuloACargar[]` = `{ busqueda, opcion?, cantidad, precio? }` (1 o N líneas) y por cada uno
  llama a `cargarArticulo` ("+", artículo, Tab Cantidad/Bultos/Precio, Enter). Sin `precio` → precio de lista.
  Algunos artículos agregan campos intermedios en el modal "Detalle" (la caja `CJ-LOEN-001` muestra
  **"Ruta"** entre Artículo y Cantidad): por eso se tabula hasta cada campo (`tabularHasta`) en vez de
  asumir un orden fijo de Tabs.
- `utils/igglobal.ts`: login, `abrirPedidos`, `nuevoComprobante`, `cargarClienteYArticulos`,
  `irASeccion`, `leerImputacion`, `leerTotales`, `guardarComprobante`, `consultarUltimoComprobante`,
  `consultarPorNumero`; Convertir: `convertirComprobante`, `filaEnExplorador`, `esperarEnExplorador`, `solapasImputaciones`.
  Usarlos en los tests nuevos en lugar de duplicar selectores.
- Compras: `abrirExploradorCompras`, `seleccionarProveedor`/`seleccionarCuenta`, `cargarArticulos`,
  `comprobanteFicticio`, `cargarComprobanteProveedor`, `agregarPercepcionCompra`, `cargarPercepcionesTotales`,
  `leerTotalesOtros`, `leerPercepcionesConsulta` (ver "Circuito de Compras").
- Circuito: `abrirExplorador`, `seleccionarCliente`, `invocarPendiente`, `leerDetalle`,
  `generarRemito`, `accionMas`, `leerSidebarDetalles`, `volverAlExplorador`, `capturarImportes` (Contables, Conceptos, Provincias,
  Percepciones opcional y Totales).
- Imputaciones: solapas `Contables / Conceptos / Provincias / Internos` (`.nav-tabs > li`); el panel
  de cada una es el `href` del tab (`#taba-2` Conceptos, `#taba-3` Provincias) y el total está en
  `.ibox-title h5` ("Total Imputado $…").
- **Las imputaciones (Contables, Conceptos y Provincias) las determina la parametrización de la
  cuenta del cliente**, no el artículo. Con la cuenta `59` del sandbox es normal que **Contables**
  quede con "Total Imputado $0.00" y todo el neto como "Pendiente a Imputar" (también en la factura
  generada), por la parametrización actual de esa cuenta. Si se prueba con otro cliente o se
  parametriza la cuenta `59`, los valores van a reflejar esa configuración: por eso los tests no
  hardcodean imputaciones y solo comparan pre vs. post.
- Totales: cada monto es un `.form-group` con `label` + `p.form-control-static` (GRAV, IVA, PERC.,
  TOTAL BRUTO, DESCUENTO / RECARGO, TOTAL NETO, IMPORTE $).
- No hardcodear importes: las percepciones dependen de la configuración del sandbox y cambian.

## Circuito Pedido → Remito → Factura
- **Cada ejecución arma el circuito completo desde cero:** crea un Pedido nuevo, un Remito desde ese
  pedido y una Factura desde ese remito. Nunca reutilizar comprobantes de corridas anteriores.
- **Searchlight:** "Remitos" y "Facturas" existen en Ventas y en Compras → filtrar por la categoría
  `Ventas` (`abrirModulo(..., categoria = 'Ventas')`).
- **Pendientes:** botón `button[ng-click="pendientes()"]` (al lado del disquete) → modal "Selección de
  Registros". Se filtra por número en el cuadro de texto, la fila es `tr[data-key="<PREFIJO>-<nro>-<cliente>"]`
  (`PDVT` pedido de venta, `RTVT` remito de venta), se tilda `.jqx-tree-grid-checkbox` y Aceptar.
  Luego aparece "Procesando comprobantes pendientes..." y el detalle se completa en segundo plano.
- **Detalle por campo:** `$('#grid_comprobante_detalles').jqxGrid('getrows')` → `CoArticulo`,
  `CantidadOriginal`, `PrecioUnitarioDigitado`, `Total`, `NoPedido`, `NoRemito` (`leerDetalle`).
- **Regla del Remito:** para que un Remito aparezca como pendiente en Facturas **debe estar GENERADO**:
  explorador de Remitos → seleccionar la fila → `Más` (`#s2_explorer_more`) → **Generar** → Aceptar.
  Asigna numeración fiscal `R-XXXX-XXXXXXXX` y hace el movimiento de stock (`generarRemito`).
  El pendiente aparece con demora y un formulario de factura ya abierto no refresca la lista:
  si no está, descartar la factura y abrir una nueva.
- **Regla de la Factura:** debe quedar **GENERADA** para impactar en la cuenta corriente. Al guardar
  aparece el modal "Generar Comprobante" (Factura Electrónica / CAE) → Aceptar, y luego el cartel
  "Generación de comprobante fiscal exitosa" con la numeración `A-XXXX-XXXXXXXX` → Aceptar
  (`guardarComprobante` acepta ambos y devuelve los mensajes).
- Secciones de la Factura: Datos Básicos, Cliente, Imputaciones, **Percepciones** (grilla por provincia:
  alícuota, monto, sujeto → `leerPercepciones`), Valores, Totales. "Totales Otros" está oculta.
- **Sidebar "Más > Ver Detalles"** (Pedidos y Ventas Facturas; `leerSidebarDetalles(page, nro)`):
  seleccionar la fila → `#s2_explorer_more` → "Ver Detalles" (`accionMas`). Abre el panel lateral
  `#showComprobanteDetallesRightSidebar` con botones de solapa `[ng-click="changeSection('detalle'|'imputaciones'|'totales')"]`.
  Cabecera de cada solapa: `.ibox-title small` = "Pedidos: 260 - <cliente>" / "Facturas: 335 - … - A-0010-…".
  - Imputaciones (`[ng-show="showImputacionesSection"]`): un `uib-accordion[ng-show="imputaciones.<contables|conceptos|provincias>.length > 0"]`
    por tipo (oculto si no hay filas: con la cuenta `59` Contables no aparece), importe en `.panel-heading span[title="Importe"]`.
  - Totales (`[ng-show="showTotalesSection"]`): resumen en `ul.stat-list` ("Total: ARS X", "Neto", "Impuestos")
    y los mismos `.form-group` label + `p.form-control-static` que el formulario, salvo que dice
    **"IMPORTE ARS"** en lugar de "IMPORTE $" (el helper lo normaliza).
  - Cerrar: `a[ng-click="closeRightSideBar('showComprobanteDetallesRightSidebar')"]` (la X).
- Clic izquierdo sobre el número de comprobante en la grilla abre el PDF ("Ver"): para seleccionar
  una fila hacer clic en la primera celda (checkbox).
- La cuenta permite **una sola sesión**: loguearse en otro navegador cierra la sesión del test.
  Por eso `playwright.config.ts` usa **`workers: 1` y `fullyParallel: false`**: las pruebas corren
  en secuencia. No subir los workers ni usar `test.describe.parallel` / `--workers=N`, y no usar el
  usuario `supervisor` (MCP u otro navegador) mientras corre la suite.

## Etapa 4: Comprobantes de Ventas (solo importes)
- Módulo **Ventas › Comprobantes** (Searchlight "Comprobantes", categoría `Ventas`; `abrirComprobantes`).
  No tiene líneas de artículos: maneja la factura por importes. URL `#/10/1600/explorer`.
- **Grilla:** columnas Estado, No. Operación, Fecha, Operación, Cliente, …, **No. Comprobante Fiscal**.
  No tiene `span.explorer-grid-clickable-cell`: la fila se ubica por texto de la numeración fiscal
  (`filaComprobante`). Datos jqx `getrows`: `LetraLugarNumero`, `CoCliente`, `NoOperacion`,
  `_state_text` (estado), `PorcentajeDescuento`, `ImporteOriginal_Base`, `Monto1..4`, `Impuesto1..6`.
- **Búsqueda por Letra-Lugar-Número + cliente** (`buscarComprobante(page, 'A-0010-00000064')`):
  el buscador `#s2_explorer_search` filtra por No. Comprobante = parte numérica de la numeración
  fiscal (`64`); la fila se confirma con `LetraLugarNumero` exacto y `CoCliente === 59`.
  El filtro (embudo) solo tiene rangos (Fecha, Clientes, No. Comprobante…), sin Letra/Lugar.
- **Editar / estado:** `#s2_explorer_edit` tiene `ng-disabled="getSelectedRowCount() != 1 ||
  !checkActualStateCanEdit()"`: lo decide el **estado** del comprobante. Hoy la factura recién
  generada queda en estado **"Pendiente"** (sin cobrar) y **Editar está deshabilitado**; menú
  contextual = solo "Consultar"; "Más" = Notas, Etiquetar, Ver Detalles, Eliminar.
  `intentarEditarComprobante` informa `{ permitido, mensaje }`: si Editar está deshabilitado o el
  sistema muestra un aviso (p. ej. pagado), lo registra sin romper el test y sigue por Consultar;
  si llega a abrir la edición, sale sin grabar. **Nunca usar Eliminar.**
- **Consultar** (`#s2_explorer_details`, `consultarComprobante`): cabecera "FACTURA | A-0010-00000064".
  Secciones: Datos Básicos, Cliente, Imputaciones, Percepciones.
  - Datos Básicos › bloque **Totales** `#_tasas_impuestos_totales` (`leerTotalesComprobante`): inputs
    `#Monto1..4` / `#Impuesto1..4,6` (valor sin separador de miles, p. ej. `126980.00`), PERC. IIBB
    como texto, y `h5` "TOTAL BRUTO:", "DESCUENTO/RECARGO:", "TOTAL NETO:", "TOTAL $:" con el valor
    en el div siguiente. El helper normaliza a las claves/formato de Facturas (`DESCUENTO / RECARGO`,
    `IMPORTE $`, `126,980.00`). "Total a Discriminar" (= GRAV + IVA) es propio de este módulo.
  - **Recálculo en pantalla (Consultar):** el foco inicial queda en `#TotalDiscriminar` (`autofocus`,
    `ng-blur="onTotalDiscriminarChange()"`). Al primer clic que lo saca de foco, la pantalla recalcula
    GRAV/IVA/Bruto/Descuento/Neto/Total desde ese total (126,980.00 → 124,776.21; Total $ 149,709.42 →
    147,309.49). No se graba, pero **los Totales se leen apenas abre** el formulario (`leerTotalesComprobante`
    no navega si Datos Básicos ya está visible). El test registra los valores recalculados como
    observación (`totalesTrasRecalculo`).
  - Imputaciones: mismas solapas `#taba-1..3` (`leerImputacionesComprobante`). Total Imputado e importes
    deben coincidir con la factura. **"Pendiente a Imputar"** se ve sobre los importes recalculados
    (Contables 112,298.59 en vez de 114,282.00; Conceptos/Provincias -1,983.41): se informa, no se exige.
  - La grilla de Percepciones de este módulo usa `Importe` = monto percibido (en Facturas `Importe` es
    el sujeto): se valida PERC. IIBB desde Totales.
- **Sidebar Más › Ver Detalles** (`leerSidebarComprobante`): id **`#showFacturasDebitosCreditosDetallesRightSidebar`**
  (no `showComprobanteDetallesRightSidebar`), abre en Totales, cabecera
  "Comprobantes: MAC TRAVEL SRL - FACTURA - A-0010-00000064", resumen "Total: $ …". Misma estructura
  interna (secciones, acordeones, `.form-group`) que el de Pedidos/Facturas.
- Validaciones: Datos Básicos = Factura (Consultar) = Sidebar en todos los Totales; descuento ≠ 0.00;
  imputaciones (Total Imputado e importes) = Factura y Sidebar = Datos Básicos. Los datos van al
  `resumen.json` (`comprobante`) y al correo.

## Etapa 5: Cobranzas (Financiera › Cobranzas)
- Searchlight "Cobranzas" en la categoría **`Financiera`** (`abrirCobranzas` = `abrirExplorador(page,
  'Cobranzas', 'Financiera')`). URL `#/30/30030/explorer`. Grilla con columna **"No. Liquidación"** (celda
  clickeable = `NoAplicacion`); jqx: `CoCliente`, `TotalPesos`, `LiqPesos` (comprobantes), `PagPesos` (valores).
- Nueva: botón `button[ng-click="add()"]` ("Agregar"; `nuevaCobranza`). Secciones: **Datos Básicos**,
  **Comprobantes**, **Detalle de Valores**. En Datos Básicos solo se elige la cuenta (`#CoCuenta`, `(59)`).
- **Comprobantes** (`seleccionarComprobanteCobranza`): grilla de deudas del cliente (**el id es incremental**: `jqxGrid1` solo si es la primera grilla de la sesión → se ubica la `.jqx-grid` visible con la columna "Deuda ARS")
  (`LetraLugarNumero`, `DeudaPesos`, `ImporteOriginalPesos`, `ImporteAplicacionPesos` = "Importe Aplicar en ARS").
  Se ubica la fila por la numeración fiscal (`ensurerowvisible`) y se tilda con clic en la primera celda:
  "Importe Aplicar" toma el total de la deuda. Aparece la etiqueta **"Saldo: X"** (`.ibox-title span.label`)
  en Comprobantes y en Valores; **se oculta cuando el saldo es 0** (`leerSaldoCobranza` devuelve `0.00`).
- **Valores** (`agregarValorCobranza`): "+" `[ng-click="add_item_valores()"]` (tooltip "Agregar") → modal
  **"Detalle de Valor"**: Tipo `#CoOperacion` (ui-select; abre con el foco en la búsqueda → `53`
  TRANSFERENCIA/COMPENSACION PESOS), `#NoOperacion`, **Co.Cta.Ig/Eg** `#CoBancoOrigen` (typeahead, `1000`
  ICBC) → recién entonces aparece **"Co. Cuenta" = subcuenta** `#CoCuentaOrigen` (typeahead: `(1)` Cuenta
  Corriente Pesos, `(2)` Caja de Ahorros Pesos, `(3)` Caja de Ahorros Dólares), `#Importe` (no se precarga
  con el saldo) → Aceptar. Grilla `#grid_valores_id`.
- El test carga 2 valores (53 / cuenta 1000 / subcuentas 1 y 2, No. Operación aleatorio de 6 dígitos) que
  suman exactamente el total (el segundo absorbe el centavo impar).
- **Volver al explorador:** el formulario de la cobranza también tiene una columna "No. Liquidación", así que `volverAlExplorador` confirma el explorador por el breadcrumb "(N Registros)" (`marcaExplorador`), que el formulario no muestra.
- Guardar = `#s2_form_save` (vuelve a la grilla). **Consultar**: cabecera en el breadcrumb
  "No. Liquidación: <nro>" (`cabeceraCobranza` para `consultarUltimoComprobante`). Las grillas se cargan
  al abrir cada sección; en Consultar los valores traen **descripciones, no códigos**
  (`CoOperacionDesc`, `CtaOrigenDesc`, `SubCtaOrigenDesc`, `ImporteTotalPesos`) → `leerValoresCobranza`
  normaliza a descripciones; la deuda del comprobante aplicado queda en 0.
- Validaciones (cada diferencia se registra en `cobranza.diferencias` y va al informe): Importe a aplicar =
  Total factura = Total en Comprobantes = Total del Pedido; deuda = total; 2 valores; suma valores = importe
  a aplicar; saldo final 0; en Consultar: el comprobante aplicado con el mismo importe, mismos valores
  (No. Operación / subcuenta / importe) y total; grilla: Total = factura y liquidado = pagado.
- Cada corrida **cancela la factura del circuito** con esa cobranza (en el sandbox quedan cobradas).

## Circuito Ventas (Convertir): Pedido → Remito → Factura sin Pendientes
Spec `tests/circuito-ventas-convertir.spec.ts`. Mismo cliente `59`, mismos artículos y descuento que el circuito por
Pendientes, pero Remito y Factura se generan con **Más › Convertir a …** desde la grilla. Cada corrida arma todo desde cero.
- **⚠️ Consultar bloquea Convertir (sandbox 25/11/2026):** abrir un comprobante con **Consultar** lo deja "en uso" de forma
  persistente (también desde otra sesión y después de Volver) y "Convertir a …" responde `.toast-error` "No se pudo procesar la
  conversión. Comprobante en uso o en estado Inactivo o con cantidades originales distintas a las cantidades pendientes."
  **Consultar el Pedido de origen bloquea además la conversión del Remito derivado.** "Más › Ver Detalles" (sidebar) NO bloquea.
  Pedidos/Remitos que quedaron así (299, 300, 301 y remito 119) ya no se pueden convertir. Por eso el orden del spec es:
  Pedido Precarga → grabar (`nuevoNumeroEnGrilla`, sin abrirlo) → Sidebar → Convertir a Remito → Remitos: fila + Sidebar →
  Convertir a Factura → **recién ahí** Consultar Pedido, Consultar Remito y Factura (Consultar + Percepciones + Sidebar).
  Las validaciones son las mismas; se informa como observación en la etapa Remito.
- **Etapa 1 Pedido:** Precarga (antes de grabar), Sidebar y (después de las conversiones) Consultar; Imputaciones de **todas
  las solapas** (`capturarImportes(page, { todasLasSolapas: true })` → `otrasImputaciones`, p. ej. "Internos" `#taba-7`) y Totales.
- **Convertir** (`convertirComprobante(page, nro, 'Remito' | 'Factura')`): seleccionar la fila → `#s2_explorer_more` →
  "Convertir a Remito" (Pedidos, `convertirARemito()` / CONVERTTORT) o "Convertir a Factura" (Remitos, `convertirAFactura()` /
  CONVERTTOFC). En Pedidos también existen "Convertir a Factura" y "Convertir a Orden de Despacho" (no se usan).
  **El menú contextual (clic derecho) solo tiene Editar / Consultar**: la conversión está únicamente en "Más". No pide confirmación:
  toast `.toast-wait` "Convirtiendo 1 Comprobantes" → `.toast.toast-success` "Comprobante N°<origen> convertido con éxito" con
  `.toast-message` "Remito N°116." / "Facturas N°362." (dura ~5 s; de ahí sale el número generado). Error → `.toast-error`.
- **Remito convertido:** nace en estado "Pendiente" **ya con numeración fiscal** `R-0001-…` (no hace falta "Generar"; si algún
  día no la trae, el spec ejecuta `generarRemito` y lo informa como observación). Remitos de Venta: `esperarEnExplorador`
  (refresca hasta ver la fila; jqx `NoComprobante`, `LetraLugarNumero`, `Total_Base`, `_state_text`) → `consultarPorNumero`
  (clic derecho → Consultar sobre un número dado) → Imputaciones/Totales/Detalle (`NoPedido`) → Sidebar `Más › Ver Detalles`.
- **Factura convertida:** queda **GENERADA**: al convertir aparece el sweet-alert "Generación de comprobante fiscal exitosa …
  Numeración Fiscal: A-0010-00000088" → Aceptar (`button.confirm`; el helper devuelve la numeración). En la grilla de Facturas
  `NoComprobanteRemito` = numeración del remito de origen. Detalle con `NoPedido` y `NoRemito`.
- **Percepciones (solo Factura):** grilla `PIBAlicuota` / `Monto` (percibido) / `Importe` (sujeto = Total Neto). Se exige
  suma de `Monto` = **PERC. IIBB** de Totales = PERC. IIBB del Sidebar, y `alícuota × sujeto = monto`. Hoy CABA 5 %.
  Observación vigente (25/11/2026): **PERC. IVA muestra el mismo importe que PERC. IIBB** (5,714.10) ya desde el Pedido y ambos
  suman al IMPORTE $; se informa como observación (parametrización), no como falla.
- Corrida OK de referencia (25/11/2026, 4.8 min): Pedido 305 → Remito 120 `R-0001-00000083` → Factura 365 `A-0010-00000091`
  (Neto 114,282.00, Total 149,709.42, Perc. IIBB CABA 5 % 5,714.10) → Cobranza 112 (2 × 74,854.71, estado "Cobrado").
- Comparación con el origen (`compararConOrigen`): GRAV/IVA/Bruto/Descuento/Neto iguales al Pedido/Remito = FALLA si difieren;
  `PERC.*` / `IMPORTE $` distintos se informan como observación. Etapas 4 (Comprobantes) y 5 (Cobranza, 2 valores 53/1000/1-2,
  segundo valor = Total − Valor 1) iguales al circuito por Pendientes, sobre la factura convertida.
- Resumen: claves `pedido`, `remito`, `factura`, `comprobante`, `cobranza`; Remito/Factura llevan `conversion` (`desde`,
  `origen`, `mensajes`), `diferencias`, `observaciones` y la Factura `percepcionesIIBB` → adaptador `etapaConvertida` en
  `informeHtml.ts` (filas "Remitos (Convertir)" / "Facturas (Convertir)"; Pre-grabado = conversión igual al origen). Asunto
  `Global - Circuito Ventas ✅` / `❌`.

## Circuito de Compras: Orden de Compra → Remito → Factura
Spec `tests/circuito-orden-remito-factura-compra.spec.ts` (primera etapa, sin pagos). Cada corrida arma
el circuito desde cero; Remito y Factura se invocan desde Pendientes.
- **Searchlight categoría `Compras`** (`abrirExploradorCompras(page, 'Ordenes de Compra' | 'Remitos' | 'Facturas')`).
  URLs `#/60/1550` (OC), `#/60/9609` (Remitos), `#/60/9610` (Facturas). La grilla filtra por fecha "Hoy":
  sin comprobantes del día aparece vacía. "+" = `button[ng-click="add()"]` (sin texto; `nuevoComprobante` lo contempla).
- **Proveedor `10` (ALBERTO VIDAL)**: `PROVEEDOR_CODIGO`, `seleccionarProveedor` (= `seleccionarCuenta(page, '10')`,
  mismo typeahead `#CoCuenta`, búsqueda `PR-2`). Elegir siempre por código.
- **Artículos y monto de la OC (> $ 869,000.00)**: el `(1002)` de Ventas no está habilitado para compras →
  `(1003) Frasco Vidrio 500ml` x 4 + caja `CJ-LOEN-001` x 5 a precio de lista (el sistema propone el último precio
  de compra). `articulosCompraAleatorios(MONTO_MINIMO_OC)` genera **en cada corrida un precio unitario aleatorio con
  2 decimales** para el (1003) (entre 869,000/4 + 0.01 y + 5,000) → el Total Neto de la OC supera **$ 869,000.00**
  (el test lo exige en Pre-grabado). Con ese monto Pagos calcula retenciones reales: el test exige **Ret. IIBB > 0 y
  Ret. Ganancias > 0** (si el ERP no las calcula queda en rojo). Mismo modal "Detalle" que Pedidos: `cargarArticulos` + `tabularHasta`.
- **Pendientes**: prefijos `OCCP` (orden de compra) y `RTCP` (remito de compra) en `tr[data-key="<PREFIJO>-<nro>-10"]`.
  En el detalle, la OC de origen viaja en **`NoDespacho`** (no en `NoPedido`) y el remito en `NoRemito`.
  El Remito de compra **no se "Genera"** (no hay "Generar" en Más): aparece pendiente en Facturas al grabarlo.
- **Letra-Lugar-Número ficticio + `NoOperacion`** (Remito y Factura, Datos Básicos): `#LetraLugarNumero`
  (máx. 20, `ng-blur=validarCAI`) y `#NoOperacion` (1..999999, obligatorio). `comprobanteFicticio('R' | 'A', desplazamiento)`
  genera por corrida un No. Operación de 6 dígitos y `<letra>-0003-000NNNNN` con sus últimos 5 dígitos
  (p. ej. Op. 480408 → `R-0003-00080408`); `cargarComprobanteProveedor` los carga. Consultar muestra
  "Remito | R-0003-…" / "FACTURA | A-0003-…" (el spec lo pasa como cabecera a `consultarUltimoComprobante`).
- **Imputaciones**: en Compras se exigen **Contables** (116120 INSUMOS) y **Provincias** (1 CABA) por el neto.
  **Conceptos** queda en 0 antes de grabar la factura y aparece al grabarla ("Concepto de Ventas Genérico"):
  se informa como observación, no se exige.
- **Factura de compra**: secciones Datos Básicos, Proveedor, Imputaciones, Percepciones, Totales, Totales Otros;
  "Co. Comprobante" propone `(11) FACTURA`.
  - **Percepciones**: "+" `[ng-click="percepciones.add()"]` → modal con `#CoProvincia` (ui-select "(N) Provincia",
    `elegirUiSelect`) e `#Importe` (`agregarPercepcionCompra`). Grilla: `CoProvinciaDesc`, `Alicuota`, **`Importe` =
    monto percibido**, `Sujeto` (al revés que en Ventas; `leerPercepciones` normaliza a `monto`). El test carga 2
    provincias distintas al azar con importes aleatorios de 2 decimales; PERC. IIBB = suma.
  - **PERC. IVA / PERC. GAN.**: en "Totales" son solo lectura (`p.form-control-static`). Se cargan en
    **"Totales Otros"** (directiva `tasas-impuestos-totales`, `#Impuesto4` = PERC. IVA, `#Impuesto6` = PERC. GAN.,
    `cargarPercepcionesTotales`), sección que solo se muestra con `PriorizaTotalesOtros` (se activa al agregar
    percepciones) o el switch "Detalle Otros" (parámetro `FU50082`). Con eso la factura graba los importes de
    Totales Otros (`leerTotalesOtros`): son los "totales efectivos" que el test compara (Pre-grabado, Consultar, Sidebar).
    La sección "Totales" no se actualiza con Totales Otros (IMPORTE $ queda sin PERC. IVA/GAN.): se informa.
- **Sidebar Más › Ver Detalles**: mismo `#showComprobanteDetallesRightSidebar` en los 3 módulos; cabeceras
  "Ordenes de Compra: 41 - ALBERTO VIDAL", "Remitos: 25 - 0 - - ALBERTO VIDAL - R-0003-…", "Facturas: 31 - … - A-0003-…".
  El de OC agrega AJUSTE IMPUESTOS, AJUSTE DIFERENCIA DIVISA e **IMPORTE Divisa** (no se confunde con "IMPORTE ARS";
  el spec los separa en `sidebarExtras`). No tiene solapa de Percepciones: se valida PERC. IIBB de Totales.
- **Defecto conocido del sandbox (25/11/2026)**: en **Consultar** de la Factura de compra la grilla de Percepciones
  vuelve vacía (`percepciones.data = []`, request `Directives/ComprobantesPercepciones`) y Totales Otros muestra
  PERC. IIBB 0.00, mientras el Sidebar y la grilla muestran el total con percepciones. El test lo marca como falla
  (Consultar ≠ Pre-grabado) — no ocultarlo. **Regla:** mientras persista, el spec queda en ROJO y el informe
  muestra en "Fallas" la alerta `⚠️ PÉRDIDA DE DATOS EN CONSULTAR` (percepciones no recuperadas) y
  `⚠️ TOTAL DISTINTO EN CONSULTAR` (`alertaPerdidaConsultar` en `informeHtml.ts`). No usar `test.fail`, `test.skip`
  ni bajar la diferencia a observación; se retira solo cuando Consultar devuelva las percepciones grabadas.
- **Etapa 4: Comprobantes de Compra** (Searchlight "Comprobantes", categoría `Compras`; `abrirComprobantesCompra`,
  URL `#/60/1580`). Grilla: Estado, No. Operación, Fecha, Operación, Proveedor, Condición de Cobranza, Importe Original ARS,
  No. Comprobante Fiscal. jqx: `LetraLugarNumero`, `CoProveedor`, `Proveedor`, `NoOperacion`, `_state_text`
  ("Pendiente de Pago"), `ImporteOriginal_Base`, `Monto1..4`, `Impuesto1..6` (**4 = PERC. IVA, 5 = PERC. IIBB, 6 = PERC. GAN.**).
  - **Búsqueda:** `#s2_explorer_search` (`search_like`) **no encuentra por número** (ni No. Operación ni Letra-Lugar-Número):
    solo por texto. `buscarComprobanteCompra(page, lln)` busca "ALBERTO VIDAL" y confirma la fila por `LetraLugarNumero` +
    `CoProveedor === 10` (`ensurerowvisible`). La grilla muestra solo comprobantes del día.
  - **Editar habilitado** en "Pendiente de Pago" (en Ventas "Pendiente" está bloqueado), sin avisos; menú contextual
    Editar/Consultar, Más = Notas, Etiquetar, Ver Detalles, Eliminar (**nunca Eliminar**). `intentarEditarComprobante(page, fila,
    lln, leer)` lee Totales y Percepciones dentro de la edición y sale con Volver **sin grabar** (no pide confirmación).
  - Formulario (Editar/Consultar): cabecera "FACTURA | A-0003-…", secciones Datos Básicos, Proveedor, Imputaciones, Percepciones.
    Totales en Datos Básicos = `#_tasas_impuestos_totales` (mismo bloque que Comprobantes de Ventas y Totales Otros:
    `leerTotalesComprobante`), foco inicial en `#TotalDiscriminar`; hoy no recalcula al salir. Percepciones: grilla del ibox
    "Percepciones" con `CoProvinciaDesc` / `Importe` (= monto; la columna se titula "Sujeto") → `leerPercepcionesComprobante`.
  - **Acá SÍ aparecen las percepciones grabadas** y PERC. IIBB/Total correctos: confirma que el dato está grabado y que la
    pérdida es de la vista Consultar de Facturas de compra.
  - Sidebar: `#showFacturasDebitosCreditosDetallesRightSidebar` (`leerSidebarComprobante`), cabecera
    "Comprobantes: ALBERTO VIDAL - FACTURA - A-0003-…", resumen "Total: $ …"; imputaciones Contables/Conceptos/Provincias
    (Conceptos = "Concepto de Compras Genérico"; Facturas › Consultar muestra "Concepto de Ventas Genérico").
  - Validaciones (`comprobanteCompra` en el resumen): referencia = **factura grabada** (Pre-grabado con Totales Otros = su
    Sidebar), no la vista Consultar de Facturas. Grilla (proveedor, No. Operación, importe, Impuesto1/4/5/6), Editar, Consultar
    (Totales, Percepciones, Contables/Provincias) y Sidebar (= Consultar y = Sidebar de Facturas). Toda diferencia es FALLA;
    si faltan percepciones el informe muestra `⚠️ PÉRDIDA DE DATOS EN COMPROBANTES`. Lo que Comprobantes recupera frente a
    Facturas › Consultar se informa como observación (el defecto de Facturas sigue en rojo en su etapa).
- **Etapa 5: Pagos** (Searchlight "Pagos", categoría **`Financiera`**; `abrirPagos`, URL `#/30/30040`). Mismo formulario
  y toolbar que Cobranzas: grilla con "No. Liquidación" (`NoAplicacion`/`NoLiquidacion`, `CoProveedor`, `TotalPesos`,
  `LiqPesos`, `PagPesos`, `Retenciones`, `RetencionesIva/Ganancias/IngBru/SSocial/Otros`, estado "Pagado"); no hay Editar.
  Nuevo = `add()` (`nuevoPago`); secciones Datos Básicos (`#CoCuenta` = proveedor `(10)`), Comprobantes, Detalle de Valores.
  Se reutilizan los helpers de Cobranzas: `seleccionarComprobanteCobranza` (grilla "Deuda ARS", tildar → Importe Aplicar =
  deuda), `agregarValorCobranza`, `leerSaldoCobranza`, `leerComprobantesCobranza`, `leerValoresCobranza`,
  `filaCobranzaEnGrilla` (ahora devuelve también `retenciones` y `estado`) y `cabeceraCobranza` ("No. Liquidación: N").
  - **Solapas de Comprobantes**: "Comprobantes (N)" (`#tab-1`) y **"Retenciones (N)"** (`#tab-2`, `retencionesInitBoundData()`;
    herramientas Parámetros / Detalle de Retenciones). Grilla: `LetraLugarNumero`, `AplicadoBase`, `Sujeto`, `Iva` y celdas-botón
    `IvaButton`, `GananciasButton`, `IIBBButton`, `SUSSButton`, `OtrosButton` (`span.explorer-grid-clickable-cell`, title
    "Editar Retenciones"). Clic → modal **"Edición de Retenciones <I.V.A. | Ganancias | Ingresos Brutos | Seguridad Social | Otros>"**
    con grilla (`ImporteSujeto`, `ImporteIva`, `CoConceptoPagoDescripcion`, `Alicuota`, `Importe`) y Cerrar (`ok()`); el primer
    clic a veces solo selecciona la fila (se reintenta). `leerRetencionesPago(page, { detalle: true })`.
  - **Valores**: modal "Detalle de Valor" igual a Cobranzas: Tipo `53`, `#NoOperacion`, `#CoBancoOrigen` `1000` ICBC (la búsqueda
    asíncrona a veces no responde al primer tipeo: `seleccionarTypeahead` reintenta), subcuenta `#CoCuentaOrigen` `(1)` Cuenta
    Corriente Pesos / `(2)` Caja de Ahorros Pesos (aparece con demora), `#Importe`. **Saldo real a pagar = Importe aplicado −
    total de retenciones calculadas** (= "Saldo: X" inicial). El test reparte ese saldo al azar (2 decimales, 30-70 %) entre
    `1000/1` y `1000/2`; el segundo absorbe el resto → saldo 0.00.
  - Validaciones (`pago` en el resumen; `diferencias` con prefijo Pre-grabado / Consultar / Grilla): aplicado = deuda = total
    grabado de la factura = importe en Comprobantes de Compra; Retenciones: Aplicado, Sujeto = Neto, IVA = IVA de la factura y
    detalle de cada modal = celda; saldo inicial = aplicado − retenciones; valores + retenciones = aplicado; saldo final 0;
    Consultar: solo esa factura aplicada con el mismo importe y deuda 0, Retenciones iguales, Valores iguales (No. Operación |
    banco | subcuenta | importe); Grilla: proveedor 10, Total = factura, **Liquidado = aplicado, Pagado = valores y
    Liquidado − Pagado = Retenciones**; `RetencionesIva/Ganancias/IngBru/SSocial/Otros` = solapa. El campo `Retenciones`
    de la grilla **no es un importe** (vale 2 con IVA 693 + IIBB 924): se informa como observación si no coincide con la
    cantidad de retenciones con importe.
  - Las retenciones **varían entre corridas** con el mismo neto (exploración: todas 0.00; corrida 25/11 19:40: IVA 693.00 =
    10 % del IVA, IIBB 924.00 = 5.6 % del sujeto): nunca hardcodearlas; el test toma las que calcula el sistema.
  - En **Consultar** las celdas de Retenciones no son clickeables (sin `span.explorer-grid-clickable-cell`): se validan los
    importes de la grilla y el detalle queda "sin detalle (celda no clickeable)".
  - Cada corrida **cancela la factura de compra del circuito** con ese pago.
- Resumen: claves `ordenCompra`, `remitoCompra`, `facturaCompra`, `comprobanteCompra`, `pago` (forma comercial + `diferencias`, `observaciones`,
  `noOperacion`, `percepcionesCargadas`, `percepcionesTotales`); adaptador `etapaCompra` en `informeHtml.ts`.

## Convenciones de tests
- Nunca hardcodear números de comprobante: tomar el más reciente de la grilla.
- Preferir esperas por estado (`expect(...).toBeVisible()`, `waitFor`) en lugar de `waitForTimeout`.

## Particularidades descubiertas (sandbox)
- El popup "Continuar" ("la opción se está utilizando en otra pestaña") puede aparecer 5-10 s
  después de la acción, incluso en la home. Si aparece durante un clic, la app descarta la
  navegación: reintentar la acción hasta ver el elemento destino (ver `accionConContinuar`
  en `tests/pedidos-alta.spec.ts`).
- En la home también hay un botón `+`: para confirmar que se abrió un explorador, esperar una
  columna de la grilla (p. ej. "No. Comprobante"), no el `+`.
- La app hace polling constante: no usar `waitForLoadState('networkidle')`.
- Typeaheads (cliente, artículo): escribir con `pressSequentially` y elegir en `ul[role=listbox] li`.
- Menú contextual de la grilla (jqx): el clic va sobre el `<a>` interno (`#s2_menu_context_details a`).
- A veces, tras grabar, el encabezado de la grilla queda encima de la primera fila e intercepta el clic
  derecho: `consultarUltimoComprobante` refresca la grilla (`#s2_explorer_refresh`) y reintenta.
- Guardar = `#s2_form_save`. Cabecera de consulta: "Pedido | N°: <nro>" (signo de grado `°`).

## Informe por correo (Nodemailer + Google Workspace)
- Reporter propio `utils/emailReporter.ts`, registrado último en `playwright.config.ts`
  (`['./utils/emailReporter.ts']`, después de `html` para poder adjuntar el reporte). Al terminar
  `npx playwright test`:
  1. escribe `test-results/resumen-ejecucion.json` (estado de cada test + datos del circuito) y
     `test-results/informe-email.html` (cuerpo del correo, sirve de vista previa);
  2. envía el correo HTML a `MAIL_TO`, adjuntando el JSON, el informe HTML y `playwright-report/index.html`.
  Corridas sin tests (p. ej. `npx playwright test --list`) no escriben ni envían nada.
- **Asunto del correo** (`asuntoCorreo(resumen)` en `informeHtml.ts`, usado por `emailReporter.ts` y `npm run reenviar-informe`),
  exactamente uno de: `Global - Circuito Ventas ✅` · `Global - Circuito Ventas ❌` · `Global - Circuito Compras ✅` ·
  `Global - Circuito Compras ❌`. Sin otros textos (ni cantidad de pruebas ni numeración). El circuito de cada test sale de sus
  etapas del resumen o del nombre del spec (`compra` → Compras; el resto, incluidos los specs sueltos de Pedidos → Ventas).
  ✅ solo si **todos** los tests del circuito pasaron y **ninguna etapa tiene fallas** (las alertas en rojo vigentes, como la
  pérdida de percepciones en Consultar de Factura de Compra, dan ❌). Si una corrida incluye ambos circuitos (`npx playwright test`
  completo) se envía un solo correo con los dos asuntos unidos por ` | `. El cuerpo no cambia.
- **Formato ejecutivo** (`utils/informeHtml.ts`, función pura `construirInforme(resumen)`):
  1. Banner con semáforo: `✅ TODO EN VERDE — CIRCUITO OK` / `⚠️ ATENCIÓN — SE DETECTARON FALLAS`,
     fecha/hora (Argentina), duración, pruebas OK/total y etapas OK/total.
  2. Tarjetas de comprobantes: Pedido, Remito + fiscal, Factura + fiscal, Comprobante + estado/edición, importe facturado.
  3. **Matriz por etapa** (una fila por etapa del `resumen.json`): Pre-grabado / Consultar / Sidebar
     (`✅ OK` verde suave, `❌` rojo suave, `—` no aplica), Importes (Bruto/Desc/Neto/IVA/Perc/Total),
     Imputaciones (total imputado Contables/Conceptos/Provincias) y Estado `✅ OK` / `❌ FALLO`.
     Consultar = igual a Pre-grabado; en Comprobantes = Datos Básicos igual a la Factura.
  4. Recuadro **Fallas** (solo si hay; incluye el error del test) y **Observaciones** (p. ej. recálculo en Comprobantes).
  5. **Detalle de errores** (solo si hay discrepancias): por etapa con error, únicamente los conceptos
     de Totales / Imputaciones / Percepciones que no coinciden, con el valor de cada fuente y el
     distinto en rojo. Si todo está OK no hay detalle: el detalle completo de importes queda en los
     adjuntos (`resumen-ejecucion.json`, reporte de Playwright).
- **Varios circuitos en la misma corrida:** el informe combina las etapas de todos los tests con `resumen.json`
  (Ventas y Compras); cada adaptador tiene `circuito: 'ventas' | 'compras'` y las "Etapa no completada" se
  agregan solo para el circuito del test que falló. Compras suma tarjetas OC / Remito / Factura (+ Letra-Lugar-Número
  y No. Operación) e importe grabado con PERC. IIBB / IVA / GAN.
- **Etapas nuevas:** (Cobranzas y Compras ya tienen adaptador propio) el spec las registra con `registrarEtapa('<clave>', datos)`; si
  `datos` tiene la forma comercial (`numero`, `pre`, `post`, `sidebar?`) aparecen solas en la matriz
  (adaptador genérico); con otra forma, agregar un adaptador en `ADAPTADORES` de `informeHtml.ts`.
- El spec del circuito adjunta `resumen.json` **después de cada etapa** (`registrarEtapa`); el reporter
  usa el último adjunto. Si el test se corta, el informe muestra las etapas completadas y marca el resto
  como "Etapa no completada".
- Vista previa sin correr tests: `npm run previsualizar-informe` (rearma `test-results/informe-email.html`
  desde `resumen-ejecucion.json`; `-- --json <ruta> --out <ruta>` para otros archivos).
- Configuración en `.env` (git-ignorado; plantilla en `.env.example`), cargado con `process.loadEnvFile`
  en `playwright.config.ts`: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS`,
  `MAIL_FROM`, `MAIL_TO`. En Google Workspace `SMTP_PASS` es una **contraseña de aplicación**
  (requiere verificación en 2 pasos), no la contraseña de la cuenta. Nunca commitear `.env` ni mostrar `SMTP_PASS`.
- Sin `SMTP_USER`/`SMTP_PASS`/`MAIL_TO` no se envía (se avisa en consola); `EMAIL_REPORT=off` lo desactiva.
  Un error SMTP se informa en consola como `✉️ ERROR al enviar el correo` y no cambia el resultado de los tests.
- Envío compartido en `utils/mailer.ts` (`enviarInforme`). Si el envío falla, **reenviar el informe de la
  última corrida sin volver a ejecutar los tests**: `npm run reenviar-informe` (rearma el informe desde
  `test-results/resumen-ejecucion.json` y lo envía). Error `535-5.7.8 BadCredentials` =
  `SMTP_USER` y la contraseña de aplicación no corresponden (la contraseña de aplicación tiene 16 letras).
