import { chromium, expect } from '@playwright/test';

async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 👉 Abrir la página de login
  await page.goto('http://sandbox.igglobal.net/');
  await expect(page.getByRole('textbox', { name: 'Alias' })).toBeVisible();

  // 👉 Usuario
  await page.getByRole('textbox', { name: 'Alias' }).fill('supervisor@test.com.ar');
  await page.getByRole('button', { name: 'Siguiente' }).click();

  // 👉 Contraseña
  await expect(page.getByRole('textbox', { name: 'Contraseña' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Contraseña' }).fill('supervisor');
  await page.getByRole('button', { name: 'Ingresar' }).click();

  // 👉 Esperar a que cargue la URL principal después del login
  await page.waitForURL('http://sandbox.igglobal.net/', { timeout: 15000 });

  // 👉 Esperar a que aparezca el menú de usuario
  await expect(
    page.getByRole('listitem')
        .filter({ hasText: 'CHRISTIAN RAMOS Salir' })
        .getByRole('img')
  ).toBeVisible({ timeout: 15000 });

  // 👉 Guardar el estado de la sesión para reutilizarlo en otros tests
  await page.context().storageState({ path: 'storageState.json' });

  await browser.close();
}

export default globalSetup;
