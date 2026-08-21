import Packet from '#/io/Packet.js';
import RebuildRegionEncoder from '#/network/game/server/codec/RebuildRegionEncoder.js';
import RebuildRegion, { packRegionTemplate, type RegionTemplate } from '#/network/game/server/model/RebuildRegion.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        throw new Error(msg);
    }
}

const srcTileX = (38 << 6) | 56; // zone-aligned SW of an 8x8 in m38_77
const srcTileZ = (77 << 6) | 40;
const packed = packRegionTemplate({
    level: 1,
    zoneX: 0,
    zoneZ: 0,
    sourceLevel: 0,
    sourceZoneX: srcTileX >> 3,
    sourceZoneZ: srcTileZ >> 3,
    rotation: 2
});
assert(((packed >> 24) & 0x3) === 0, 'srcLevel');
assert(((packed >> 14) & 0x3ff) === srcTileX >> 3, 'mapX is source 8x8 zone X');
assert(((packed >> 3) & 0x7ff) === srcTileZ >> 3, 'mapZ is source 8x8 zone Z');
assert(((packed >> 1) & 0x3) === 2, 'rotation');
assert(packed === ((0 << 24) | ((srcTileX >> 3) << 14) | ((srcTileZ >> 3) << 3) | (2 << 1)), '26-bit formula');

// keys[1][6][7] in the 13×13 window = centre zoneZ, centre+1 zoneX.
const present: RegionTemplate = {
    level: 1,
    zoneX: 807 + 1,
    zoneZ: 1234,
    sourceLevel: 0,
    sourceZoneX: srcTileX >> 3,
    sourceZoneZ: srcTileZ >> 3,
    rotation: 2
};
const message = new RebuildRegion(807, 1234, [present]);
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
            const flag = buf.gBit(1);
            if (level === 1 && y === 6 && x === 7) {
                assert(flag === 1, 'present bit');
                const key = buf.gBit(26);
                assert(key === packed, '26-bit key round-trip');
            } else {
                assert(flag === 0, `absent ${level},${y},${x}`);
            }
        }
    }
}
buf.bitEnd();
assert(buf.g2_alt2() === 1234, 'zoneZ g2_alt2');

const empty = new RebuildRegion(0, 0, []);
const emptyBits = 4 * 13 * 13;
assert(new RebuildRegionEncoder().test(empty) === 4 + Math.ceil(emptyBits / 8), 'all-absent size');

assert(ServerGameProt.REBUILD_REGION.id === 53, 'ptype 53');
assert(ServerGameProt.REBUILD_REGION.length === -2, 'Client-Java SERVERPROT_LENGTH[53]=-2 (g2), not g1');
assert(encoder.prot.length === -2, 'encoder prot is -2');

// Realistic dest: 8×8 zones × 4 levels present in the 13×13 window (RD m38_77 copy).
const dense: RegionTemplate[] = [];
for (let level = 0; level < 4; level++) {
    for (let y = 3; y < 11; y++) {
        for (let x = 3; x < 11; x++) {
            dense.push({
                level,
                zoneX: 1607 + (x - 6),
                zoneZ: 1605 + (y - 6),
                sourceLevel: level,
                sourceZoneX: ((38 << 6) | ((x & 7) << 3)) >> 3,
                sourceZoneZ: ((77 << 6) | ((y & 7) << 3)) >> 3,
                rotation: 0
            });
        }
    }
}
const denseMsg = new RebuildRegion(1607, 1605, dense);
const denseLen = encoder.test(denseMsg);
assert(denseLen > 255, `dense payload ${denseLen} must not use g1 size`);
const denseBuf = Packet.alloc(1);
encoder.encode(denseBuf, denseMsg);
assert(denseBuf.pos === denseLen, 'dense test() matches encode pos');

const frame = Packet.alloc(1);
frame.p1(ServerGameProt.REBUILD_REGION.id);
frame.pos += 2;
const start = frame.pos;
encoder.encode(frame, denseMsg);
frame.psize2(frame.pos - start);
frame.pos = 1;
assert(frame.g2() === denseLen, 'client g2 size reads full payload');
assert(frame.g2_alt2() === 1607, 'zoneX after g2 size');

// PR 95 first slot is m101_1 (tile z=64), not mz 0. Dest local 44 stays north of world edge.
const destMz0Z = (0 << 6) | 44;
assert(((destMz0Z >> 3) - 6) << 3 < 0, 'mz 0 local 44 is the headed-FAIL home');
const destFirstSlotZ = (1 << 6) | 44; // InstanceController FIRST_INSTANCE_SW mz=1
assert(((destFirstSlotZ >> 3) - 6) << 3 > 0, 'mz 1 local 44 keeps mapBuildBaseZ positive');

console.log('RebuildRegionEncoder bit layout ok');
