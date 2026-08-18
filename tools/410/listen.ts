import fs from 'fs';
import net from 'node:net';

import forge from 'node-forge';

import Js5FileStore from '#/io/Js5FileStore.js';
import { JS5_HELLO_P1, parseJs5Hello, replyByte } from '#/io/Js5Hello.js';
import { encodeJs5Group410 } from '#/io/Js5Reply410.js';
import { parseJs5Request410 } from '#/io/Js5Request410.js';
import Isaac from '#/io/Isaac.js';
import { parseLogin410Inner } from '#/io/Login410Inner.js';
import { LOGIN_OUTER_FRESH, LOGIN_OUTER_RECONNECT, LOGIN_REPLY_OK, LOGIN_REPLY_OUTOFDATE, parseLogin410Prelude } from '#/io/Login410Prelude.js';

const PORT = Number(process.argv[2] ?? 43596);
const HOST = '127.0.0.1';
const CACHE_DIR = process.argv[3];

if (!CACHE_DIR) {
    throw new Error('usage: listen.ts [port] <cache-dir>');
}

const pem = forge.pki.privateKeyFromPem(fs.readFileSync('data/config/private.pem', 'ascii'));

const store = new Js5FileStore(CACHE_DIR);

if (store.count(255) !== 12) {
    throw new Error(`store census failed: idx255 count=${store.count(255)} want 12`);
}
for (let i = 0; i <= 11; i++) {
    const blob = store.read(255, i);
    if (!blob || blob.length === 0) {
        throw new Error(`store census failed: idx255 group ${i} unreadable`);
    }
}
console.log('PASS store 12 archives; maps=5');

const server = net.createServer(sock => {
    const chunks: Buffer[] = [];
    let n = 0;
    let mode: 'js5' | 'js5-xfer' | 'login' | 'open14' | null = null;

    sock.on('data', (c: Buffer) => {
        chunks.push(c);
        n += c.length;
        const buf = Buffer.concat(chunks);

        if (mode === null) {
            if (buf[0] === JS5_HELLO_P1) {
                mode = 'js5';
            } else if (buf[0] === LOGIN_OUTER_FRESH || buf[0] === LOGIN_OUTER_RECONNECT) {
                mode = 'login';
            } else if (buf[0] === 14) {
                mode = 'open14';
            } else {
                sock.destroy();
                return;
            }
        }

        if (mode === 'js5') {
            if (n < 5) {
                return;
            }
            const result = parseJs5Hello(buf.subarray(0, 5));
            const b = replyByte(result);
            if (b === null) {
                sock.destroy();
                return;
            }
            sock.write(Buffer.from([b]));
            if (result.kind !== 'ok') {
                sock.end();
                return;
            }
            // hello ok: later bytes are 4-byte requests, never a second hello
            mode = 'js5-xfer';
            chunks.length = 0;
            const rest = buf.subarray(5);
            if (rest.length > 0) {
                chunks.push(rest);
            }
            n = rest.length;
        }

        if (mode === 'js5-xfer') {
            while (n >= 4) {
                const cur = Buffer.concat(chunks);
                const r = parseJs5Request410(cur.subarray(0, 4));
                if (r.kind === 'bad-shape') {
                    sock.destroy();
                    return;
                }
                console.log(`js5 req p1=${r.p1} archive=${r.archive} group=${r.group}`);
                const blob = store.read(r.archive, r.group);
                if (blob === null) {
                    sock.destroy();
                    return;
                }
                sock.write(encodeJs5Group410(r.archive, r.group, blob));
                chunks.length = 0;
                const left = cur.subarray(4);
                if (left.length > 0) {
                    chunks.push(left);
                }
                n = left.length;
            }
            return;
        }

        if (mode === 'open14') {
            if (n < 2) {
                return;
            }
            const seed = Buffer.alloc(8);
            seed.writeUInt32BE(Math.floor(Math.random() * 0x00ffffff), 0);
            seed.writeUInt32BE(Math.floor(Math.random() * 0xffffffff), 4);
            sock.write(Buffer.concat([Buffer.alloc(8), Buffer.from([0]), seed]));
            // leave open; a later packet on the same socket may be 16/18
            const rest = buf.subarray(2);
            chunks.length = 0;
            if (rest.length > 0) {
                chunks.push(rest);
            }
            n = rest.length;
            mode = null;
            return;
        }

        if (n < 2) {
            return;
        }
        const len = buf[1];
        if (n < 2 + len) {
            return;
        }
        const framed = buf.subarray(1, 2 + len); // [len][payload]
        const result = parseLogin410Prelude(buf[0], framed);
        if (result.kind === 'bad-shape') {
            sock.destroy();
            return;
        }
        if (result.kind === 'ok') {
            const payload = framed.subarray(1);
            const inner = parseLogin410Inner(payload.subarray(53), pem);
            if (inner.kind === 'bad-inner') {
                sock.destroy();
                return;
            }
            console.log('login seeds ' + inner.seeds.join(' '));
            // ctor proof only; streams start in a later unit, no player attach
            new Isaac(inner.seeds);
            new Isaac(inner.seeds.map(s => s + 50));
            // w9 trailer: g1 t, g1 flag, g2 player, g1 bb, g1 isaac start, g2 follow-len (zero stub)
            sock.write(Buffer.from([LOGIN_REPLY_OK, 0, 0, 0, 0, 0, 0, 0, 0]));
        } else {
            sock.write(Buffer.from([LOGIN_REPLY_OUTOFDATE]));
            sock.end();
        }
    });
});

server.listen(PORT, HOST, () => {
    console.log(`410 listen ${HOST}:${PORT}`);
});
