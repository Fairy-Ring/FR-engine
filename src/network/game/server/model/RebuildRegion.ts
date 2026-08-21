import ServerGameMessage from '#/network/game/server/ServerGameMessage.js';

/**
 * 26-bit REBUILD_REGION chunk key. `mapX`/`mapZ` are the source 8×8's zone
 * coords (SW tile >> 3): client does `mx = mapX / 8`, local = `(mapX & 7) * 8`.
 */
export function packRebuildRegionKey(srcLevel: number, srcTileX: number, srcTileZ: number, rotation: number = 0): number {
    const mapX: number = srcTileX >> 3;
    const mapZ: number = srcTileZ >> 3;
    return ((srcLevel & 0x3) << 24) | ((mapX & 0x3ff) << 14) | ((mapZ & 0x7ff) << 3) | ((rotation & 0x3) << 1);
}

export default class RebuildRegion extends ServerGameMessage {
    constructor(
        readonly zoneX: number,
        readonly zoneZ: number,
        /** `[level][y][x]` in 4×13×13; `-1` = absent. */
        readonly keys: number[][][]
    ) {
        super();
    }
}
