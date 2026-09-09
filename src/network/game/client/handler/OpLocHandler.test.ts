import LocType from '#/cache/config/LocType.js';
import World from '#/engine/World.js';
import Loc from '#/engine/entity/Loc.js';
import { EntityLifeCycle } from '#/engine/entity/EntityLifeCycle.js';
import OpLocHandler from '#/network/game/client/handler/OpLocHandler.js';
import OpLoc from '#/network/game/client/model/OpLoc.js';
import UnsetMapFlag from '#/network/game/server/model/UnsetMapFlag.js';

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

const x = 3200;
const z = 3200;
const parent = new Loc(0, x, z, 1, 1, EntityLifeCycle.FOREVER, 100, 10, 0);
parent.isActive = true;
const child = new Loc(0, x, z, 1, 1, EntityLifeCycle.FOREVER, 101, 10, 0);
child.isActive = true;

const parentType = new LocType(100);
parentType.multivarp = 5;
parentType.multiloc = [101];
const childType = new LocType(101);
childType.op = ['Use', 'Inspect', null, null, null];
const previousConfigs = LocType.configs;
LocType.configs = [];
LocType.configs[100] = parentType;
LocType.configs[101] = childType;

const originalGetLoc = World.getLoc;
const originalGetZone = World.gameMap.getZone;
const candidateZone = {
    *getLocsSafe() {
        yield child;
    }
};
World.getLoc = ((_x: number, _z: number, _level: number, locId: number) => (locId === 100 ? parent : null)) as typeof World.getLoc;
World.gameMap.getZone = (() => candidateZone) as typeof World.gameMap.getZone;

const writes: unknown[] = [];
let interaction: unknown[] | null = null;
let cleared = false;
const player = {
    delayed: false,
    originX: x,
    originZ: z,
    level: 0,
    opcalled: false,
    getVar: () => 0,
    getVarBit: () => 0,
    write: (message: unknown) => writes.push(message),
    clearPendingAction: () => {
        cleared = true;
    },
    setInteraction: (...args: unknown[]) => {
        interaction = args;
    }
};

try {
    const handler = new OpLocHandler();

    assert(handler.handle(new OpLoc(2, x, z, 100), player as never), 'parent loc id should be accepted');
    assert(interaction?.[1] === parent, 'interaction should retain the map loc instance');
    assert(interaction?.[2] === 60, 'op 2 should resolve to APLOC2');
    assert(cleared && player.opcalled, 'accepted operation should arm the interaction');

    writes.length = 0;
    interaction = null;
    player.opcalled = false;
    cleared = false;
    assert(!handler.handle(new OpLoc(1, x, z, 101), player as never), 'resolved child id must be rejected');
    assert(writes[0] instanceof UnsetMapFlag, 'rejected child id should unset the map flag');
    assert(interaction === null && !player.opcalled, 'rejected child id must not create an interaction');

    writes.length = 0;
    player.delayed = true;
    assert(!handler.handle(new OpLoc(1, x, z, 100), player as never), 'delayed player should be rejected');
    assert(writes[0] instanceof UnsetMapFlag, 'delayed operation should unset the map flag');
    player.delayed = false;

    writes.length = 0;
    assert(!handler.handle(new OpLoc(1, x + 53, z, 100), player as never), 'out-of-bounds tile should be rejected');
    assert(writes[0] instanceof UnsetMapFlag, 'out-of-bounds operation should unset the map flag');

    writes.length = 0;
    assert(!handler.handle(new OpLoc(3, x, z, 100), player as never), 'missing option should be rejected');
    assert(writes[0] instanceof UnsetMapFlag, 'invalid option should unset the map flag');
} finally {
    World.getLoc = originalGetLoc;
    World.gameMap.getZone = originalGetZone;
    LocType.configs = previousConfigs;
}

console.log('OpLocHandler lookup and guard behavior ok');
process.exit(0);
