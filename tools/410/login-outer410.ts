import fs from 'fs';

import forge from 'node-forge';

import Packet from '#/io/Packet.js';
import { LOGIN_OUTER_FRESH, LOGIN_TRAILER } from '#/io/Login410Prelude.js';

export function loginOuter410(rev: number): Buffer {
    const inner = Packet.alloc(1);
    inner.p1(10);
    inner.p4(1);
    inner.p4(2);
    inner.p4(3);
    inner.p4(4);
    inner.p4(0);
    inner.p8(0n);
    inner.p1(0); // NUL password
    const pem = forge.pki.privateKeyFromPem(fs.readFileSync('data/config/private.pem', 'ascii'));
    inner.rsaenc(pem);
    const cipher = Buffer.from(inner.data.subarray(0, inner.pos));

    const payload = Buffer.alloc(LOGIN_TRAILER + cipher.length);
    payload.writeInt32BE(rev, 0);
    payload[4] = 0;
    cipher.copy(payload, LOGIN_TRAILER);
    return Buffer.concat([Buffer.from([LOGIN_OUTER_FRESH, payload.length]), payload]);
}
