import net from 'node:net';

import { LOGIN_REPLY_OK, LOGIN_REV, parseLogin410Prelude } from '#/io/Login410Prelude.js';
import { loginOuter410 } from './login-outer410.js';

const fails: string[] = [];

// in-process: prelude parse of loginOuter410(410) → crcs deep-equal 12 zeros
const outer = loginOuter410(LOGIN_REV);
const prelude = parseLogin410Prelude(outer[0], outer.subarray(1)); // [len][payload...]
if (prelude.kind !== 'ok') {
    fails.push('in-process prelude → not ok');
} else {
    if (prelude.crcs.length !== 12) {
        fails.push(`crcs.length=${prelude.crcs.length} want 12`);
    } else if (prelude.crcs.some(v => v !== 0)) {
        fails.push(`crcs=${prelude.crcs.join(',')} want 12 zeros`);
    }
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

// socket: still 2 + 8 zero trailer (do not require the isaac-out byte)
const host = process.argv[2] ?? '127.0.0.1';
const port = Number(process.argv[3] ?? 43596);

const ok = await once(host, port, loginOuter410(LOGIN_REV), 9);
if (ok === 'closed') {
    fails.push('410 outer closed with no reply');
} else {
    if (ok.length < 9) {
        fails.push(`410 outer reply=${ok.length} bytes, want ≥9`);
    } else if (ok[0] !== LOGIN_REPLY_OK) {
        fails.push(`410 outer reply[0]=${ok[0]} want ${LOGIN_REPLY_OK}`);
    } else {
        for (let i = 1; i < 8; i++) {
            if (ok[i] !== 0) {
                fails.push(`410 trailer byte ${i}=${ok[i]} want 0`);
            }
        }
        const followLen = (ok[7] << 8) | ok[8];
        if (followLen !== 153) {
            fails.push(`410 follow-len=${followLen} want 153`);
        }
    }
}

if (fails.length) {
    for (const f of fails) {
        console.error(`FAIL ${f}`);
    }
    process.exit(1);
}
console.log('PASS login crcs 12 zeros');
