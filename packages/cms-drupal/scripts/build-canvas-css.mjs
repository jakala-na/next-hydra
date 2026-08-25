import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const animateImport = '@import "tw-animate-css";';
const globalCssPath = fileURLToPath(
  new URL("../../design-system/styles/globals.css", import.meta.url)
);
const canvasCssPath = fileURLToPath(
  new URL("../../design-system/styles/canvas-globals.css", import.meta.url)
);
const animateCssPath = fileURLToPath(
  new URL(
    "../../design-system/node_modules/tw-animate-css/dist/tw-animate.css",
    import.meta.url
  )
);

const [globalCss, animateCss] = await Promise.all([
  readFile(globalCssPath, "utf-8"),
  readFile(animateCssPath, "utf-8"),
]);

if (globalCss.split(animateImport).length !== 2) {
  throw new Error(`Expected exactly one ${animateImport} in ${globalCssPath}`);
}

const canvasCss = globalCss.replace(
  animateImport,
  `/* tw-animate-css is inlined because Canvas' browser Tailwind compiler cannot resolve package imports. */\n${animateCss}`
);

await writeFile(canvasCssPath, canvasCss, "utf-8");
