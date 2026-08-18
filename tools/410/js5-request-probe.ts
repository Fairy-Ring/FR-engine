import net from 'node:net';

import { JS5_HELLO_P1, JS5_REPLY_CONTINUE, JS5_REV } from '#/io/Js5Hello.js';
import { parseJs5Request410 } from '#/io/Js5Request410.js';

function p4(n: number): Buffer {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return b;
}

function hello(rev: number): Buffer {
    return Buffer.concat([Buffer.from([JS5_HELLO_P1]), p4(rev)]);
}

const host = process.argv[2] ?? '127.0.0.1';
const port = Number(process.argv[3] ?? 43596);
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

function noExtraByteAfterRequest(host: string, port: number): Promise<string | null> {
    return new Promise(resolve => {
        const s = net.connect({ host, port }, () => s.write(hello(JS5_REV)));
        let reqSent = false;
        let settled = false;
        const finish = (err: string | null) => {
            if (settled) return;
            settled = true;
            s.destroy();
            resolve(err);
        };
        s.setTimeout(3000);
        s.on('data', d => {
            if (!reqSent) {
                const v = d[0];
                if (v !== JS5_REPLY_CONTINUE) {
                    finish(`hello reply=${v} want ${JS5_REPLY_CONTINUE}`);
                    return;
                }
                reqSent = true;
                s.write(Buffer.from([1, 255, 0, 0]));
                setTimeout(() => finish(null), 200);
                return;
            }
            finish(`extra byte after request: ${d.toString('hex')}`);
        });
        s.on('close', () => {
            if (reqSent) {
                finish('closed after request');
            } else {
                finish('closed before hello reply');
            }
        });
        s.on('timeout', () => finish('timeout'));
        s.on('error', e => finish(`error: ${e.message}`));
    });
}

const err = await noExtraByteAfterRequest(host, port);
if (err !== null) {
    fails.push(`socket: ${err}`);
}

if (fails.length) {
    for (const f of fails) {
        console.error(`FAIL ${f}`);
    }
    process.exit(1);
}
console.log('PASS js5 req parse; hello+req no extra byte');
