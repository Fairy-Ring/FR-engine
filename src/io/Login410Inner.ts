import Packet from '#/io/Packet.js';
import type forge from 'node-forge';
type PrivateKey = forge.pki.rsa.PrivateKey;

export function parseLogin410Inner(after53: Uint8Array, pem: PrivateKey): { kind: 'ok' } | { kind: 'bad-inner' } {
    if (after53.length < 2) {
        return { kind: 'bad-inner' };
    }
    try {
        const p = new Packet(after53);
        p.rsadec(pem);
        if (p.g1() !== 10) {
            return { kind: 'bad-inner' };
        }
        return { kind: 'ok' };
    } catch {
        return { kind: 'bad-inner' };
    }
}
