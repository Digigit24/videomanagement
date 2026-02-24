import axios from "axios";

/**
 * Send a request to Groq LLM API with system + user messages
 * @param {string} userPrompt - User-level content/question
 * @param {string} apiKey - Groq API key
 * @param {object} options - Model config
 * @returns {string} LLM response text
 */
export async function sendChatGPTRequest(
  userPrompt,
  apiKey,
  {
    systemPrompt = "",
    model = "llama-3.3-70b-versatile",
    maxTokens = 8000,
    temperature = 0.1,
  } = {},
) {
  if (!apiKey) throw new Error("API key is required");
  if (!userPrompt) throw new Error("Prompt is required");

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt });

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 120000, // 2 minute timeout for large schemas
      },
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    if (error.response) {
      throw new Error(
        `LLM API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`,
      );
    } else if (error.request) {
      throw new Error("Network error: Unable to reach LLM API");
    } else {
      throw new Error(`Error: ${error.message}`);
    }
  }
}
