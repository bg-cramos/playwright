import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Variables de correo (SMTP_*, MAIL_*) desde .env, si existe (ver .env.example)
if (fs.existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  retries: 0,
  // El usuario supervisor admite una sola sesión simultánea: las pruebas corren en secuencia.
  workers: 1,
  fullyParallel: false,
  // El reporter de correo va último: adjunta el reporte HTML ya generado
  reporter: [['list'], ['html', { open: 'never' }], ['./utils/emailReporter.ts']],
  use: {
    baseURL: 'http://sandbox.igglobal.net',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1600, height: 900 },
  },
  expect: { timeout: 15_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } } }],
});
