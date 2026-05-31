import { test, expect } from '@playwright/test';

test.describe('BeerFlow Manager E2E', () => {
  
  test('debe cargar la página principal y mostrar el grifo activo', async ({ page }) => {
    // 1. Navegar a la raíz de la aplicación
    await page.goto('/');
    
    // 2. Verificar que el título principal de la app se muestre
    await expect(page.locator('h1')).toContainText('BeerFlow');
    
    // 3. Verificar que el selector de grifo tenga 'tap-001' por defecto
    const select = page.locator('select');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('tap-001');

    // 4. Verificar que se muestre el estado inicial "Desconectado" o "Conectado"
    const connectionIndicator = page.locator('.flex.items-center.gap-2.bg-gray-900\\/60');
    await expect(connectionIndicator).toBeVisible();
  });

  test('debe fluir la cerveza en tiempo real y cerrar la sesión por inactividad', async ({ page, request }) => {
    // 1. Navegar al grifo público
    await page.goto('/');
    
    // Esperar a que se conecte el WebSocket (indicador en verde/Conectado)
    await page.waitForTimeout(1000);

    // 2. Simular el envío de 20 pulsos de sensor a través del backend
    // A 2.25 ml por pulso, 20 pulsos representan exactamente 45 ml.
    const pulseResponse = await request.post('http://localhost:8080/api/beerflow/sensor/pulse', {
      data: {
        tap_id: 'tap-001',
        pulses: 20
      }
    });
    
    expect(pulseResponse.ok()).toBeTruthy();
    
    // 3. Verificar que el frontend reciba la actualización en tiempo real por WebSocket
    // Debe mostrar 45 ml y el indicador de "VERTIDO ACTIVO"
    const volumeText = page.locator('span:has-text("ml")').locator('xpath=../span[1]');
    await expect(volumeText).toHaveText('45');
    
    const activeLabel = page.locator('text=VERTIDO ACTIVO');
    await expect(activeLabel).toBeVisible();

    // 4. Esperar el timeout de inactividad de la sesión (5 segundos por defecto + margen)
    // El backend detecta la inactividad y envía un estado "closed" durante 30s
    await page.waitForTimeout(6500);

    // 5. Verificar que se muestra la alerta de sesión finalizada y cobrada en el frontend
    const closedLabel = page.locator('text=¡Sesión Finalizada! Cobrando...');
    await expect(closedLabel).toBeVisible();
  });
});
