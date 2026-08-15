/**
 * Compile RuneScript to data/pack/server/script.dat only.
 * Does not call packAll (FileStream createNew=true wipes main_file_cache).
 *
 *   BUILD_SRC_DIR=../content npx tsx tools/compile-scripts-only.ts
 *   bash ../../scripts/compile-scripts-only.sh
 */
import { runServerCompiler } from '#tools/pack/Compiler.js';

runServerCompiler();
