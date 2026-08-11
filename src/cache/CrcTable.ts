import Packet from '#/io/Packet.js';
import OnDemand from '#/engine/OnDemand.js';

export const CrcBuffer: Packet = new Packet(new Uint8Array(4 * 9 + 4));
export let CrcTable: number[] = [];
export let CrcBuffer32: number = 0;

export function makeCrcs() {
    CrcTable = [];

    CrcBuffer.pos = 0;

    const count = OnDemand.cache.count(0);
    for (let i = 0; i < count; i++) {
        const jag = OnDemand.cache.read(0, i);
        if (jag) {
            CrcTable[i] = Packet.getcrc(jag, 0, jag.length);
            CrcBuffer.p4(CrcTable[i]);
        } else {
            CrcTable[i] = 0;
            CrcBuffer.p4(0);
        }
    }

    // Must match Client.ts loadJagChecksums: ((hash << 1) + crc) | 0 each step (Java int32).
    // Without |0, intermediate values can diverge from the client self-check → "checksum problem".
    let hash = 1234;
    for (let i = 0; i < 9; i++) {
        hash = ((hash << 1) + (CrcTable[i] ?? 0)) | 0;
    }
    CrcBuffer.p4(hash);

    CrcBuffer32 = Packet.getcrc(CrcBuffer.data, 0, CrcBuffer.data.length - 4);
}
