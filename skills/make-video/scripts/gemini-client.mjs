const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * @param {string} model
 * @param {string} apiKey
 * @param {Record<string, unknown>} body
 * @returns {Promise<any>}
 */
export const generateContent = async (model, apiKey, body) => {
  const response = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini API request to ${model} failed (${response.status}): ${errorText}`,
    );
  }

  return response.json();
};

/**
 * @param {any} response
 * @returns {string | undefined}
 */
export const firstInlineAudio = (response) =>
  response.candidates?.[0]?.content?.parts?.find(
    (/** @type {any} */ part) => part.inlineData?.data,
  )?.inlineData?.data;

/**
 * @param {any} response
 * @returns {string | undefined}
 */
export const firstText = (response) =>
  response.candidates?.[0]?.content?.parts?.find(
    (/** @type {any} */ part) => typeof part.text === "string",
  )?.text;
