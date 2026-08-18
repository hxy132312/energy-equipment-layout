import { cp, copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "dist/server/index.js");
const clientTarget = resolve(root, "dist/client");

await mkdir(dirname(target), { recursive: true });
await copyFile(resolve(root, "worker/index.js"), target);
await mkdir(clientTarget, { recursive: true });
await copyFile(resolve(root, "dist/index.html"), resolve(clientTarget, "index.html"));
await copyFile(resolve(root, "dist/favicon.svg"), resolve(clientTarget, "favicon.svg"));
await cp(resolve(root, "dist/assets"), resolve(clientTarget, "assets"), { recursive: true });
