/**
 * URL base del backend FastAPI.
 * - Desarrollo (`ng serve` en :4200): la API corre aparte en :8000.
 * - Producción (nginx, VET-19): misma URL de origen; nginx reenvía /api al contenedor de la API.
 */
const isDevServer = typeof window !== 'undefined' && window.location.port === '4200';

export const API_URL = isDevServer ? 'http://localhost:8000/api/v1' : '/api/v1';
