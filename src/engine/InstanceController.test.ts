import World from '#/engine/World.js';
import InstanceController from '#/engine/InstanceController.js';
import { CoordGrid } from '#/engine/CoordGrid.js';

void World;

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

const controller = new InstanceController();
const first = { level: 0, x: 7000, z: 7000 };
const second = { level: 0, x: 7200, z: 7000 };
controller.instances.push({
    uid: 1,
    sw: first,
    floors: 1,
    zonesEast: 2,
    zonesNorth: 2,
    exitCoord: { level: 0, x: 3200, z: 3200 },
    pendingEntryUntil: Date.now() + 30_000
} as never);
controller.instances.push({
    uid: 2,
    sw: second,
    floors: 1,
    zonesEast: 2,
    zonesNorth: 2,
    exitCoord: null,
    pendingEntryUntil: 0
} as never);

const sameInstance = { level: 0, x: 7008, z: 7008 };
assert(!controller.isLeavingInstance(first, sameInstance), 'same-instance movement must not be a leave');
assert(controller.isLeavingInstance(first, second), 'instance-to-instance movement must leave the old instance');
assert(controller.isLeavingInstance(first, { level: 0, x: 3200, z: 3200 }), 'instance-to-overworld movement must leave');
assert(!controller.isLeavingInstance({ level: 0, x: 3200, z: 3200 }, first), 'overworld-to-instance movement is not an old-instance leave');

const pending = controller.instances[0];
controller.playerLeft(first);
assert(controller.instances.includes(pending), 'pending creation must remain pinned until entry or expiry');
controller.playerEntered(first);
assert(pending.pendingEntryUntil === 0, 'entry must clear the creation pin');

assert(controller.getSaveCoord(first, null).x === 3200, 'instance exit coordinate must be used for saves');
assert(controller.getSaveCoord(second, null).x === 3222, 'missing exit coordinate must use Lumbridge fallback');
assert(controller.getSaveCoord({ level: 0, x: 6464, z: 6464 }, { level: 0, x: 3000, z: 3000 }).x === 3000, 'stale instance tile must use previous overworld coordinate');
pending.exitCoord = { level: 0, x: 7000, z: 7000 };
assert(controller.getSaveCoord(first, { level: 0, x: 3000, z: 3000 }).x === 3000, 'instance exit coordinate must be validated as overworld');
assert(controller.getSaveCoord({ level: 0, x: 6464, z: 6464 }, { level: 0, x: 7000, z: 7000 }).x === 3222, 'stale previous instance coordinate must use Lumbridge fallback');

assert(!CoordGrid.isInstanceX(3200), 'test overworld coordinate');
console.log('InstanceController lifecycle and save-coordinate behavior ok');
process.exit(0);
