// Regenerates relay/third_party_notices.txt: the licenses of Go's standard
// library and of every module built into the relay (`npm run notices:relay`).
// The relay embeds the file and prints it with -licenses, beside the app's own
// notices, and its tests check that it names every module in go.mod.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const relay = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'relay');
const go = (...args: string[]) => execFileSync('go', args, { cwd: relay, encoding: 'utf8' }).trim();

function licenseText(dir: string): string {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  if (!file) throw new Error(`No license file in ${dir}`);
  return readFileSync(join(dir, file), 'utf8').trim();
}

// -e: the relay embeds the file this writes, so the package may not load until it exists.
const modules = go('list', '-e', '-deps', '-f', '{{with .Module}}{{if not .Main}}{{.Path}} {{.Version}} {{.Dir}}{{end}}{{end}}', '.')
  .split('\n')
  .filter(Boolean);
const entries = [...new Set(modules)].sort().map((line) => {
  const [path, version, dir] = line.split(' ') as [string, string, string];
  return `== ${path} ${version} ==\n\n${licenseText(dir)}\n`;
});

const text = [
  'The Planning Board relay is licensed under the Apache License 2.0. It is built with Go, and includes the following open-source software, under the licenses below.',
  '',
  `== Go standard library ==\n\n${licenseText(go('env', 'GOROOT'))}\n`,
  ...entries,
].join('\n');
writeFileSync(join(relay, 'third_party_notices.txt'), text);
console.log(`Wrote relay/third_party_notices.txt: Go and ${entries.length} module(s).`);
