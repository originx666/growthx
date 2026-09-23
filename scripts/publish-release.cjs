// Keep distributable executables separate from electron-builder intermediate files.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const output = path.join(root, '.build-output');
const release = path.join(root, 'release');
const names = [`歌若思 ${version}.exe`, `歌若思 Setup ${version}.exe`];
for (const name of names) {
  if (!fs.statSync(path.join(output, name)).isFile()) throw new Error(`Missing executable: ${name}`);
}
fs.mkdirSync(release, { recursive: true });
for (const name of names) fs.copyFileSync(path.join(output, name), path.join(release, name));
// Only remove the dedicated build directory after both releases are copied successfully.
if (path.dirname(output) !== root || path.basename(output) !== '.build-output' || fs.lstatSync(output).isSymbolicLink()) {
  throw new Error('Unexpected build directory; cleanup stopped');
}
fs.rmSync(output, { recursive: true, force: true });
console.log('发布目录已更新：' + names.join('、'));
