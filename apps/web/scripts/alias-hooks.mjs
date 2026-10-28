import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");

function resolveWithExt(filePath) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath;
  if (fs.existsSync(`${filePath}.js`)) return `${filePath}.js`;
  if (fs.existsSync(`${filePath}.jsx`)) return `${filePath}.jsx`;
  if (fs.existsSync(path.join(filePath, "index.js"))) {
    return path.join(filePath, "index.js");
  }
  return `${filePath}.js`;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const mapped = pathToFileURL(
      resolveWithExt(path.join(src, specifier.slice(2))),
    ).href;
    return nextResolve(mapped, context);
  }

  if (
    specifier.startsWith(".") &&
    context.parentURL &&
    !path.extname(specifier)
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const mapped = pathToFileURL(
      resolveWithExt(path.resolve(parentDir, specifier)),
    ).href;
    return nextResolve(mapped, context);
  }

  return nextResolve(specifier, context);
}
