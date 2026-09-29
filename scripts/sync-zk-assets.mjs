// Copies compiled ZK artifacts (keys + zkir) into public/ so the browser
// wallet can fetch them for local proof generation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'managed', 'room-membership');
const dst = path.join(root, 'public', 'zk', 'room-membership');

for (const dir of ['keys', 'zkir']) {
  const from = path.join(src, dir);
  if (!fs.existsSync(from)) {
    console.error(`✗ ${from} missing — run "npm run compile" first.`);
    process.exit(1);
  }
  fs.mkdirSync(path.join(dst, dir), { recursive: true });
  for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(dst, dir, f));
}
console.log(`✓ ZK assets synced to ${path.relative(root, dst)}`);
