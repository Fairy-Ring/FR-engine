import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import RebuildRegion, { packRegionTemplate } from '#/network/game/server/model/RebuildRegion.js';

export default class RebuildRegionEncoder extends ServerGameMessageEncoder<RebuildRegion> {
    prot = ServerGameProt.REBUILD_REGION;

    encode(buf: Packet, message: RebuildRegion): void {
        // 377 packet 53 decode order:
        // 1) zoneX (g2_alt2)
        // 2) bit access: 4*13*13 flags + optional 26-bit templates
        // 3) zoneZ (g2_alt2) after accessBytes
        // No per-mapsquare key blocks are read by this client.
        buf.p2_alt2(message.zoneX);

        const templateByZone = new Map<number, number>();
        for (const template of message.templates) {
            const key = (template.level << 22) | ((template.zoneX & 0x7ff) << 11) | (template.zoneZ & 0x7ff);
            templateByZone.set(key, packRegionTemplate(template));
        }

        buf.bitStart();

        // Client-TS sceneMapRegion[level][y][x]: Java method16 destX = chunkY*8, destZ = chunkX*8.
        // y is dest zoneX, x is dest zoneZ. PR 95 X-outer matches that. Headed 7315 at
        // local 55,4 (delta-swap of dest-from-maps 23,36) was Z-outer.
        for (let level = 0; level < 4; level++) {
            for (let zoneX = message.zoneX - 6; zoneX <= message.zoneX + 6; zoneX++) {
                for (let zoneZ = message.zoneZ - 6; zoneZ <= message.zoneZ + 6; zoneZ++) {
                    const key = (level << 22) | ((zoneX & 0x7ff) << 11) | (zoneZ & 0x7ff);
                    const packed = templateByZone.get(key);

                    if (packed === undefined) {
                        buf.pBit(1, 0);
                    } else {
                        buf.pBit(1, 1);
                        buf.pBit(26, packed);
                    }
                }
            }
        }

        buf.bitEnd();

        buf.p2_alt2(message.zoneZ);
    }

    test(message: RebuildRegion): number {
        const templateByZone = new Set<number>();
        for (const template of message.templates) {
            templateByZone.add((template.level << 22) | ((template.zoneX & 0x7ff) << 11) | (template.zoneZ & 0x7ff));
        }

        let bits = 0;
        for (let level = 0; level < 4; level++) {
            for (let zoneX = message.zoneX - 6; zoneX <= message.zoneX + 6; zoneX++) {
                for (let zoneZ = message.zoneZ - 6; zoneZ <= message.zoneZ + 6; zoneZ++) {
                    const key = (level << 22) | ((zoneX & 0x7ff) << 11) | (zoneZ & 0x7ff);
                    bits += templateByZone.has(key) ? 27 : 1;
                }
            }
        }
        return 4 + Math.ceil(bits / 8);
    }
}
