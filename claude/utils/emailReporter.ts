import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { enviarInforme } from './mailer';
import { construirInforme, documentoHtml, type Circuito, type ResultadoTest, type ResumenEjecucion } from './informeHtml';

/**
 * Reporter de Playwright que, al terminar la corrida:
 *  1. escribe `test-results/resumen-ejecucion.json` (estado de cada test + datos de su circuito: Ventas
 *     `pedido`…`cobranza`; Compras `ordenCompra`, `remitoCompra`, `facturaCompra`),
 *  2. arma el informe ejecutivo (`utils/informeHtml.ts`) y lo guarda en `test-results/informe-email.html`,
 *  3. lo envía por correo adjuntando el JSON, el informe HTML y el reporte de Playwright.
 *
 * Configuración por variables de entorno (archivo `.env`, ver `.env.example`):
 *  SMTP_HOST (smtp.gmail.com), SMTP_PORT (465), SMTP_USER, SMTP_PASS (contraseña de aplicación de Google),
 *  MAIL_FROM (por defecto SMTP_USER), MAIL_TO (destinatarios separados por coma).
 * Sin SMTP_USER / SMTP_PASS / MAIL_TO no se envía nada. EMAIL_REPORT=off lo desactiva.
 * Vista previa sin correr tests: `npm run previsualizar-informe`; reenvío: `npm run reenviar-informe`.
 */
class EmailReporter implements Reporter {
  private resultados: ResultadoTest[] = [];
  private inicio = new Date();
  private config!: FullConfig;

  onBegin(config: FullConfig, _suite: Suite) {
    this.config = config;
    this.inicio = new Date();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // El spec adjunta un resumen parcial después de cada etapa: el último es el más completo
    const adjunto = result.attachments.filter((a) => a.name === 'resumen.json').pop();
    let circuito: Circuito | undefined;
    try {
      const cuerpo = adjunto?.body ?? (adjunto?.path ? fs.readFileSync(adjunto.path) : undefined);
      if (cuerpo) circuito = JSON.parse(cuerpo.toString('utf8'));
    } catch {
      /* adjunto ilegible: se informa sin etapas */
    }
    this.resultados.push({
      titulo: test.title,
      archivo: path.basename(test.location.file),
      estado: result.status,
      duracionSeg: Math.round(result.duration / 1000),
      error: result.error?.message?.replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 6).join('\n'),
      circuito,
    });
  }

  async onEnd(result: FullResult) {
    // `--list` (o una corrida sin tests) también llama a onEnd: no pisar el último informe ni enviar correo
    if (!this.resultados.length) return;
    const resumen: ResumenEjecucion = {
      inicio: this.inicio.toISOString(),
      fin: new Date().toISOString(),
      estado: result.status,
      total: this.resultados.length,
      pasaron: this.resultados.filter((r) => r.estado === 'passed').length,
      fallaron: this.resultados.filter((r) => r.estado === 'failed' || r.estado === 'timedOut').length,
      tests: this.resultados,
    };
    const dir = this.config.projects[0]?.outputDir ?? path.resolve('test-results');
    fs.mkdirSync(dir, { recursive: true });
    const jsonPath = path.join(dir, 'resumen-ejecucion.json');
    fs.writeFileSync(jsonPath, JSON.stringify(resumen, null, 2));

    const { asunto, html } = construirInforme(resumen);
    const htmlPath = path.join(dir, 'informe-email.html');
    fs.writeFileSync(htmlPath, documentoHtml(asunto, html));

    if ((process.env.EMAIL_REPORT ?? '').toLowerCase() === 'off') return;
    const adjuntos = [jsonPath, htmlPath];
    const reporteHtml = path.resolve('playwright-report', 'index.html');
    if (fs.existsSync(reporteHtml) && fs.statSync(reporteHtml).size < 15 * 1024 * 1024) adjuntos.push(reporteHtml);
    console.log(`${await enviarInforme(asunto, html, adjuntos)} (informe: ${htmlPath})`);
  }
}

export default EmailReporter;
