import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
const assets = fileURLToPath(new URL("../assets/", import.meta.url));
export function registerFonts(pdf) {
  pdf.registerFont(
    "nexvia-latin",
    process.env.CV_FONT_PATH && fs.existsSync(process.env.CV_FONT_PATH)
      ? process.env.CV_FONT_PATH
      : path.join(assets, "NotoSans-Regular.ttf"),
  );
  pdf.registerFont(
    "nexvia-sinhala",
    path.join(assets, "NotoSansSinhala-Regular.ttf"),
  );
  pdf.registerFont(
    "nexvia-tamil",
    path.join(assets, "NotoSansTamil-Regular.ttf"),
  );
  pdf.font("nexvia-latin");
}
export function writeText(pdf, text, options = {}) {
  const runs = String(text).match(
    /[\u0d80-\u0dff]+|[\u0b80-\u0bff]+|[^\u0d80-\u0dff\u0b80-\u0bff]+/gu,
  ) || [""];
  runs.forEach((run, index) => {
    pdf
      .font(
        /[\u0d80-\u0dff]/u.test(run)
          ? "nexvia-sinhala"
          : /[\u0b80-\u0bff]/u.test(run)
            ? "nexvia-tamil"
            : "nexvia-latin",
      )
      .text(run, { ...options, continued: index < runs.length - 1 });
  });
}
