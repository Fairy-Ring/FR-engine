import net from 'node:net';

import { JS5_HELLO_P1, JS5_REPLY_CONTINUE, JS5_REPLY_OUTOFDATE, JS5_REV } from '#/io/Js5Hello.js';

function p4(n: number): Buffer {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return b;
}

function hello(rev: number): Buffer {
    return Buffer.concat([Buffer.from([JS5_HELLO_P1]), p4(rev)]);
}

function once(host: string, port: number, payload: Buffer): Promise<number | 'closed'> {
    return new Promise((resolve, reject) => {
        const s = net.connect({ host, port }, () => s.write(payload));
        s.setTimeout(2000);
        s.on('data', d => {
            const v = d[0];
            s.end();
            resolve(v);
        });
        s.on('close', () => resolve('closed'));
        s.on('timeout', () => {
            s.destroy();
            reject(new Error('timeout'));
        });
        s.on('error', reject);
    });
}

const host = process.argv[2] ?? '127.0.0.1';
const port = Number(process.argv[3] ?? 43596);
const fails: string[] = [];

const ok = await once(host, port, hello(JS5_REV));
if (ok !== JS5_REPLY_CONTINUE) {
    fails.push(`410 hello reply=${ok} want ${JS5_REPLY_CONTINUE}`);
}

const old = await once(host, port, hello(377));
if (old !== JS5_REPLY_OUTOFDATE) {
    fails.push(`377 hello reply=${old} want ${JS5_REPLY_OUTOFDATE}`);
}

const bad = await once(host, port, Buffer.from([13, 0, 0, 0, 0]));
if (bad !== 'closed' && bad !== undefined) {
    // destroy with no byte is ok; a 0/6 would be wrong
    if (typeof bad === 'number') {
        fails.push(`bad-shape replied ${bad}`);
    }
}

if (fails.length) {
    for (const f of fails) {
        console.error(`FAIL ${f}`);
    }
    process.exit(1);
}
console.log('PASS js5 hello 15+p4(410) → 0; 15+p4(377) → 6');
