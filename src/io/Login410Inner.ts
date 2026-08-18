import Packet from '#/io/Packet.js';
import type forge from 'node-forge';
type PrivateKey = forge.pki.rsa.PrivateKey;

export function parseLogin410Inner(after53: Uint8Array, pem: PrivateKey): { kind: 'ok'; seeds: number[]; uid: number; username: bigint; password: string } | { kind: 'bad-inner' } {
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
        const uid = p.g4s();
        const username = p.g8();
        const password = p.gjstr(0);
        return { kind: 'ok', seeds, uid, username, password };
    } catch {
        return { kind: 'bad-inner' };
    }
}
