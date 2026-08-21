import Packet from '#/io/Packet.js';
import RebuildRegionEncoder from '#/network/game/server/codec/RebuildRegionEncoder.js';
import RebuildRegion, { packRebuildRegionKey } from '#/network/game/server/model/RebuildRegion.js';

function emptyKeys(): number[][][] {
    const keys: number[][][] = new Array(4);
    for (let level: number = 0; level < 4; level++) {
        keys[level] = new Array(13);
        for (let y: number = 0; y < 13; y++) {
            keys[level][y] = new Array(13);
            for (let x: number = 0; x < 13; x++) {
                keys[level][y][x] = -1;
            }
        }
    }
    return keys;
}

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        throw new Error(msg);
    }
}

const srcTileX = (38 << 6) | 56; // zone-aligned SW of an 8x8 in m38_77
const srcTileZ = (77 << 6) | 40;
const packed = packRebuildRegionKey(0, srcTileX, srcTileZ, 2);
assert(((packed >> 24) & 0x3) === 0, 'srcLevel');
assert(((packed >> 14) & 0x3ff) === srcTileX >> 3, 'mapX is source 8x8 zone X');
assert(((packed >> 3) & 0x7ff) === srcTileZ >> 3, 'mapZ is source 8x8 zone Z');
assert(((packed >> 1) & 0x3) === 2, 'rotation');
assert(packed === ((0 << 24) | ((srcTileX >> 3) << 14) | ((srcTileZ >> 3) << 3) | (2 << 1)), '26-bit formula');

const keys = emptyKeys();
keys[1][6][7] = packed;
const message = new RebuildRegion(807, 1234, keys);
const encoder = new RebuildRegionEncoder();
const buf = Packet.alloc(1);
encoder.encode(buf, message);
assert(buf.pos === encoder.test(message), `test()=${encoder.test(message)} pos=${buf.pos}`);

buf.pos = 0;
assert(buf.g2_alt2() === 807, 'zoneX g2_alt2');
buf.bitStart();
for (let level: number = 0; level < 4; level++) {
    for (let y: number = 0; y < 13; y++) {
        for (let x: number = 0; x < 13; x++) {
            const present = buf.gBit(1);
            if (level === 1 && y === 6 && x === 7) {
                assert(present === 1, 'present bit');
                const key = buf.gBit(26);
                assert(key === packed, '26-bit key round-trip');
            } else {
                assert(present === 0, `absent ${level},${y},${x}`);
            }
        }
    }
}
buf.bitEnd();
assert(buf.g2_alt2() === 1234, 'zoneZ g2_alt2');

const empty = new RebuildRegion(0, 0, emptyKeys());
const emptyBits = 4 * 13 * 13;
assert(new RebuildRegionEncoder().test(empty) === 4 + Math.ceil(emptyBits / 8), 'all-absent size');

console.log('RebuildRegionEncoder bit layout ok');
