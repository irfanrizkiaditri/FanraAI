const fs = require("fs");
const path = require("path");

function createVisualReviewTool(router) {
  return {
    name: "visual_review",

    description:
      "Menganalisis screenshot website menggunakan model Gemini vision untuk mengevaluasi kualitas UI/UX.",

    async execute({ screenshot }) {
      if (!screenshot) {
        throw new Error("Path screenshot wajib diberikan.");
      }

      const screenshotPath = path.resolve(screenshot);

      if (!fs.existsSync(screenshotPath)) {
        throw new Error(
          `Screenshot tidak ditemukan: ${screenshotPath}`
        );
      }

      const stats = fs.statSync(screenshotPath);

      if (stats.size === 0) {
        throw new Error("File screenshot kosong.");
      }

      const messages = [
        {
          role: "user",
          content: `
Analisis screenshot website ini sebagai UI/UX reviewer profesional.

Evaluasi:

1. Visual hierarchy
2. Typography
3. Spacing dan alignment
4. Layout
5. Color usage
6. Component consistency
7. CTA dan interaction clarity
8. Responsive/mobile concerns yang dapat diperkirakan
9. Apakah desain terlihat seperti template AI generik
10. Masalah visual paling penting yang harus diperbaiki

Berikan review yang konkret dan actionable.

Jangan memberikan pujian kosong.
Fokus pada masalah yang benar-benar terlihat dari screenshot.
`,
          image: screenshotPath,
        },
      ];

      const result = await router.chat(
        messages,
        "hard"
      );

      return {
        success: true,
        screenshot: screenshotPath,
        review: result,
      };
    },
  };
}

module.exports = {
  createVisualReviewTool,
};