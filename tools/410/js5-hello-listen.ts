import net from 'node:net';

import { parseJs5Hello, replyByte } from '#/io/Js5Hello.js';

const PORT = Number(process.argv[2] ?? 43596);
const HOST = '127.0.0.1';

const server = net.createServer(sock => {
    const chunks: Buffer[] = [];
    let n = 0;
    sock.on('data', (c: Buffer) => {
        chunks.push(c);
        n += c.length;
        if (n < 5) {
            return;
        }
        const buf = Buffer.concat(chunks).subarray(0, 5);
        const result = parseJs5Hello(buf);
        const b = replyByte(result);
        if (b === null) {
            sock.destroy();
            return;
        }
        sock.write(Buffer.from([b]));
        if (result.kind !== 'ok') {
            sock.end();
        }
    });
});

server.listen(PORT, HOST, () => {
    console.log(`js5-hello listen ${HOST}:${PORT}`);
});
