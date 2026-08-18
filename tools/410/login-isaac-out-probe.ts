import net from 'node:net';

import Isaac from '#/io/Isaac.js';
import { LOGIN_REPLY_OK, LOGIN_REV } from '#/io/Login410Prelude.js';
import { loginOuter410 } from './login-outer410.js';

// same seeds login-outer410 writes, then +50
const enc = new Isaac([1, 2, 3, 4].map(s => s + 50));

const fails: string[] = [];

function run(host: string, port: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
        let done = false;
        const s = net.connect({ host, port }, () => s.write(loginOuter410(LOGIN_REV)));
        s.setTimeout(2000);
        const chunks: Buffer[] = [];
        s.on('data', (d: Buffer) => {
            chunks.push(d);
            const buf = Buffer.concat(chunks);
            if (buf.length < 10) {
                return;
            }
            const head = buf.subarray(0, 10);
            if (head[0] !== LOGIN_REPLY_OK) {
                fails.push(`reply[0]=${head[0]} want ${LOGIN_REPLY_OK}`);
            }
            for (let i = 1; i < 9; i++) {
                if (head[i] !== 0) {
                    fails.push(`trailer byte ${i}=${head[i]} want 0`);
                }
            }
            const decoded = (head[9] - enc.nextInt()) & 0xff;
            if (decoded !== 0) {
                fails.push(`isaac out decoded=${decoded} want 0`);
            }
            s.end();
            done = true;
            resolve(fails);
        });
        s.on('close', () => {
            if (!done) {
                fails.push('closed before 10-byte reply');
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

const got = await run(host, port);
fails.push(...got);

if (fails.length) {
    for (const f of fails) {
        console.error(`FAIL ${f}`);
    }
    process.exit(1);
}
console.log('PASS login isaac out=0');
