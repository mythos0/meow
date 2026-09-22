// afterpack.mjs — electron-builder afterPack hook.
// Stamps the MeowCat identity (name/version/icon) into the INNER app exe
// right after packing and BEFORE the portable SFX wraps it — so every
// process the user sees in Task Manager reports "MeowCat", never "Electron".
'use strict';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function afterPack(context) {
  const productName = context.packager.appInfo.productFilename;   // "MeowCat"
  const exe = path.join(context.appOutDir, productName + '.exe');
  if (!fs.existsSync(exe)) {
    console.warn('afterpack: no exe at', exe, '— skipping identity patch');
    return;
  }
  const script = path.join(__dirname, 'patch-exe.mjs');
  const r = spawnSync(process.execPath, [script, exe, exe, context.packager.appInfo.version], { stdio: 'inherit' });
  if (r.status !== 0) console.warn('afterpack: patch-exe exited with', r.status);
}
