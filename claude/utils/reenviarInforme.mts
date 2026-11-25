/**
 * Rearma el informe ejecutivo desde `test-results/resumen-ejecucion.json` sin volver a correr los tests.
 *   npm run previsualizar-informe   → solo escribe test-results/informe-email.html (no envía)
 *   npm run reenviar-informe        → además lo envía por correo (config .env)
 * Opcional: --json <ruta> para usar otro resumen y --out <ruta> para otro HTML de salida.
 */
import fs from 'node:fs';
import path from 'node:path';
import { construirInforme, documentoHtml } from './informeHtml.ts';
import { enviarInforme } from './mailer.ts';

const arg = (nombre: string) => {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const soloHtml = process.argv.includes('--solo-html');
const dir = path.resolve('test-results');
const jsonPath = path.resolve(arg('--json') ?? path.join(dir, 'resumen-ejecucion.json'));
const htmlPath = path.resolve(arg('--out') ?? path.join(dir, 'informe-email.html'));
if (!fs.existsSync(jsonPath)) {
  console.error(`No existe ${jsonPath}: ejecutá primero npx playwright test`);
  process.exit(1);
}

const { asunto, html } = construirInforme(JSON.parse(fs.readFileSync(jsonPath, 'utf8')));
fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
fs.writeFileSync(htmlPath, documentoHtml(asunto, html));
console.log(`Informe: ${htmlPath}\nAsunto: ${asunto}`);
if (soloHtml) process.exit(0);

if (fs.existsSync('.env')) process.loadEnvFile('.env');
const resultado = await enviarInforme(asunto, html, [jsonPath, htmlPath, path.resolve('playwright-report', 'index.html')]);
console.log(resultado);
if (resultado.includes('ERROR') || resultado.includes('no enviado')) process.exit(1);
