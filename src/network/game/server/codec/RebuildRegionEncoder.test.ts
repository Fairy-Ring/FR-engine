import Packet from '#/io/Packet.js';
import RebuildRegionEncoder from '#/network/game/server/codec/RebuildRegionEncoder.js';
import RebuildRegion, { packRebuildRegionKey } from '#/network/game/server/model/RebuildRegion.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';

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

assert(ServerGameProt.REBUILD_REGION.id === 53, 'ptype 53');
assert(ServerGameProt.REBUILD_REGION.length === -2, 'Client-Java SERVERPROT_LENGTH[53]=-2 (g2), not g1');
assert(encoder.prot.length === -2, 'encoder prot is -2');

// Realistic dest: 8×8 zones × 4 levels present in the 13×13 window (RD m38_77 copy).
const dense = emptyKeys();
let present = 0;
for (let level = 0; level < 4; level++) {
    for (let y = 3; y < 11; y++) {
        for (let x = 3; x < 11; x++) {
            dense[level][y][x] = packRebuildRegionKey(level, (38 << 6) | ((x & 7) << 3), (77 << 6) | ((y & 7) << 3), 0);
            present++;
        }
    }
}
const denseMsg = new RebuildRegion(1607, 1605, dense);
const denseLen = encoder.test(denseMsg);
assert(denseLen > 255, `dense payload ${denseLen} must not use g1 size`);
const denseBuf = Packet.alloc(1);
encoder.encode(denseBuf, denseMsg);
assert(denseBuf.pos === denseLen, 'dense test() matches encode pos');

// Frame like NetworkPlayer.writeInner for length -2, then client g2 size.
const frame = Packet.alloc(1);
frame.p1(ServerGameProt.REBUILD_REGION.id);
frame.pos += 2;
const start = frame.pos;
encoder.encode(frame, denseMsg);
frame.psize2(frame.pos - start);
frame.pos = 1;
assert(frame.g2() === denseLen, 'client g2 size reads full payload');
assert(frame.g2_alt2() === 1607, 'zoneX after g2 size');

// dest mz 0 + local 44 → world z 44; client mapBuildBaseZ = (zoneZ-6)*8 is negative.
const destMz0Z = (0 << 6) | 44;
assert(((destMz0Z >> 3) - 6) << 3 < 0, 'mz 0 local 44 is the headed-FAIL home');
const destMzHighZ = (200 << 6) | 44;
assert(((destMzHighZ >> 3) - 6) << 3 > 0, 'mz 200 local 44 keeps mapBuildBaseZ positive');

console.log('RebuildRegionEncoder bit layout ok');
