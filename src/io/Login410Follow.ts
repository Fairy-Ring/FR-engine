import Packet from '#/io/Packet.js';

export const LOGIN_FOLLOW_LEN = 153;

export function encodeLogin410Follow(): Uint8Array {
    const p = Packet.alloc(1);
    p.ip2(54); // method1705 LE g2
    for (let i = 0; i < 9; i++) {
        // key block: 4x BE g4 (method1728)
        p.p4(0);
        p.p4(0);
        p.p4(0);
        p.p4(0);
    }
    p.ip2(402); // local36 zoneZ (method1705)
    p.ip2(50); // local62 (method1705)
    p.p1(128); // level 0 (method1715: 128 - level)
    p.p2(402); // local72 zoneX (method1704 BE g2)
    return p.data.subarray(0, p.pos);
}
