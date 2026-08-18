import net from 'node:net';

import { JS5_HELLO_P1, parseJs5Hello, replyByte } from '#/io/Js5Hello.js';
import { LOGIN_OUTER_FRESH, LOGIN_OUTER_RECONNECT, LOGIN_REPLY_CONTINUE, LOGIN_REPLY_OUTOFDATE, parseLogin410Prelude } from '#/io/Login410Prelude.js';

const PORT = Number(process.argv[2] ?? 43596);
const HOST = '127.0.0.1';

const server = net.createServer(sock => {
    const chunks: Buffer[] = [];
    let n = 0;
    let mode: 'js5' | 'login' | 'open14' | null = null;

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
            }
            return;
        }

        if (mode === 'open14') {
            if (n < 2) {
                return;
            }
            const seed = Buffer.alloc(8);
            seed.writeInt32BE(Math.floor(Math.random() * 0x00ffffff), 0);
            seed.writeInt32BE(Math.floor(Math.random() * 0xffffffff), 4);
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
        const b = result.kind === 'ok' ? LOGIN_REPLY_CONTINUE : LOGIN_REPLY_OUTOFDATE;
        sock.write(Buffer.from([b]));
        if (result.kind !== 'ok') {
            sock.end();
        }
    });
});

server.listen(PORT, HOST, () => {
    console.log(`410 listen ${HOST}:${PORT}`);
});
