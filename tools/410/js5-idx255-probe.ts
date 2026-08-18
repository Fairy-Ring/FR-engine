import net from 'node:net';
import path from 'node:path';

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

// One socket: hello, then [1, 255, g>>8, g] for g=0..11 in order; every reply
// must be byte-equal to encodeJs5Group410(255, g, store blob).
function fetchGroups(host: string, port: number, reqs: [number, Buffer][]): Promise<string | null> {
    return new Promise(resolve => {
        const s = net.connect({ host, port }, () => s.write(hello(JS5_REV)));
        let settled = false;
        let acc: Buffer[] = [];
        let total = 0;
        let sent = 0; // number of requests written
        let verified = 0; // number of replies verified
        const finish = (err: string | null) => {
            if (settled) return;
            settled = true;
            s.destroy();
            resolve(err);
        };
        const awaiting = () => (verified < sent ? reqs[verified][1] : reqs[reqs.length - 1][1]);
        const pump = () => {
            while (verified < sent && total >= reqs[verified][1].length) {
                const want = reqs[verified][1];
                const buf = Buffer.concat(acc);
                if (!buf.subarray(0, want.length).equals(want)) {
                    finish(`group 255/${reqs[verified][0]} bytes differ from store encode`);
                    return;
                }
                acc = [buf.subarray(want.length)];
                total = buf.length - want.length;
                verified += 1;
            }
            if (settled) return;
            if (verified === reqs.length) {
                finish(null);
                return;
            }
            if (sent === verified) {
                const g = reqs[verified][0];
                s.write(Buffer.from([1, 255, (g >> 8) & 0xff, g & 0xff]));
                sent += 1;
            }
        };
        s.setTimeout(30000);
        s.on('data', d => {
            if (settled) return;
            acc.push(d);
            total += d.length;
            if (sent === 0) {
                const buf = Buffer.concat(acc);
                if (buf[0] !== JS5_REPLY_CONTINUE) {
                    finish(`hello reply=${buf[0]} want ${JS5_REPLY_CONTINUE}`);
                    return;
                }
                acc = [buf.subarray(1)];
                total = buf.length - 1;
            }
            pump();
        });
        s.on('close', () => {
            if (!settled) {
                finish(sent === 0 ? 'closed before hello reply' : `closed with ${total}/${awaiting().length} group bytes`);
            }
        });
        s.on('timeout', () => finish(`timeout after ${total}/${awaiting().length} group bytes`));
        s.on('error', e => finish(`error: ${e.message}`));
    });
}

const host = process.argv[2] ?? '127.0.0.1';
const port = Number(process.argv[3] ?? 43596);
const cacheDir = process.argv[4] ?? (process.env.LC377_ROOT ? path.join(process.env.LC377_ROOT, 'cache', 'openrs2-410', 'disk', 'cache') : null);
if (!cacheDir) {
    throw new Error('cache dir required: argv[4] or LC377_ROOT');
}

const store = new Js5FileStore(cacheDir);
const reqs: [number, Buffer][] = [];
for (let g = 0; g <= 11; g++) {
    const blob = store.read(255, g);
    if (blob === null) {
        console.error(`FAIL cannot read 255/${g} from ${cacheDir}`);
        process.exit(1);
    }
    reqs.push([g, encodeJs5Group410(255, g, blob)]);
}

const err = await fetchGroups(host, port, reqs);
if (err !== null) {
    console.error(`FAIL ${err}`);
    process.exit(1);
}
console.log('PASS js5 idx255 groups 0-11 same socket');
