import net from 'node:net';

import { JS5_HELLO_P1, JS5_REPLY_CONTINUE, JS5_REV } from '#/io/Js5Hello.js';

function p4(n: number): Buffer {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return b;
}

function hello(rev: number): Buffer {
    return Buffer.concat([Buffer.from([JS5_HELLO_P1]), p4(rev)]);
}

// One socket: hello, then [1, 255, 0, 12] (group not in idx255, which has 12
// groups 0-11). The server must destroy the socket with no reply byte at all —
// not 0, not 6, not a missing-group status. Close or a 200ms hang with zero
// extra bytes passes; any byte after the request fails.
function probeMissing(host: string, port: number): Promise<string | null> {
    return new Promise(resolve => {
        const s = net.connect({ host, port }, () => s.write(hello(JS5_REV)));
        let settled = false;
        let helloOk = false;
        let extraBytes = 0;
        const finish = (err: string | null) => {
            if (settled) return;
            settled = true;
            s.destroy();
            resolve(err);
        };
        s.setTimeout(5000);
        s.on('data', d => {
            if (settled) return;
            if (!helloOk) {
                if (d[0] !== JS5_REPLY_CONTINUE) {
                    finish(`hello reply=${d[0]} want ${JS5_REPLY_CONTINUE}`);
                    return;
                }
                helloOk = true;
                extraBytes += d.length - 1;
                s.write(Buffer.from([1, 255, 0, 12]));
                setTimeout(() => {
                    finish(extraBytes === 0 ? null : `got ${extraBytes} byte(s) after missing 255/12`);
                }, 200);
                return;
            }
            extraBytes += d.length;
        });
        s.on('close', () => {
            if (!settled && !helloOk) {
                finish('closed before hello reply');
            }
        });
        s.on('timeout', () => {
            if (!settled) {
                finish(helloOk ? `timeout with ${extraBytes} extra byte(s)` : 'timeout before hello reply');
            }
        });
        s.on('error', e => finish(`error: ${e.message}`));
    });
}

const host = process.argv[2] ?? '127.0.0.1';
const port = Number(process.argv[3] ?? 43596);

const err = await probeMissing(host, port);
if (err !== null) {
    console.error(`FAIL ${err}`);
    process.exit(1);
}
console.log('PASS js5 missing 255/12 no status byte');
