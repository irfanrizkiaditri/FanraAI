const OpenAI = require("openai");

function createGroqProvider(apiKey, model) {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  return {
    name: `Groq - ${model}`,
    model,
    provider: "groq",

    async chat(messages) {
      const response = await client.chat.completions.create({
        model,
        messages,
      });

      return response.choices[0].message.content;
    },
  };
}

module.exports = { createGroqProvider };
