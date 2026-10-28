import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuración de Capacitor para el APK (AD-16). `appId` y `server` quedan congelados antes del
 * primer APK distribuido: cambiar el origen del WebView borraría el progreso local de quien ya
 * instaló la app.
 */
const config: CapacitorConfig = {
  appId: 'app.linguapop.mobile',
  appName: 'LinguaPop',
  webDir: 'dist-native',
  server: {
    androidScheme: 'https',
  },
};

export default config;
