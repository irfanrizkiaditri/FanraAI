const OpenAI = require("openai");

function createOpenRouterProvider(apiKey, model) {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://fanra-ai.local",
      "X-Title": "Fanra AI",
    },
  });

  return {
    name: `OpenRouter - ${model}`,
    model,
    provider: "openrouter",

    async chat(messages) {
      const response = await client.chat.completions.create({
        model,
        messages,
      });

      return response.choices[0].message.content;
    },
  };
}

module.exports = { createOpenRouterProvider };