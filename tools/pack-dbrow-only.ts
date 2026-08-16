/**
 * Pack server dbrow.dat / dbtable.dat only.
 * Does not open FileStream and does not wipe main_file_cache.
 *
 *   BUILD_SRC_DIR=../content npx tsx tools/pack-dbrow-only.ts
 */
import DbTableType from '#/cache/config/DbTableType.js';
import Environment from '#/util/Environment.js';
import { loadDir } from '#tools/pack/NameMap.js';
import { packDbRowConfigs, parseDbRowConfig } from '#tools/pack/config/DbRowConfig.js';
import { packDbTableConfigs, parseDbTableConfig } from '#tools/pack/config/DbTableConfig.js';
import { CONSTANTS, readConfigs, readDirTree } from '#tools/pack/config/PackShared.js';

loadDir(`${Environment.BUILD_SRC_DIR}/scripts`, '.constant', src => {
    for (let i = 0; i < src.length; i++) {
        if (!src[i] || src[i].startsWith('//')) {
            continue;
        }
        const parts = src[i].split('=');
        if (parts.length !== 2) {
            throw new Error(`Bad constant declaration on line: ${src[i]}`);
        }
        let name = parts[0].trim();
        const value = parts[1].trim();
        if (name.startsWith('^')) {
            name = name.substring(1);
        }
        CONSTANTS.set(name, value);
    }
});

const dirTree = new Set<string>();
readDirTree(dirTree, `${Environment.BUILD_SRC_DIR}/scripts`);

await readConfigs(
    dirTree,
    '.dbtable',
    [],
    [],
    parseDbTableConfig,
    packDbTableConfigs,
    () => {},
    (dat, idx) => {
        dat.save('data/pack/server/dbtable.dat');
        idx.save('data/pack/server/dbtable.idx');
        dat.release();
        idx.release();
    }
);

DbTableType.load('data/pack');

await readConfigs(
    dirTree,
    '.dbrow',
    [],
    [],
    parseDbRowConfig,
    packDbRowConfigs,
    () => {},
    (dat, idx) => {
        dat.save('data/pack/server/dbrow.dat');
        idx.save('data/pack/server/dbrow.idx');
        dat.release();
        idx.release();
    }
);

console.log('packed data/pack/server/dbrow.dat (no cache wipe)');
