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

const host = process.argv[2] ?? '127.0.0.1';
const port = Number(process.argv[3] ?? 43596);
const fails: string[] = [];

await new Promise<void>(resolve => {
    let done = false;
    const s = net.connect({ host, port }, () => s.write(hello(JS5_REV)));
    s.setTimeout(4000);
    let bytes = 0;
    let helloOk = false;
    s.on('data', (d: Buffer) => {
        if (!helloOk) {
            if (d[0] !== JS5_REPLY_CONTINUE) {
                fails.push(`hello reply=${d[0]} want ${JS5_REPLY_CONTINUE}`);
            }
            helloOk = true;
            s.write(Buffer.from([1, 5, 381 >> 8, 381 & 0xff])); // p1=1 archive=5 group=381
            return;
        }
        bytes += d.length;
    });
    s.on('close', () => {
        if (done) {
            return;
        }
        done = true;
        if (!helloOk) {
            fails.push('closed before hello reply');
        } else {
            fails.push('socket closed during hold');
        }
        resolve();
    });
    s.on('timeout', () => {
        if (done) {
            return;
        }
        done = true;
        if (!helloOk) {
            fails.push('timeout before hello reply');
        } else if (bytes !== 0) {
            fails.push(`hold sent ${bytes} bytes, want 0`);
        }
        s.destroy();
        resolve();
    });
    s.on('error', e => fails.push(`error: ${e.message}`));
});

if (fails.length) {
    for (const f of fails) {
        console.error(`FAIL ${f}`);
    }
    process.exit(1);
}
console.log('PASS js5 hold 5/381');
