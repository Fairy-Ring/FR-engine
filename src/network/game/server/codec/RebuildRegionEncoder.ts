import Packet from '#/io/Packet.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameProt from '#/network/game/server/ServerGameProt.js';
import RebuildRegion from '#/network/game/server/model/RebuildRegion.js';

export default class RebuildRegionEncoder extends ServerGameMessageEncoder<RebuildRegion> {
    prot = ServerGameProt.REBUILD_REGION;

    encode(buf: Packet, message: RebuildRegion): void {
        buf.p2_alt2(message.zoneX);
        buf.bitStart();
        for (let level: number = 0; level < 4; level++) {
            for (let y: number = 0; y < 13; y++) {
                for (let x: number = 0; x < 13; x++) {
                    const key: number = message.keys[level][y][x];
                    if (key !== -1) {
                        buf.pBit(1, 1);
                        buf.pBit(26, key);
                    } else {
                        buf.pBit(1, 0);
                    }
                }
            }
        }
        buf.bitEnd();
        buf.p2_alt2(message.zoneZ);
    }

    test(message: RebuildRegion): number {
        let bits: number = 0;
        for (let level: number = 0; level < 4; level++) {
            for (let y: number = 0; y < 13; y++) {
                for (let x: number = 0; x < 13; x++) {
                    bits += message.keys[level][y][x] !== -1 ? 27 : 1;
                }
            }
        }
        return 4 + Math.ceil(bits / 8);
    }
}
