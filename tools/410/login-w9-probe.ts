import net from 'node:net';

import { LOGIN_OUTER_FRESH, LOGIN_REPLY_OK, LOGIN_REPLY_OUTOFDATE, LOGIN_REV, LOGIN_TRAILER } from '#/io/Login410Prelude.js';

function outer(rev: number): Buffer {
    const payload = Buffer.alloc(LOGIN_TRAILER);
    payload.writeInt32BE(rev, 0);
    payload[4] = 0;
    // 12 p4 stay 0
    return Buffer.concat([Buffer.from([LOGIN_OUTER_FRESH, LOGIN_TRAILER]), payload]);
}

function once(host: string, port: number, payload: Buffer, want: number): Promise<Buffer | 'closed'> {
    return new Promise((resolve, reject) => {
        const s = net.connect({ host, port }, () => s.write(payload));
        s.setTimeout(2000);
        const chunks: Buffer[] = [];
        s.on('data', (d: Buffer) => {
            chunks.push(d);
            const got = Buffer.concat(chunks);
            if (got.length >= want) {
                s.end();
                resolve(got);
            }
        });
        s.on('close', () => {
            const got = Buffer.concat(chunks);
            resolve(got.length > 0 ? got : 'closed');
        });
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

const ok = await once(host, port, outer(LOGIN_REV), 9);
if (ok === 'closed') {
    fails.push('410 outer closed with no reply');
} else {
    if (ok.length < 9) {
        fails.push(`410 outer reply=${ok.length} bytes, want ≥9`);
    } else if (ok[0] !== LOGIN_REPLY_OK) {
        fails.push(`410 outer reply[0]=${ok[0]} want ${LOGIN_REPLY_OK}`);
    } else {
        for (let i = 1; i < 9; i++) {
            if (ok[i] !== 0) {
                fails.push(`410 trailer byte ${i}=${ok[i]} want 0`);
            }
        }
    }
}

const old = await once(host, port, outer(377), 1);
if (old === 'closed') {
    fails.push('377 outer closed with no reply');
} else if (old[0] !== LOGIN_REPLY_OUTOFDATE) {
    fails.push(`377 outer reply[0]=${old[0]} want ${LOGIN_REPLY_OUTOFDATE}`);
}

if (fails.length) {
    for (const f of fails) {
        console.error(`FAIL ${f}`);
    }
    process.exit(1);
}
console.log('PASS login 16/18 → 2 + 8 zero trailer');
