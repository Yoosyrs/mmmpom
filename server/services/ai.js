import { HttpError } from '../util.js';

export function aiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function aiModel() {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function baseUrl() {
  return (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
}

export function aiStatus() {
  return {
    configured: aiConfigured(),
    model: aiConfigured() ? aiModel() : null,
    provider: aiConfigured() ? 'OpenAI' : null,
    message: aiConfigured()
      ? null
      : 'El asistente de aprendizaje necesita la variable de entorno OPENAI_API_KEY. Sin ella la plataforma funciona, pero el asistente permanece desactivado.',
  };
}

/**
 * Calls a real chat-completions API. There is no offline fallback: when the key is
 * missing or the provider fails we return an explicit error so the UI can explain it.
 */
export async function chat(messages, { temperature = 0.6, maxTokens = 900, signal } = {}) {
  if (!aiConfigured()) {
    throw new HttpError(503, 'El asistente de IA no está disponible: falta configurar OPENAI_API_KEY en el entorno.', {
      code: 'ai_not_configured',
    });
  }

  let response;
  try {
    response = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel(),
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal,
    });
  } catch (error) {
    throw new HttpError(503, 'No pudimos contactar al proveedor de IA. Revisa la conexión e inténtalo de nuevo.', {
      code: 'ai_unreachable',
      detail: error.message,
    });
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    let message = `El proveedor de IA respondió con estado ${response.status}.`;
    if (response.status === 401 || response.status === 403) message = 'La clave de IA fue rechazada. Revisa OPENAI_API_KEY.';
    if (response.status === 429) message = 'El proveedor de IA limitó las solicitudes o el saldo de la cuenta. Inténtalo más tarde.';
    throw new HttpError(503, message, { code: 'ai_provider_error', status: response.status, detail: raw.slice(0, 300) });
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new HttpError(502, 'El proveedor de IA devolvió una respuesta vacía.', { code: 'ai_empty' });
  }
  return { content: String(content).trim(), model: data.model || aiModel(), usage: data.usage || null };
}
