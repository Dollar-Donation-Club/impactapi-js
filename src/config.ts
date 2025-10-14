/**
 * Default widget URL for development
 *
 * ⚠️ WARNING: This default is for DEVELOPMENT ONLY!
 *
 * In production, you MUST provide the widgetUrl in your WidgetConfig:
 *
 * @example
 * ```ts
 * createWidget({
 *   sessionId: 'your-session-id',
 *   secret: 'your-secret',
 *   widgetUrl: 'https://your-production-widget-url.com', // ← REQUIRED in production
 * })
 * ```
 *
 * For build-time configuration, you can use a build tool to replace this value,
 * or simply ensure widgetUrl is always provided in your WidgetConfig.
 */
export const WIDGET_URL = 'http://localhost:5173'