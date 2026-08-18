import { parseJs5Request410 } from '#/io/Js5Request410.js';

const fails: string[] = [];

function checkOk(data: Uint8Array, wantP1: 0 | 1, wantArchive: number, wantGroup: number, label: string): void {
    const r = parseJs5Request410(data);
    if (r.kind !== 'ok') {
        fails.push(`${label}: expected ok`);
        return;
    }
    if (r.p1 !== wantP1 || r.archive !== wantArchive || r.group !== wantGroup) {
        fails.push(`${label}: got p1=${r.p1} archive=${r.archive} group=${r.group}`);
    }
}

function checkBad(data: Uint8Array, label: string): void {
    const r = parseJs5Request410(data);
    if (r.kind !== 'bad-shape') {
        fails.push(`${label}: expected bad-shape, got ${JSON.stringify(r)}`);
    }
}

checkOk(Buffer.from([1, 255, 0, 0]), 1, 255, 0, 'urgent 0xFFFF00');
checkOk(Buffer.from([0, 5, 0, 1]), 0, 5, 1, 'prefetch archive 5 group 1');
checkBad(Buffer.from([2, 0, 0, 0]), 'p1=2');
checkBad(Buffer.from([0, 5, 0]), '3 bytes');

if (fails.length) {
    for (const f of fails) {
        console.error(`FAIL ${f}`);
    }
    process.exit(1);
}
console.log('PASS js5 req parse');
