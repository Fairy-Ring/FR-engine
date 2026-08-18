/**
 * Compile RuneScript to data/pack/server/script.dat only.
 * Does not call packAll (FileStream createNew=true wipes main_file_cache).
 *
 * One invocation must leave script.dat jumpable. pack/script.pack ids for new
 * [label]/[proc]/[opnpc] are registered first (revalidatePack, same as packAll),
 * so the compiler resolves every proc; then compile, and if script.pack still
 * grew, compile again in this process. The operator never compiles twice.
 *
 *   BUILD_SRC_DIR=../content npx tsx tools/compile-scripts-only.ts
 *   bash ../../scripts/compile-scripts-only.sh
 */
import fs from 'fs';
import path from 'path';

import Environment from '#/util/Environment.js';
import { runServerCompiler } from '#tools/pack/Compiler.js';
import { revalidatePack } from '#tools/pack/PackFile.js';

function countScriptPackIds(): number {
    const file = path.join(Environment.BUILD_SRC_DIR, 'pack/script.pack');
    if (!fs.existsSync(file)) {
        return 0;
    }
    let count = 0;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (line.length && line.indexOf('=') !== -1) {
            count++;
        }
    }
    return count;
}

// Register ids for new scripts before the compiler runs: packAll regenerates
// pack/*.pack via revalidatePack() and compiles once with those ids visible.
// Without this, a new [label]/[proc]/[opnpc] resolves to id -1 in the compiler
// and script.dat is not jumpable ("jump_with_params unable to find proc").
await revalidatePack();

let previous = countScriptPackIds();
for (;;) {
    runServerCompiler();
    const current = countScriptPackIds();
    if (current <= previous) {
        break;
    }
    previous = current;
}
