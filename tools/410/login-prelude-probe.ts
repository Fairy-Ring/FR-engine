import net from 'node:net';

import { LOGIN_OUTER_FRESH, LOGIN_REPLY_CONTINUE, LOGIN_REPLY_OUTOFDATE, LOGIN_REV, LOGIN_TRAILER } from '#/io/Login410Prelude.js';

function outer(rev: number): Buffer {
    const payload = Buffer.alloc(LOGIN_TRAILER);
    payload.writeInt32BE(rev, 0);
    payload[4] = 0;
    // 12 p4 stay 0
    return Buffer.concat([Buffer.from([LOGIN_OUTER_FRESH, LOGIN_TRAILER]), payload]);
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

const ok = await once(host, port, outer(LOGIN_REV));
if (ok !== LOGIN_REPLY_CONTINUE) {
    fails.push(`410 outer reply=${ok} want ${LOGIN_REPLY_CONTINUE}`);
}

const old = await once(host, port, outer(377));
if (old !== LOGIN_REPLY_OUTOFDATE) {
    fails.push(`377 outer reply=${old} want ${LOGIN_REPLY_OUTOFDATE}`);
}

const bad = await once(host, port, Buffer.from([13, 5, 0, 0, 0, 0, 0]));
if (typeof bad === 'number') {
    fails.push(`opcode 13 replied ${bad}`);
}

if (fails.length) {
    for (const f of fails) {
        console.error(`FAIL ${f}`);
    }
    process.exit(1);
}
console.log('PASS login prelude p4(410)+12 → 0; p4(377) → 6');
