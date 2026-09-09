import assert from 'node:assert/strict';

import World from '#/engine/World.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import PathingEntity from '#/engine/entity/PathingEntity.js';
import Player from '#/engine/entity/Player.js';
import { MoveSpeed } from '#/engine/entity/MoveSpeed.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import SetMultiway from '#/network/game/server/model/SetMultiway.js';

const player = Object.create(Player.prototype) as Player;
const queued: string[] = [];
const writes: unknown[] = [];
let multiCoord = -1;

Object.assign(player, {
    x: 39 * 64 + 8 * 3 + 1,
    z: 60 * 64 + 8 * 3 + 1,
    level: 0,
    lastMapZone: -1,
    lastZone: -1,
    staffModLevel: 3,
    vars: [],
    waypoints: new Int32Array(25),
    buildArea: {
        rebuild: () => {},
        rebuildZones: () => { throw new Error('trigger path must not rebuild zones'); }
    },
    enqueueScript: (script: { info: { scriptName: string } }) => queued.push(script.info.scriptName),
    write: (message: unknown) => writes.push(message)
});

const originalGetByName = ScriptProvider.getByName;
const originalGetByTriggerSpecific = ScriptProvider.getByTriggerSpecific;
const originalGameMap = World.gameMap;
ScriptProvider.getByName = ((name: string) => ({ info: { scriptName: name } })) as typeof ScriptProvider.getByName;
Object.defineProperty(World, 'gameMap', {
    configurable: true,
    value: {
        isMulti: (coord: number) => coord === multiCoord,
        getZone: () => ({ enter: () => {}, leave: () => {} })
    }
});

try {
    ScriptProvider.getByTriggerSpecific = (() => null) as unknown as typeof ScriptProvider.getByTriggerSpecific;
    const queue = (previousX: number, previousZ: number, previousLevel: number, initialLogin: boolean) =>
        (player as unknown as { queueZoneTransitionTriggers: (...args: [number, number, number, boolean]) => void }).queueZoneTransitionTriggers(previousX, previousZ, previousLevel, initialLogin);

    queue(player.x, player.z, player.level, true);
    assert.deepEqual(queued, ['[mapzone,0_39_60]', '[zone,0_39_60_24_24]']);
    assert.notEqual(player.lastMapZone, -1);
    assert.notEqual(player.lastZone, -1);

    queued.length = 0;
    (Player.prototype as unknown as { onTileUpdated: (x: number, z: number, level: number) => void }).onTileUpdated.call(player, player.x, player.z, player.level);
    assert.deepEqual(queued, [], 'same packed location must not enqueue duplicate triggers');

    const previousX = player.x;
    const previousZ = player.z;
    player.x += 8;
    queued.length = 0;
    (Player.prototype as unknown as { onTileUpdated: (x: number, z: number, level: number) => void }).onTileUpdated.call(player, previousX, previousZ, player.level);
    assert.deepEqual(queued, ['[zoneexit,0_39_60_24_24]', '[zone,0_39_60_32_24]']);

    queued.length = 0;
    const mapPreviousX = player.x;
    player.x = 40 * 64 + 1;
    (Player.prototype as unknown as { onTileUpdated: (x: number, z: number, level: number) => void }).onTileUpdated.call(player, mapPreviousX, player.z, player.level);
    assert.deepEqual(queued, [
        '[mapzoneexit,0_39_60]',
        '[mapzone,0_40_60]',
        '[zoneexit,0_39_60_32_24]',
        '[zone,0_40_60_0_24]'
    ]);

    queued.length = 0;
    const levelPrevious = player.level;
    player.level = 1;
    multiCoord = CoordGrid.packCoord(player.level, (player.x >> 3) << 3, (player.z >> 3) << 3);
    (Player.prototype as unknown as { onTileUpdated: (x: number, z: number, level: number) => void }).onTileUpdated.call(player, player.x, player.z, levelPrevious);
    assert.deepEqual(queued, ['[zoneexit,0_40_60_0_24]', '[zone,1_40_60_0_24]']);
    assert.equal(writes.filter(message => message instanceof SetMultiway).length, 1);
    assert.equal((writes.find(message => message instanceof SetMultiway) as SetMultiway).hidden, true);

    // An unset baseline seeds entries without manufacturing exits.
    player.x = 41 * 64 + 1;
    player.z = 60 * 64 + 1;
    player.level = 0;
    player.lastMapZone = -1;
    player.lastZone = -1;
    queued.length = 0;
    (player as unknown as { queueZoneTransitionTriggers: (...args: [number, number, number, boolean]) => void }).queueZoneTransitionTriggers(player.x, player.z, player.level, false);
    assert.deepEqual(queued, ['[mapzone,0_41_60]', '[zone,0_41_60_0_0]']);

    // Exercise the real teleport host, including its previous-coordinate capture.
    player.lastMapZone = CoordGrid.packCoord(0, 41 * 64, 60 * 64);
    player.lastZone = CoordGrid.packCoord(0, 41 * 64, 60 * 64);
    queued.length = 0;
    PathingEntity.prototype.teleport.call(player, 42 * 64 + 1, player.z, player.level);
    assert.deepEqual(queued, [
        '[mapzoneexit,0_41_60]',
        '[mapzone,0_42_60]',
        '[zoneexit,0_41_60_0_0]',
        '[zone,0_42_60_0_0]'
    ]);

    // Exercise the real movement host; the bounded step stub avoids map setup.
    player.lastMapZone = CoordGrid.packCoord(0, 42 * 64, 60 * 64);
    player.lastZone = CoordGrid.packCoord(0, 42 * 64, 60 * 64);
    player.x = 42 * 64 + 1;
    player.z = 60 * 64 + 1;
    player.waypointIndex = 0;
    player.waypoints[0] = CoordGrid.packCoord(0, player.x + 8, player.z);
    player.run = 1;
    player.runanim = 1;
    player.tempRun = 1;
    player.moveSpeed = MoveSpeed.RUN;
    player.walkDir = -1;
    (player as unknown as { takeStep: () => [number, number] }).takeStep = () => [8, 0];
    queued.length = 0;
    Player.prototype.updateMovement.call(player);
    assert.deepEqual(queued, ['[zoneexit,0_42_60_0_0]', '[zone,0_42_60_8_0]']);

    // Exercise the real login host and ensure it seeds, rather than replays.
    player.x = 43 * 64 + 1;
    player.z = 60 * 64 + 1;
    player.level = 0;
    player.lastMapZone = -1;
    player.lastZone = -1;
    player.isActive = false;
    queued.length = 0;
    Player.prototype.onLogin.call(player);
    assert.deepEqual(queued, ['[mapzone,0_43_60]', '[zone,0_43_60_0_0]']);
    queued.length = 0;
    Player.prototype.onLogin.call(player);
    assert.deepEqual(queued, []);

} finally {
    ScriptProvider.getByName = originalGetByName;
    ScriptProvider.getByTriggerSpecific = originalGetByTriggerSpecific;
    Object.defineProperty(World, 'gameMap', { configurable: true, value: originalGameMap });
}

console.log('Player zone trigger behavior ok');
process.exit(0);
