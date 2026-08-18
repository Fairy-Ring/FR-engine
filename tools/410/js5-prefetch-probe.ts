import net from 'node:net';

import Js5FileStore from '#/io/Js5FileStore.js';
import { JS5_HELLO_P1, JS5_REPLY_CONTINUE, JS5_REV } from '#/io/Js5Hello.js';
import { encodeJs5Group410 } from '#/io/Js5Reply410.js';

function p4(n: number): Buffer {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return b;
}

function hello(rev: number): Buffer {
    return Buffer.concat([Buffer.from([JS5_HELLO_P1]), p4(rev)]);
}

// One socket: hello, then [0, 255, 0, 0] (prefetch p1=0); the reply must be
// byte-equal to encodeJs5Group410(255, 0, store blob) — same framing as p1=1.
function fetchGroup(host: string, port: number, want: Buffer): Promise<string | null> {
    return new Promise(resolve => {
        const s = net.connect({ host, port }, () => s.write(hello(JS5_REV)));
        let sent = false;
        let settled = false;
        let acc: Buffer[] = [];
        let total = 0;
        const finish = (err: string | null) => {
            if (settled) return;
            settled = true;
            s.destroy();
            resolve(err);
        };
        const check = () => {
            if (total < want.length) return;
            const buf = Buffer.concat(acc);
            if (buf.subarray(0, want.length).equals(want)) {
                finish(null);
            } else {
                finish('group bytes differ from store encode');
            }
        };
        s.setTimeout(10000);
        s.on('data', d => {
            acc.push(d);
            total += d.length;
            if (!sent) {
                const buf = Buffer.concat(acc);
                if (buf[0] !== JS5_REPLY_CONTINUE) {
                    finish(`hello reply=${buf[0]} want ${JS5_REPLY_CONTINUE}`);
                    return;
                }
                sent = true;
                acc = [buf.subarray(1)];
                total = buf.length - 1;
                s.write(Buffer.from([0, 255, 0, 0]));
                check();
                return;
            }
            check();
        });
        s.on('close', () => {
            if (!settled) {
                finish(sent ? `closed with ${total}/${want.length} group bytes` : 'closed before hello reply');
            }
        });
        s.on('timeout', () => finish(`timeout after ${total}/${want.length} group bytes`));
        s.on('error', e => finish(`error: ${e.message}`));
    });
}

const host = process.argv[2] ?? '127.0.0.1';
const port = Number(process.argv[3] ?? 43596);
const cacheDir = process.argv[4];
if (!cacheDir) {
    throw new Error('cache dir required: argv[4] (no env)');
}

const store = new Js5FileStore(cacheDir);
const blob = store.read(255, 0);
if (blob === null) {
    console.error(`FAIL cannot read 255/0 from ${cacheDir}`);
    process.exit(1);
}
const want = encodeJs5Group410(255, 0, blob);

const err = await fetchGroup(host, port, want);
if (err !== null) {
    console.error(`FAIL ${err}`);
    process.exit(1);
}
console.log('PASS js5 prefetch p1=0 255/0 framed');
