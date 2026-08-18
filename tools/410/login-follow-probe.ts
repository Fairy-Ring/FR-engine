import net from 'node:net';

import { encodeLogin410Follow, LOGIN_FOLLOW_LEN } from '#/io/Login410Follow.js';
import { LOGIN_REPLY_OK, LOGIN_REV } from '#/io/Login410Prelude.js';
import { loginOuter410 } from './login-outer410.js';

const fails: string[] = [];

function run(host: string, port: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
        let done = false;
        const s = net.connect({ host, port }, () => s.write(loginOuter410(LOGIN_REV)));
        s.setTimeout(3000);
        const chunks: Buffer[] = [];
        s.on('data', (d: Buffer) => {
            chunks.push(d);
            const buf = Buffer.concat(chunks);
            if (buf.length < 9 + LOGIN_FOLLOW_LEN) {
                return;
            }
            const head = buf.subarray(0, 9);
            const body = buf.subarray(9, 9 + LOGIN_FOLLOW_LEN);
            if (head[0] !== LOGIN_REPLY_OK) {
                fails.push(`reply[0]=${head[0]} want ${LOGIN_REPLY_OK}`);
            }
            for (let i = 1; i < 8; i++) {
                if (head[i] !== 0) {
                    fails.push(`trailer byte ${i}=${head[i]} want 0`);
                }
            }
            const followLen = (head[7] << 8) | head[8];
            if (followLen !== LOGIN_FOLLOW_LEN) {
                fails.push(`follow-len=${followLen} want ${LOGIN_FOLLOW_LEN}`);
            }
            const want = Buffer.from(encodeLogin410Follow());
            if (!body.equals(want)) {
                fails.push('follow body differs from encodeLogin410Follow()');
            }
            s.end();
            done = true;
            resolve(fails);
        });
        s.on('close', () => {
            if (!done) {
                fails.push('closed before 2+8+153 reply');
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
console.log('PASS login follow 153');
