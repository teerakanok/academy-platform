#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const FILES = [
  "academy-production-operation.mjs",
  "academy-production-p1-p7-runner.mjs",
  "academy-production-p1-p7-ssh.mjs",
  "academy-production-p1-p7-host.mjs",
  "academy-production-operation-install.mjs",
  "academy-poola-production-producer.mjs",
  "academy-production-cloudflare-helper.mjs",
  "academy-production-database-adapter.mjs",
  "current-deployment.mjs",
];
export async function renderOperationManifest({
  root = new URL(".", import.meta.url),
  output,
}) {
  const entries = [];
  for (const name of FILES) {
    const source = new URL(name, root);
    const bytes = await readFile(source);
    entries.push({
      name,
      sourcePath: resolve(source.pathname),
      installPath: `/opt/academy/production-operations/${name}`,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      mode: [
        "academy-production-operation.mjs",
        "academy-production-p1-p7-runner.mjs",
        "academy-production-p1-p7-host.mjs",
        "academy-production-operation-install.mjs",
        "academy-poola-production-producer.mjs",
      ].includes(name)
        ? "0755"
        : "0644",
    });
  }
  const value = {
    schema: "academy-production-operation-install-manifest/v1",
    entries,
  };
  if (output) {
    await writeFile(output, `${JSON.stringify(value)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await chmod(output, 0o600);
  }
  return value;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const value = await renderOperationManifest({ output: process.argv[2] });
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
