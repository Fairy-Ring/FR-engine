import Packet from '#/io/Packet.js';
import type forge from 'node-forge';
type PrivateKey = forge.pki.rsa.PrivateKey;

export function parseLogin410Inner(after53: Uint8Array, pem: PrivateKey): { kind: 'ok'; seeds: number[] } | { kind: 'bad-inner' } {
    if (after53.length < 2) {
        return { kind: 'bad-inner' };
    }
    try {
        const p = new Packet(after53);
        p.rsadec(pem);
        if (p.g1() !== 10) {
            return { kind: 'bad-inner' };
        }
        const seeds: number[] = [];
        for (let i = 0; i < 4; i++) {
            seeds[i] = p.g4s();
        }
        return { kind: 'ok', seeds };
    } catch {
        return { kind: 'bad-inner' };
    }
}
