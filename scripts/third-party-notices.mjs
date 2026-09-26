import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

function fallback(p) {
  if (p.license === "Apache-2.0") {
    return "Licensed under the Apache License, Version 2.0. The package does not ship a license file; the full license text\nis included with Huallet in the file LICENSE.";
  }
  if (p.license === "MIT") {
    const pkg = JSON.parse(readFileSync(join(p.dir, "package.json"), "utf8"));
    const author = typeof pkg.author === "string" ? pkg.author : pkg.author?.name;
    return `MIT License${author ? `\n\nCopyright (c) ${author}` : ""}\n\n${MIT}`;
  }
  return `License: ${p.license}. The package does not ship a license file.`;
}

export function thirdPartyNotices() {
  const out = execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable"], { cwd: root, encoding: "utf8", maxBuffer: 1e8 });
  const dirs = [...new Set(out.split("\n").map((l) => l.trim()).filter((l) => l && l !== root && existsSync(join(l, "package.json"))))];
  const pkgs = dirs
    .map((dir) => {
      const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      const files = readdirSync(dir).filter((f) => /^(licen[sc]e|notice|copying)/i.test(f)).sort();
      return { name: p.name, version: p.version, license: p.license ?? "", dir, files };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const seen = new Set();
  const parts = [
    "Huallet — third-party software notices",
    "",
    "Huallet includes the following open-source components. Each is used under the license shown,",
    "whose full text is reproduced below together with any NOTICE file the component provides.",
    "",
  ];
  for (const p of pkgs) {
    const key = `${p.name}@${p.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push("=".repeat(78), `${key}  (${p.license})`, "=".repeat(78));
    if (!p.files.length) parts.push(fallback(p));
    for (const f of p.files) parts.push(`--- ${f} ---`, readFileSync(join(p.dir, f), "utf8").trim(), "");
    parts.push("");
  }
  return { text: parts.join("\n"), count: seen.size };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = resolve(root, process.argv[2] ?? "dist");
  const { text, count } = thirdPartyNotices();
  writeFileSync(join(target, "THIRD_PARTY_NOTICES.txt"), text);
  console.log(`✓ ${target.replace(root + "/", "")}/THIRD_PARTY_NOTICES.txt (${count} packages)`);
}
