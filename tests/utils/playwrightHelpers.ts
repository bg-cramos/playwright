import { Locator, Page } from '@playwright/test';

/**
 * Hace clic en un locator si está visible. Si no está visible, continúa.
 */
export async function clickIfVisible(locator: Locator, page: Page, timeout = 5000, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    // Esperar hasta que el botón sea visible dentro del tiempo de espera
    const isVisible = await locator.isVisible({ timeout });

    if (isVisible) {
      console.log(`✔ Modal visible, haciendo click (intento ${i + 1})...`);
      await locator.click();
      await page.waitForTimeout(5000); // Espera después de hacer clic
      return; // Si el botón está visible, hace clic y termina la función
    }

    console.log(`⏳ Modal no visible aún (intento ${i + 1})`);

    // Si no es visible, espera un poco y reintenta
    if (i < retries) await new Promise((r) => setTimeout(r, 1000));
  }

  // Si no ha sido visible después de varios intentos, continua sin hacer nada
  console.log('ℹ️ Modal no apareció después de varios intentos. Continuando...');
}
