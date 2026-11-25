import { Locator, Page } from '@playwright/test';

/**
 * Hace clic en un locator solo si aparece dentro de `timeout` ms.
 * Pensado para popups opcionales (p. ej. el botón "Continuar" de selección de terminal).
 * Devuelve true si hizo clic, false si el elemento no apareció.
 *
 * Nota: `locator.isVisible()` no espera (ignora el timeout), por eso se usa `waitFor`.
 */
export async function clickIfVisible(locator: Locator, page: Page, timeout = 5000): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
  } catch {
    console.log('ℹ️ Popup opcional no apareció, se continúa.');
    return false;
  }
  await locator.first().click();
  // Esperar a que el popup se cierre antes de seguir
  await locator.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  console.log('✔ Popup opcional aceptado.');
  return true;
}
