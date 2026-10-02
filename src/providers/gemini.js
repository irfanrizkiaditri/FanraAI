const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

function createGeminiProvider(
  apiKey,
  model,
  keyName
) {
  const ai = new GoogleGenAI({
    apiKey,
  });

  return {
    name: `${keyName} - ${model}`,
    model,
    keyName,

    async chat(
      messages,
      options = {}
    ) {
      const signal =
        options?.signal;


      /*
       * CEK CANCELLATION
       */
      if (signal?.aborted) {
        const error =
          new Error(
            "Task dibatalkan."
          );

        error.name =
          "AbortError";

        throw error;
      }


      /*
       * BUILD CONTENTS
       */
      const contents =
        messages
          .filter(
            (message) =>
              message.role !==
              "system"
          )
          .map((message) => {
            const parts = [];


            /*
             * TEXT
             */
            if (
              message.content
            ) {
              parts.push({
                text:
                  message.content,
              });
            }


            /*
             * IMAGE
             */
            if (
              message.image
            ) {
              const imagePath =
                path.resolve(
                  message.image
                );


              if (
                !fs.existsSync(
                  imagePath
                )
              ) {
                throw new Error(
                  `File gambar tidak ditemukan: ${imagePath}`
                );
              }


              const imageData =
                fs.readFileSync(
                  imagePath
                );


              const base64Image =
                imageData.toString(
                  "base64"
                );


              parts.push({
                inlineData: {
                  mimeType:
                    "image/png",
                  data:
                    base64Image,
                },
              });
            }


            return {
              role:
                message.role ===
                "assistant"
                  ? "model"
                  : "user",

              parts,
            };
          });


      /*
       * SYSTEM MESSAGE
       */
      const systemMessage =
        messages.find(
          (message) =>
            message.role ===
            "system"
        );


      /*
       * GEMINI REQUEST
       */
      const response =
        await ai.models.generateContent(
          {
            model,
            contents,

            config: {
              systemInstruction:
                systemMessage?.content,

              /*
               * AbortSignal
               *
               * SDK Gemini akan menerima
               * signal dari Fanra.
               */
              abortSignal:
                signal,
            },
          }
        );


      /*
       * CEK SETELAH RESPONSE
       */
      if (signal?.aborted) {
        const error =
          new Error(
            "Task dibatalkan."
          );

        error.name =
          "AbortError";

        throw error;
      }


      return response.text;
    },
  };
}


module.exports = {
  createGeminiProvider,
};