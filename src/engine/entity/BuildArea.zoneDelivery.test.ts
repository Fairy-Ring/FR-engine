import World from '#/engine/World.js';
import assert from 'node:assert/strict';

import { CoordGrid } from '#/engine/CoordGrid.js';
import BuildArea from '#/engine/entity/BuildArea.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ZoneMap from '#/engine/zone/ZoneMap.js';

void World;

type TestPlayer = {
    x: number;
    z: number;
    level: number;
    originX: number;
    originZ: number;
    write: (message: unknown) => void;
};

type TestArea = BuildArea & { player: TestPlayer };

function makeArea(x = 3200, z = 3200, level = 0): TestArea {
    const player: TestPlayer = { x, z, level, originX: x, originZ: z, write: () => {} };
    const area = Object.create(BuildArea.prototype) as TestArea;
    Object.assign(area, {
        player,
        activeZones: new Set<number>(),
        loadedZones: new Set<number>(),
        mapsquares: new Set<number>(),
        lastBuild: -1
    });
    return area;
}

function rebuild(area: TestArea, reconnect = false): void {
    const originalGameMap = World.gameMap;
    Object.defineProperty(World, 'gameMap', {
        configurable: true,
        value: { getZoneIfExists: () => null }
    });
    try {
        BuildArea.prototype.rebuild.call(area, reconnect);
    } finally {
        Object.defineProperty(World, 'gameMap', { configurable: true, value: originalGameMap });
    }
}

function activeIndex(area: TestArea, x = area.player.x, z = area.player.z, level = area.player.level): number {
    return ZoneMap.zoneIndex(CoordGrid.zone(x) << 3, CoordGrid.zone(z) << 3, level);
}

{
    const area = makeArea();
    rebuild(area);
    assert(area.activeZones.has(activeIndex(area)), 'stationary rebuild must subscribe the player zone');
    assert.equal(area.activeZones.size, 49, 'normal subscription window must be 7x7');
    assert(!area.activeZones.has(ZoneMap.zoneIndex(0, 0, 0)), 'subscription window must remain origin-clamped');
}

{
    const area = makeArea(4000, 4000);
    area.player.originX = 3200;
    area.player.originZ = 3200;
    rebuild(area, true);
    const newOriginZone = CoordGrid.zone(area.player.originX);
    assert(area.activeZones.has(activeIndex(area)), 'origin-changing rebuild must use the new origin');
    assert(!area.activeZones.has(ZoneMap.zoneIndex(CoordGrid.zone(3200) << 3, CoordGrid.zone(3200) << 3, 0)), 'subscriptions must not use the old origin clamp');
    assert.equal(newOriginZone, CoordGrid.zone(area.player.x), 'rebuild must move origin before subscriptions');
}

{
    const area = makeArea();
    rebuild(area);
    const oldLevel = activeIndex(area);
    area.player.level = 2;
    rebuild(area);
    assert(area.activeZones.has(activeIndex(area)), 'level changes must rebuild subscriptions at the new level');
    assert(!area.activeZones.has(oldLevel), 'level changes must remove old-level subscriptions');
}

{
    const area = makeArea();
    area.loadedZones.add(ZoneMap.zoneIndex(0, 0, 0));
    rebuild(area);
    const player = Object.create(NetworkPlayer.prototype) as NetworkPlayer;
    Object.assign(player, { buildArea: area });
    NetworkPlayer.prototype.updateZones.call(player);
    assert(!area.loadedZones.has(ZoneMap.zoneIndex(0, 0, 0)), 'updateZones must prune stale loaded zones');
}

{
    const area = makeArea();
    rebuild(area);
    const center = activeIndex(area);
    const calls: string[] = [];
    const zone = {
        index: center,
        writeFullFollows: () => calls.push('full'),
        writePartialEncloses: () => calls.push('enclosed'),
        writePartialFollows: () => calls.push('follows')
    };
    const originalGameMap = World.gameMap;
    Object.defineProperty(World, 'gameMap', {
        configurable: true,
        value: { getZoneIndexIfExists: (index: number) => index === center ? zone : null }
    });
    try {
        const player = Object.create(NetworkPlayer.prototype) as NetworkPlayer;
        Object.assign(player, { buildArea: area });
        NetworkPlayer.prototype.updateZones.call(player);
        NetworkPlayer.prototype.updateZones.call(player);
        assert.deepEqual(calls.slice(0, 3), ['full', 'enclosed', 'follows'], 'first delivery must be full before partials');
        assert.equal(calls.filter(call => call === 'full').length, 1, 'loaded zones must not receive repeated full updates');
    } finally {
        Object.defineProperty(World, 'gameMap', { configurable: true, value: originalGameMap });
    }
}

{
    const area = makeArea(6464, 6464);
    rebuild(area);
    const instanceIndex = activeIndex(area);
    assert(area.activeZones.has(instanceIndex), 'instance coordinates must use the same subscription path');

    let lookups = 0;
    const originalGameMap = World.gameMap;
    Object.defineProperty(World, 'gameMap', {
        configurable: true,
        value: { getZoneIndexIfExists: () => { lookups++; return null; } }
    });
    try {
        const player = Object.create(NetworkPlayer.prototype) as NetworkPlayer;
        Object.assign(player, { buildArea: area });
        NetworkPlayer.prototype.updateZones.call(player);
        assert(lookups > 0, 'delivery must use existing-zone lookup');
    } finally {
        Object.defineProperty(World, 'gameMap', { configurable: true, value: originalGameMap });
    }
}

{
    const area = makeArea();
    area.loadedZones.add(activeIndex(area));
    rebuild(area, true);
    assert.equal(area.loadedZones.size, 0, 'reconnect rebuild must clear loaded zones');
    assert(area.activeZones.has(activeIndex(area)), 'reconnect rebuild must refill active zones');
}

console.log('BuildArea zone subscription and delivery behavior ok');
process.exit(0);
