import fs from 'fs';
import net from 'node:net';

import forge from 'node-forge';

import { parseLogin410Inner } from '#/io/Login410Inner.js';
import { LOGIN_REPLY_OK, LOGIN_REV } from '#/io/Login410Prelude.js';
import { loginOuter410 } from './login-outer410.js';

const pem = forge.pki.privateKeyFromPem(fs.readFileSync('data/config/private.pem', 'ascii'));

const fails: string[] = [];

// in-process: parse the exact bytes loginOuter410(410) produces
const outer = loginOuter410(LOGIN_REV);
const payload = outer.subarray(2); // [16][len][payload...]
const inner = parseLogin410Inner(payload.subarray(53), pem);
if (inner.kind !== 'ok') {
    fails.push('in-process parseLogin410Inner → bad-inner');
} else {
    const want = [1, 2, 3, 4];
    const got = inner.seeds;
    if (got.length !== want.length || got.some((v, i) => v !== want[i])) {
        fails.push(`seeds=${got.join(',')} want ${want.join(',')}`);
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

// socket: RSA outer still replies 2 + 8 zero trailer
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
        for (let i = 1; i < 9; i++) {
            if (ok[i] !== 0) {
                fails.push(`410 trailer byte ${i}=${ok[i]} want 0`);
            }
        }
    }
}

if (fails.length) {
    for (const f of fails) {
        console.error(`FAIL ${f}`);
    }
    process.exit(1);
}
console.log('PASS login seeds 1,2,3,4');
