import Js5FileStore from '#/io/Js5FileStore.js';

const EXPECTED: Record<number, number> = {
    0: 1056,
    1: 945,
    2: 17,
    3: 393,
    4: 2743,
    5: 1390,
    6: 647,
    7: 15118,
    8: 529,
    9: 1,
    10: 2,
    11: 204,
    255: 12
};

function nameOf(archive: number): string {
    return archive === 5 ? 'maps' : '';
}

const dir = process.argv[2];
if (!dir) {
    console.error('usage: npx tsx tools/410/list-archives.ts <cache-dir>');
    process.exit(2);
}

const store = new Js5FileStore(dir);
const fails: string[] = [];

try {
    const master = store.count(255);
    if (master !== 12) {
        fails.push(`idx255 count=${master} want 12`);
    }

    console.log(`store ${dir}`);
    console.log('dat2+idx255');
    console.log('archive\tgroups\tname');

    for (let i = 0; i <= 11; i++) {
        const n = store.count(i);
        const want = EXPECTED[i];
        if (n !== want) {
            fails.push(`idx${i} count=${n} want ${want}`);
        }
        const blob = store.read(255, i);
        if (!blob || blob.length === 0) {
            fails.push(`idx255 group ${i} unreadable`);
        }
        console.log(`${i}\t${n}\t${nameOf(i)}`);
    }

    console.log(`255\t${store.count(255)}\tref-tables`);
    console.log(`archives ${master}`);

    if (nameOf(5) !== 'maps') {
        fails.push('maps must be archive 5');
    }
} finally {
    store.close();
}

if (fails.length) {
    for (const f of fails) {
        console.error(`FAIL ${f}`);
    }
    process.exit(1);
}

console.log('PASS 12 archives; maps=5');
