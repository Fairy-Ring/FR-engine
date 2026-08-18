import net from 'node:net';

import { LOGIN_REPLY_CONTINUE, LOGIN_REPLY_OUTOFDATE, parseLogin410Prelude } from '#/io/Login410Prelude.js';

const PORT = Number(process.argv[2] ?? 43596);
const HOST = '127.0.0.1';

const server = net.createServer(sock => {
    const chunks: Buffer[] = [];
    let n = 0;
    sock.on('data', (c: Buffer) => {
        chunks.push(c);
        n += c.length;
        if (n < 2) {
            return;
        }
        const buf = Buffer.concat(chunks);
        const opcode = buf[0];
        const len = buf[1];
        if (n < 2 + len) {
            return;
        }
        const framed = buf.subarray(1, 2 + len); // [len][payload]
        const result = parseLogin410Prelude(opcode, framed);
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
    console.log(`login-prelude listen ${HOST}:${PORT}`);
});
