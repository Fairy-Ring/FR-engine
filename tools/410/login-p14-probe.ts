import net from 'node:net';

import { LOGIN_REPLY_OK, LOGIN_REPLY_OUTOFDATE, LOGIN_REV } from '#/io/Login410Prelude.js';
import { loginOuter410 } from './login-outer410.js';

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

function p14OpenThenLogin(host: string, port: number, rev: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const fails: string[] = [];
        let done = false;
        const s = net.connect({ host, port }, () => s.write(Buffer.from([14, 0])));
        s.setTimeout(2000);
        const chunks: Buffer[] = [];
        let phase: 'seed' | 'login' = 'seed';
        s.on('data', (d: Buffer) => {
            chunks.push(d);
            const buf = Buffer.concat(chunks);
            if (phase === 'seed') {
                if (buf.length < 17) {
                    return;
                }
                const head = buf.subarray(0, 17);
                for (let i = 0; i < 8; i++) {
                    if (head[i] !== 0) {
                        fails.push(`seed zero[${i}]=${head[i]}`);
                    }
                }
                if (head[8] !== 0) {
                    fails.push(`login-server byte=${head[8]}`);
                }
                phase = 'login';
                chunks.length = 0;
                s.write(loginOuter410(rev));
                return;
            }
            const reply = buf[0];
            if (reply !== LOGIN_REPLY_OK) {
                fails.push(`after p14, outer(${rev}) reply=${reply} want ${LOGIN_REPLY_OK}`);
            }
            done = true;
            s.end();
            resolve(fails);
        });
        s.on('close', () => {
            if (!done) {
                fails.push(phase === 'seed' ? 'closed before 17-byte reply' : 'closed before 16/18 reply');
            }
            resolve(fails);
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

const p14 = await p14OpenThenLogin(host, port, LOGIN_REV);
fails.push(...p14);

const old = await once(host, port, loginOuter410(377));
if (old !== LOGIN_REPLY_OUTOFDATE) {
    fails.push(`377 outer reply=${old} want ${LOGIN_REPLY_OUTOFDATE}`);
}

if (fails.length) {
    for (const f of fails) {
        console.error(`FAIL ${f}`);
    }
    process.exit(1);
}
console.log('PASS p14 + p4(410) → 2');
