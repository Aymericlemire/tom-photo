export async function api(path, options = {}) {
  const { timeoutMs = 30000, signal, ...requestOptions } = options;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  // Si l'écran qui a lancé la requête est fermé, on arrête aussi le fetch.
  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  let response;
  let payload;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...requestOptions,
      signal: controller.signal,
      headers: {
        ...(requestOptions.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...requestOptions.headers
      }
    });

    // La durée limite couvre aussi le téléchargement du corps JSON, pas
    // seulement l'attente de la première réponse du serveur.
    payload = response.status === 204 ? null : await response.json().catch((error) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error('Le serveur met trop de temps à répondre. Vérifiez que l’application est démarrée, puis réessayez.');
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `La requête a échoué (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const formatDateForInput = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};
