import fs from 'fs';

import { unzipSync } from 'fflate';

import rsmod, { CollisionFlag, CollisionType, LocAngle, LocLayer } from '#/engine/routefinder/index.js';

import LocType from '#/cache/config/LocType.js';
import NpcType from '#/cache/config/NpcType.js';
import ObjType from '#/cache/config/ObjType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import { EntityLifeCycle } from '#/engine/entity/EntityLifeCycle.js';
import Loc from '#/engine/entity/Loc.js';
import Npc from '#/engine/entity/Npc.js';
import Obj from '#/engine/entity/Obj.js';
import World from '#/engine/World.js';
import Zone from '#/engine/zone/Zone.js';
import ZoneGrid from '#/engine/zone/ZoneGrid.js';
import ZoneMap from '#/engine/zone/ZoneMap.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import { printDebug, printFatalError, printWarning } from '#/util/Logger.js';

export type RouteCoordinates = { x: number; z: number };

type PackedMapsquare = {
    m: Uint8Array;
    l: Uint8Array;
    n: Uint8Array;
    o: Uint8Array;
};

/** Runtime dest of a `map_build` copy. Packed source files are not mutated. */
export type InstancedMap = {
    srcMx: number;
    srcMz: number;
    destMx: number;
    destMz: number;
};

export default class GameMap {
    private static readonly OPEN: number = 0x0;
    private static readonly BLOCK_MAP_SQUARE: number = 0x1;
    private static readonly LINK_BELOW: number = 0x2;
    private static readonly REMOVE_ROOFS: number = 0x4;
    private static readonly VISIBLE_BELOW: number = 0x8;
    private static readonly NOT_LOW_DETAIL: number = 0x10;

    private static readonly Y: number = 4;
    private static readonly X: number = 64;
    private static readonly Z: number = 64;

    private static readonly MAPSQUARE: number = GameMap.X * GameMap.Y * GameMap.Z;

    // dest mx AND mz 200–255: mz 0 + local 44 → world z 44, client
    // mapBuildBaseZ = (zoneZ-6)*8 is negative (T1 / south-of-world).
    // stride 2 keeps 13×13 rebuild windows from overlapping a neighbour dest.
    static readonly INSTANCE_MX_MIN: number = 200;
    static readonly INSTANCE_MZ_MIN: number = 200;
    private static readonly INSTANCE_MX_MAX: number = 255;
    private static readonly INSTANCE_MZ_MAX: number = 255;
    private static readonly INSTANCE_STRIDE: number = 2;

    private readonly members: boolean;
    private readonly zonemap: ZoneMap;
    private readonly multimap: Set<number>;
    private readonly freemap: Set<number>;
    private readonly packed: Map<number, PackedMapsquare>;
    private readonly instances: Map<number, InstancedMap>;
    private nextDestMx: number;
    private nextDestMz: number;

    constructor(members: boolean) {
        this.members = members;
        this.zonemap = new ZoneMap();
        this.multimap = new Set();
        this.freemap = new Set();
        this.packed = new Map();
        this.instances = new Map();
        this.nextDestMx = GameMap.INSTANCE_MX_MIN;
        this.nextDestMz = GameMap.INSTANCE_MZ_MIN;
    }

    init(): void {
        if (!fs.existsSync(`${Environment.BUILD_SRC_DIR}/maps`)) {
            return;
        }

        this.zonemap.beginInitialization();
        printDebug('Loading game map');

        if (fs.existsSync(`${Environment.BUILD_SRC_DIR}/maps/multiway.csv`)) {
            this.loadCsvMap(this.multimap, fs.readFileSync(`${Environment.BUILD_SRC_DIR}/maps/multiway.csv`, 'ascii').split(/\r?\n/));
        }

        if (fs.existsSync(`${Environment.BUILD_SRC_DIR}/maps/free2play.csv`)) {
            this.loadCsvMap(this.freemap, fs.readFileSync(`${Environment.BUILD_SRC_DIR}/maps/free2play.csv`, 'ascii').split(/\r?\n/));
        }

        const zipPath = 'data/pack/.cache/maps-server.zip';
        if (fs.existsSync(zipPath)) {
            const mapEntries = unzipSync(fs.readFileSync(zipPath));
            const maps: string[] = Object.keys(mapEntries).filter(name => name[0] === 'm');
            for (let index: number = 0; index < maps.length; index++) {
                const [mx, mz] = maps[index].substring(1).split('_').map(Number);
                const mapsquareX: number = mx << 6;
                const mapsquareZ: number = mz << 6;

                const packed: PackedMapsquare = {
                    m: new Uint8Array(mapEntries[`m${mx}_${mz}`] ?? new Uint8Array()),
                    l: new Uint8Array(mapEntries[`l${mx}_${mz}`] ?? new Uint8Array()),
                    n: new Uint8Array(mapEntries[`n${mx}_${mz}`] ?? new Uint8Array()),
                    o: new Uint8Array(mapEntries[`o${mx}_${mz}`] ?? new Uint8Array())
                };
                this.packed.set((mx << 8) | mz, packed);
                this.loadPackedMapsquare(packed, mapsquareX, mapsquareZ);
            }
        } else {
            const path: string = 'data/pack/server/maps/';
            const maps: string[] = fs.readdirSync(path).filter(x => x[0] === 'm');
            for (let index: number = 0; index < maps.length; index++) {
                const [mx, mz] = maps[index].substring(1).split('_').map(Number);
                const mapsquareX: number = mx << 6;
                const mapsquareZ: number = mz << 6;

                const packed: PackedMapsquare = {
                    m: Packet.load(`${path}m${mx}_${mz}`).data.slice(),
                    l: Packet.load(`${path}l${mx}_${mz}`).data.slice(),
                    n: fs.existsSync(`${path}n${mx}_${mz}`) ? Packet.load(`${path}n${mx}_${mz}`).data.slice() : new Uint8Array(),
                    o: fs.existsSync(`${path}o${mx}_${mz}`) ? Packet.load(`${path}o${mx}_${mz}`).data.slice() : new Uint8Array()
                };
                this.packed.set((mx << 8) | mz, packed);
                this.loadPackedMapsquare(packed, mapsquareX, mapsquareZ);
            }
        }

        printDebug(`${World.getTotalNpcs()}/16383 static NPCs added`);
        this.zonemap.endInitialization();
    }

    isMulti(coord: number): boolean {
        const pos: CoordGrid = CoordGrid.unpackCoord(coord);
        return this.multimap.has(ZoneMap.zoneIndex(pos.x, pos.z, pos.level));
    }

    isFreeToPlay(x: number, z: number): boolean {
        return this.freemap.has(ZoneMap.zoneIndex(x, z, 0)); // level does not matter here.
    }

    getZone(x: number, z: number, level: number): Zone {
        return this.zonemap.getZone(x, z, level);
    }

    getZoneIndex(zoneIndex: number): Zone {
        return this.zonemap.getZoneByIndex(zoneIndex);
    }

    getZoneIfExists(x: number, z: number, level: number): Zone | null {
        return this.zonemap.getZoneIfExists(x, z, level);
    }

    getZoneIndexIfExists(zoneIndex: number): Zone | null {
        return this.zonemap.getZoneByIndexIfExists(zoneIndex);
    }

    createInstanceZone(zoneIndex: number): Zone {
        return this.zonemap.createInstanceZone(zoneIndex);
    }

    hasZone(x: number, z: number, level: number): boolean {
        return this.zonemap.hasZone(x, z, level);
    }

    isInitializing(): boolean {
        return this.zonemap.isInitializingMap();
    }

    addZone(zone: Zone): Zone {
        return this.zonemap.addZone(zone);
    }

    removeZone(index: number): boolean {
        return this.zonemap.removeZone(index);
    }

    isMultiZone(zoneIndex: number): boolean {
        return this.multimap.has(zoneIndex);
    }

    setMultiZone(zoneIndex: number, multi: boolean): void {
        if (multi) {
            this.multimap.add(zoneIndex);
        } else {
            this.multimap.delete(zoneIndex);
        }
    }

    getZoneGrid(level: number): ZoneGrid {
        return this.zonemap.grid(level);
    }

    getTotalZones(): number {
        return this.zonemap.zoneCount();
    }

    getTotalLocs(): number {
        return this.zonemap.locCount();
    }

    getTotalObjs(): number {
        return this.zonemap.objCount();
    }

    isInstanced(x: number, z: number): boolean {
        return this.instances.has((CoordGrid.mapsquare(x) << 8) | CoordGrid.mapsquare(z));
    }

    getInstanceAt(x: number, z: number): InstancedMap | undefined {
        return this.instances.get((CoordGrid.mapsquare(x) << 8) | CoordGrid.mapsquare(z));
    }

    /**
     * CANDIDATE `map_build`: copy packed source mapsquare 8×8s (collision, locs,
     * static NPCs/objs) onto an unused high dest. Returns dest coord with the
     * same local offsets as `src`. Does not mutate packed source files.
     */
    buildInstance(src: CoordGrid): number {
        const srcMx: number = CoordGrid.mapsquare(src.x);
        const srcMz: number = CoordGrid.mapsquare(src.z);
        const packed: PackedMapsquare | undefined = this.packed.get((srcMx << 8) | srcMz);
        if (!packed) {
            throw new Error(`map_build: no packed mapsquare m${srcMx}_${srcMz}`);
        }

        const dest = this.allocDestMapsquare();
        this.loadPackedMapsquare(packed, dest.mx << 6, dest.mz << 6);
        this.instances.set((dest.mx << 8) | dest.mz, { srcMx, srcMz, destMx: dest.mx, destMz: dest.mz });

        const destX: number = (dest.mx << 6) | (src.x & 0x3f);
        const destZ: number = (dest.mz << 6) | (src.z & 0x3f);
        return CoordGrid.packCoord(src.level, destX, destZ);
    }

    private allocDestMapsquare(): { mx: number; mz: number } {
        const startMx: number = this.nextDestMx;
        const startMz: number = this.nextDestMz;
        while (true) {
            const mx: number = this.nextDestMx;
            const mz: number = this.nextDestMz;
            this.nextDestMz += GameMap.INSTANCE_STRIDE;
            if (this.nextDestMz > GameMap.INSTANCE_MZ_MAX) {
                this.nextDestMz = GameMap.INSTANCE_MZ_MIN;
                this.nextDestMx += GameMap.INSTANCE_STRIDE;
                if (this.nextDestMx > GameMap.INSTANCE_MX_MAX) {
                    this.nextDestMx = GameMap.INSTANCE_MX_MIN;
                }
            }
            const key: number = (mx << 8) | mz;
            if (!this.packed.has(key) && !this.instances.has(key)) {
                return { mx, mz };
            }
            if (this.nextDestMx === startMx && this.nextDestMz === startMz) {
                throw new Error('map_build: no unused dest mapsquare');
            }
        }
    }

    private loadPackedMapsquare(packed: PackedMapsquare, mapsquareX: number, mapsquareZ: number): void {
        this.loadNpcs(new Packet(packed.n), mapsquareX, mapsquareZ);
        this.loadObjs(new Packet(packed.o), mapsquareX, mapsquareZ);
        const lands: Int8Array = new Int8Array(GameMap.MAPSQUARE);
        this.loadGround(lands, new Packet(packed.m), mapsquareX, mapsquareZ);
        this.loadLocations(lands, new Packet(packed.l), mapsquareX, mapsquareZ);
    }

    private loadNpcs(packet: Packet, mapsquareX: number, mapsquareZ: number): void {
        while (packet.available > 0) {
            const { x, z, level } = this.unpackCoord(packet.g2());
            const absoluteX: number = mapsquareX + x;
            const absoluteZ: number = mapsquareZ + z;
            const count: number = packet.g1();
            for (let index: number = 0; index < count; index++) {
                const id: number = packet.g2();
                if (!this.members && !this.isFreeToPlay(absoluteX, absoluteZ)) {
                    continue;
                }
                const npcType: NpcType = NpcType.get(id);
                if (!npcType) {
                    printFatalError(`Invalid npc type ${id} in map m${mapsquareX >> 6}_${mapsquareZ >> 6}.jm2`);
                    continue;
                }
                if ((npcType.members && this.members) || !npcType.members) {
                    const size: number = npcType.size;
                    const npc: Npc = new Npc(level, absoluteX, absoluteZ, size, size, EntityLifeCycle.RESPAWN, World.getNextNid(), npcType.id, npcType.blockwalk);
                    World.addNpc(npc, -1);
                }
            }
        }
    }

    private loadObjs(packet: Packet, mapsquareX: number, mapsquareZ: number): void {
        while (packet.available > 0) {
            const { x, z, level } = this.unpackCoord(packet.g2());
            const absoluteX: number = mapsquareX + x;
            const absoluteZ: number = mapsquareZ + z;
            const count: number = packet.g1();
            for (let index: number = 0; index < count; index++) {
                const id: number = packet.g2();
                const count: number = packet.g1();
                if (!this.members && !this.isFreeToPlay(absoluteX, absoluteZ)) {
                    continue;
                }
                const objType: ObjType = ObjType.get(id);
                if ((objType.members && this.members) || !objType.members) {
                    const obj: Obj = new Obj(level, absoluteX, absoluteZ, EntityLifeCycle.RESPAWN, objType.id, count);
                    this.getZone(obj.x, obj.z, obj.level).addStaticObj(obj);
                }
            }
        }
    }

    private loadGround(lands: Int8Array, packet: Packet, mapsquareX: number, mapsquareZ: number): void {
        for (let level: number = 0; level < GameMap.Y; level++) {
            for (let x: number = 0; x < GameMap.X; x++) {
                for (let z: number = 0; z < GameMap.Z; z++) {
                    while (true) {
                        const opcode: number = packet.g1();
                        if (opcode === 0) {
                            break;
                        } else if (opcode === 1) {
                            packet.pos++;
                            break;
                        }

                        if (opcode <= 49) {
                            packet.pos++;
                        } else if (opcode <= 81) {
                            lands[this.packCoord(x, z, level)] = opcode - 49;
                        }
                    }
                }
            }
        }
        for (let level: number = 0; level < GameMap.Y; level++) {
            for (let x: number = 0; x < GameMap.X; x++) {
                const absoluteX: number = x + mapsquareX;

                for (let z: number = 0; z < GameMap.Z; z++) {
                    const absoluteZ: number = z + mapsquareZ;

                    if (!this.members && !this.isFreeToPlay(absoluteX, absoluteZ) && !this.bordersFreeToPlay(absoluteX, absoluteZ)) {
                        continue;
                    }

                    if (x % 7 === 0 && z % 7 === 0) {
                        // allocate per zone
                        rsmod.allocateIfAbsent(absoluteX, absoluteZ, level);
                    }

                    const land: number = lands[this.packCoord(x, z, level)];

                    if ((land & GameMap.REMOVE_ROOFS) !== GameMap.OPEN) {
                        changeRoofCollision(absoluteX, absoluteZ, level, true);
                    }

                    if ((land & GameMap.BLOCK_MAP_SQUARE) !== GameMap.BLOCK_MAP_SQUARE) {
                        continue;
                    }

                    const bridged: boolean = (level === 1 ? land & GameMap.LINK_BELOW : lands[this.packCoord(x, z, 1)] & GameMap.LINK_BELOW) === GameMap.LINK_BELOW;
                    const actualLevel: number = bridged ? level - 1 : level;
                    if (actualLevel < 0) {
                        continue;
                    }

                    changeLandCollision(absoluteX, absoluteZ, actualLevel, true);
                }
            }
        }
    }

    private loadLocations(lands: Int8Array, packet: Packet, mapsquareX: number, mapsquareZ: number): void {
        let locId: number = -1;
        let locIdOffset: number = packet.gsmarts();
        while (locIdOffset !== 0) {
            locId += locIdOffset;

            let coord: number = 0;
            let coordOffset: number = packet.gsmarts();

            while (coordOffset !== 0) {
                const { x, z, level } = this.unpackCoord((coord += coordOffset - 1));

                const info: number = packet.g1();
                coordOffset = packet.gsmarts();

                const absoluteX: number = x + mapsquareX;
                const absoluteZ: number = z + mapsquareZ;

                if (!this.members && !this.isFreeToPlay(absoluteX, absoluteZ) && !this.bordersFreeToPlay(absoluteX, absoluteZ)) {
                    continue;
                }

                const bridged: boolean = (level === 1 ? lands[coord] & GameMap.LINK_BELOW : lands[this.packCoord(x, z, 1)] & GameMap.LINK_BELOW) === GameMap.LINK_BELOW;
                const actualLevel: number = bridged ? level - 1 : level;
                if (actualLevel < 0) {
                    continue;
                }

                const type: LocType = LocType.get(locId);
                if (!type) {
                    printFatalError(`Invalid loc type ${locId} in map m${mapsquareX >> 6}_${mapsquareZ >> 6}.jm2`);
                    continue;
                }

                const width: number = type.width;
                const length: number = type.length;
                const shape: number = info >> 2;
                const angle: number = info & 0x3;

                if (type.blockwalk) {
                    changeLocCollision(shape, angle, type.blockrange, length, width, type.active, absoluteX, absoluteZ, actualLevel, true);
                }

                if (type.active) {
                    this.getZone(absoluteX, absoluteZ, actualLevel).addStaticLoc(new Loc(actualLevel, absoluteX, absoluteZ, width, length, EntityLifeCycle.RESPAWN, locId, shape, angle));
                }
            }
            locIdOffset = packet.gsmarts();
        }
    }

    private loadCsvMap(map: Set<number>, csv: string[]): void {
        // easiest solution for the time being
        for (let index: number = 0; index < csv.length; index++) {
            const line: string = csv[index];
            if (line.startsWith('//') || !line.length) {
                continue;
            }
            const [y, mx, mz, lx, lz] = line.split('_').map(Number);
            if (lx % 8 !== 0 || lz % 8 !== 0) {
                printWarning('CSV map line is not aligned to a zone: ' + line);
            }
            map.add(ZoneMap.zoneIndex((mx << 6) + lx, (mz << 6) + lz, y));
        }
    }

    private packCoord(x: number, z: number, level: number): number {
        return (z & 0x3f) | ((x & 0x3f) << 6) | ((level & 0x3) << 12);
    }

    private unpackCoord(packed: number): CoordGrid {
        const z: number = packed & 0x3f;
        const x: number = (packed >> 6) & 0x3f;
        const level: number = (packed >> 12) & 0x3;
        return { x, z, level };
    }

    private bordersFreeToPlay(x: number, z: number): boolean {
        return this.isFreeToPlay(x + 1, z) || this.isFreeToPlay(x - 1, z) || this.isFreeToPlay(x, z + 1) || this.isFreeToPlay(x, z - 1);
    }
}

// ---- rsmod wasm exports.

/**
 * Change collision at a specified Position for lands/floors.
 * @param x The x pos.
 * @param z The z pos.
 * @param level The level pos.
 * @param add True if adding this collision. False if removing.
 */
export function changeLandCollision(x: number, z: number, level: number, add: boolean): void {
    rsmod.changeFloor(x, z, level, add);
}

/**
 * Change collision at a specified Position for locs.
 * @param shape The shape of the loc to change.
 * @param angle The angle of the loc to change.
 * @param blockrange If this loc blocks range.
 * @param length The length of this loc.
 * @param width The width of this loc.
 * @param active If this loc is active.
 * @param x The x pos.
 * @param z The z pos.
 * @param level The level pos.
 * @param add True if adding this collision. False if removing.
 */
export function changeLocCollision(shape: number, angle: number, blockrange: boolean, length: number, width: number, active: number, x: number, z: number, level: number, add: boolean): void {
    const locLayer: LocLayer = rsmod.locShapeLayer(shape);
    if (locLayer === LocLayer.WALL) {
        rsmod.changeWall(x, z, level, angle, shape, blockrange, add);
    } else if (locLayer === LocLayer.GROUND) {
        if (angle === LocAngle.NORTH || angle === LocAngle.SOUTH) {
            rsmod.changeLoc(x, z, level, length, width, blockrange, add);
        } else {
            rsmod.changeLoc(x, z, level, width, length, blockrange, add);
        }
    } else if (locLayer === LocLayer.GROUND_DECOR) {
        if (active === 1) {
            rsmod.changeFloor(x, z, level, add);
        }
    }
}
export function findNaivePath(level: number, srcX: number, srcZ: number, destX: number, destZ: number, srcWidth: number, srcHeight: number, destWidth: number, destHeight: number, extraFlag: number, collision: CollisionType): Uint32Array {
    return rsmod.findNaivePath(level, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag, collision);
}

/**
 * Change collision at a specified Position for npcs.
 * @param size The size square of this npc. (1x1, 2x2, etc).
 * @param x The x pos.
 * @param z The z pos.
 * @param level The level pos.
 * @param add True if adding this collision. False if removing.
 */
export function changeNpcCollision(size: number, x: number, z: number, level: number, add: boolean): void {
    rsmod.changeNpc(x, z, level, size, add);
}

/**
 * Change collision at a specified Position for players.
 * @param size The size square of this npc. (1x1, 2x2, etc).
 * @param x The x pos.
 * @param z The z pos.
 * @param level The level pos.
 * @param add True if adding this collision. False if removing.
 */
export function changeBlockCollision(size: number, x: number, z: number, level: number, add: boolean): void {
    rsmod.changeBlock(x, z, level, size, add);
}

/**
 * Change player-occupancy collision at a specified Position.
 * @param size The size square of this entity. (1x1, 2x2, etc).
 * @param x The x pos.
 * @param z The z pos.
 * @param level The level pos.
 * @param add True if adding this collision. False if removing.
 */
export function changePlayerOccCollision(size: number, x: number, z: number, level: number, add: boolean): void {
    rsmod.changePlayerOcc(x, z, level, size, add);
}

/**
 * Change collision at a specified Position for roofs.
 * @param x The x pos.
 * @param z The z pos.
 * @param level The level pos.
 * @param add True if adding this collision. False if removing.
 */
export function changeRoofCollision(x: number, z: number, level: number, add: boolean): void {
    rsmod.changeRoof(x, z, level, add);
}

export function findPath(level: number, srcX: number, srcZ: number, destX: number, destZ: number): Uint32Array {
    return rsmod.findPath(level, srcX, srcZ, destX, destZ, 1, 1, 1, 0, -1, true, 0, 25, CollisionType.NORMAL);
}

export function findPathToEntity(level: number, srcX: number, srcZ: number, destX: number, destZ: number, srcSize: number, destWidth: number, destHeight: number): Uint32Array {
    return rsmod.findPath(level, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, 0, -2, true, 0, 25, CollisionType.NORMAL);
}

export function findPathToLoc(level: number, srcX: number, srcZ: number, destX: number, destZ: number, srcSize: number, destWidth: number, destHeight: number, angle: number, shape: number, blockAccessFlags: number): Uint32Array {
    return rsmod.findPath(level, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, angle, shape, true, blockAccessFlags, 25, CollisionType.NORMAL);
}

export function reachedEntity(level: number, srcX: number, srcZ: number, destX: number, destZ: number, destWidth: number, destHeight: number, srcSize: number): boolean {
    return rsmod.reached(level, srcX, srcZ, destX, destZ, destWidth, destHeight, srcSize, 0, -2, 0);
}

export function reachedLoc(level: number, srcX: number, srcZ: number, destX: number, destZ: number, destWidth: number, destHeight: number, srcSize: number, angle: number, shape: number, blockAccessFlags: number): boolean {
    return rsmod.reached(level, srcX, srcZ, destX, destZ, destWidth, destHeight, srcSize, angle, shape, blockAccessFlags);
}

export function reachedObj(level: number, srcX: number, srcZ: number, destX: number, destZ: number, destWidth: number, destHeight: number, srcSize: number): boolean {
    return rsmod.reached(level, srcX, srcZ, destX, destZ, destWidth, destHeight, srcSize, 0, -1, 0);
}

export function canTravel(level: number, x: number, z: number, offsetX: number, offsetZ: number, size: number, extraFlag: number, collision: CollisionType): boolean {
    if (!Environment.NODE_MEMBERS && !World.gameMap.isFreeToPlay(x + offsetX, z + offsetZ)) {
        return false;
    }
    return rsmod.canTravel(level, x, z, offsetX, offsetZ, size, extraFlag, collision);
}

export function isMapBlocked(x: number, z: number, level: number): boolean {
    return isFlagged(x, z, level, CollisionFlag.WALK_BLOCKED);
}

export function isIndoors(x: number, z: number, level: number): boolean {
    return isFlagged(x, z, level, CollisionFlag.ROOF);
}

export function isFlagged(x: number, z: number, level: number, masks: number): boolean {
    return rsmod.isFlagged(x, z, level, masks);
}

export function isLineOfWalk(level: number, srcX: number, srcZ: number, destX: number, destZ: number): boolean {
    return rsmod.hasLineOfWalk(level, srcX, srcZ, destX, destZ, 1, 1, 1, 1, 0);
}

export function isLineOfSight(level: number, srcX: number, srcZ: number, destX: number, destZ: number): boolean {
    return rsmod.hasLineOfSight(level, srcX, srcZ, destX, destZ, 1, 1, 1, 1, 0);
}

export function isApproached(level: number, srcX: number, srcZ: number, destX: number, destZ: number, srcWidth: number, srcHeight: number, destWidth: number, destHeight: number): boolean {
    return rsmod.hasLineOfSight(level, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, CollisionFlag.BLOCK_NPC_AND_PLAYERS);
}

export function layerForLocShape(shape: number): LocLayer {
    return rsmod.locShapeLayer(shape);
}

export function isZoneAllocated(level: number, x: number, z: number): boolean {
    return rsmod.isZoneAllocated(x, z, level);
}
