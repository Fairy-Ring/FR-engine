import fs from 'fs';
import net from 'node:net';

import forge from 'node-forge';

import Packet from '#/io/Packet.js';
import Js5FileStore from '#/io/Js5FileStore.js';
import { JS5_HELLO_P1, parseJs5Hello, replyByte } from '#/io/Js5Hello.js';
import { encodeJs5Group410 } from '#/io/Js5Reply410.js';
import { parseJs5Request410 } from '#/io/Js5Request410.js';
import Isaac from '#/io/Isaac.js';
import { parseLogin410Inner } from '#/io/Login410Inner.js';
import { LOGIN_OUTER_FRESH, LOGIN_OUTER_RECONNECT, LOGIN_REPLY_OK, LOGIN_REPLY_OUTOFDATE, parseLogin410Prelude } from '#/io/Login410Prelude.js';

const PORT = Number(process.argv[2] ?? 43596);
const HOST = process.argv[4] ?? '0.0.0.0';
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
    let mode: 'js5' | 'js5-xfer' | 'login' | 'open14' | 'isaac' | null = null;
    let decryptor: Isaac | null = null;

    // Client may reset a socket mid-burst; the process must stay up.
    sock.on('error', (e: NodeJS.ErrnoException) => {
        console.log(`sock error ${e.code}`);
    });
    sock.on('close', () => {
        console.log('sock close');
    });

    // Client registers a request in its pending map after its own 4-byte write
    // returns; a reply in the same tick can hit an unregistered job. Space
    // group replies >= 5 ms apart, one queue per socket.
    const replyQueue: Buffer[] = [];
    let flushing = false;
    const enqueue = (frame: Buffer): void => {
        replyQueue.push(frame);
        if (flushing) {
            return;
        }
        flushing = true;
        const flush = (): void => {
            if (sock.destroyed) {
                flushing = false;
                return;
            }
            const next = replyQueue.shift();
            if (next === undefined) {
                flushing = false;
                return;
            }
            sock.write(next);
            setTimeout(flush, 5);
        };
        flush();
    };

    const consumeIsaac = (): void => {
        while (n >= 1 && decryptor) {
            const cur = Buffer.concat(chunks);
            const b = cur[0];
            console.log(`login isaac opcode=${(b - decryptor.nextInt()) & 0xff}`);
            chunks.length = 0;
            const left = cur.subarray(1);
            if (left.length > 0) {
                chunks.push(left);
            }
            n = left.length;
        }
    };

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
                const p1 = cur[0];
                // After hello the client writes p1(2) or p1(3) + 3 zero bytes
                // (Static41.method787). Not a group request. Do not destroy.
                if (p1 === 2 || p1 === 3 || p1 === 4) {
                    console.log(`js5 ctrl p1=${p1}`);
                    chunks.length = 0;
                    const left = cur.subarray(4);
                    if (left.length > 0) {
                        chunks.push(left);
                    }
                    n = left.length;
                    continue;
                }
                const r = parseJs5Request410(cur.subarray(0, 4));
                if (r.kind === 'bad-shape') {
                    console.log(`js5 bad p1=${p1}`);
                    sock.destroy();
                    return;
                }
                console.log(`js5 req p1=${r.p1} archive=${r.archive} group=${r.group}`);
                // 0xFF00FF: CRC table for archives 0..255 (Static32 aLong152 == 16711935).
                // Not a real idx255 group.
                let blob: Uint8Array | null;
                if (r.archive === 255 && r.group === 255) {
                    const crcs = Buffer.alloc(1024);
                    for (let i = 0; i < 256; i++) {
                        const tab = store.read(255, i);
                        const crc = tab ? Packet.getcrc(tab, 0, tab.length) : 0;
                        crcs.writeInt32BE(crc, i * 4);
                    }
                    const inner = Buffer.alloc(5 + 1024);
                    inner[0] = 0;
                    inner.writeUInt32BE(1024, 1);
                    crcs.copy(inner, 5);
                    blob = new Uint8Array(inner);
                    console.log('js5 255/255 crc table');
                    // Client adds the 0xFF00FF job to the pending map after the
                    // 4-byte write returns. Reply too soon → IOException, retry.
                } else {
                    blob = store.read(r.archive, r.group);
                }
                if (blob === null) {
                    console.log(`js5 miss archive=${r.archive} group=${r.group}`);
                    replyQueue.length = 0;
                    sock.destroy();
                    return;
                }
                enqueue(encodeJs5Group410(r.archive, r.group, blob));
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
            seed.writeUInt32BE(Math.floor(Math.random() * 0xffffffff), 0);
            seed.writeUInt32BE(Math.floor(Math.random() * 0xffffffff), 4);
            sock.write(Buffer.concat([Buffer.from([0]), seed]));
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

        if (mode === 'isaac') {
            consumeIsaac();
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
            console.log('login crcs ' + result.crcs.join(' '));
            const payload = framed.subarray(1);
            const inner = parseLogin410Inner(payload.subarray(53), pem);
            if (inner.kind === 'bad-inner') {
                sock.destroy();
                return;
            }
            console.log(`login uid=${inner.uid} name=${inner.username}`);
            decryptor = new Isaac(inner.seeds);
            const encryptor = new Isaac(inner.seeds.map(s => s + 50));
            // w9 trailer: g1 t, g1 flag, g2 player, g1 bb, g1 isaac start, g2 follow-len (zero stub)
            sock.write(Buffer.from([LOGIN_REPLY_OK, 0, 0, 0, 0, 0, 0, 0, 0]));
            const out = (0 + encryptor.nextInt()) & 0xff;
            sock.write(Buffer.from([out]));
            console.log('login isaac out=0');
            // consume the framed outer; leftover bytes are the first isaac bytes
            const rest = buf.subarray(2 + len);
            chunks.length = 0;
            if (rest.length > 0) {
                chunks.push(rest);
            }
            n = rest.length;
            mode = 'isaac';
            consumeIsaac();
        } else {
            sock.write(Buffer.from([LOGIN_REPLY_OUTOFDATE]));
            sock.end();
        }
    });
});

server.listen(PORT, HOST, () => {
    console.log(`410 listen ${HOST}:${PORT}`);
});
