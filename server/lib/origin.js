export function isAllowedOrigin(origin, requestOrigin, allowedOrigins) {
  if (!origin) return true;

  let normalizedOrigin;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  if (allowedOrigins.has(normalizedOrigin)) return true;

  try {
    return normalizedOrigin === new URL(requestOrigin).origin;
  } catch {
    return false;
  }
}
