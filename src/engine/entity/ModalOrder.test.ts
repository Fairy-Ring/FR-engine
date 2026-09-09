import World from '#/engine/World.js';
import assert from 'node:assert/strict';

import IfClose from '#/network/game/server/model/IfClose.js';
import IfOpenChat from '#/network/game/server/model/IfOpenChat.js';
import IfOpenMain from '#/network/game/server/model/IfOpenMain.js';
import { ModalState } from '#/engine/entity/ModalState.js';
import Player from '#/engine/entity/Player.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';

void World;

function makePlayer(): NetworkPlayer {
    const player = Object.create(NetworkPlayer.prototype) as NetworkPlayer;
    const writes: unknown[] = [];

    Object.assign(player, {
        writes,
        client: {},
        weakQueue: { clear() {} },
        delayed: false,
        protect: false,
        modalState: ModalState.NONE,
        modalMain: -1,
        lastModalMain: -1,
        modalChat: -1,
        lastModalChat: -1,
        modalSide: -1,
        lastModalSide: -1,
        refreshModal: false,
        refreshModalClose: false,
        overlay: -1,
        lastOverlay: -1,
        activeScript: null,
        resumeButtons: []
    });
    player.clearComListeners = () => {};
    player.executeScript = () => {};
    player.write = message => writes.push(message);
    return player;
}

function writesOf(player: NetworkPlayer): unknown[] {
    return (player as NetworkPlayer & { writes: unknown[] }).writes;
}

function modalWrites(player: NetworkPlayer): unknown[] {
    return writesOf(player).filter(message => message instanceof IfClose || message instanceof IfOpenChat || message instanceof IfOpenMain);
}

{
    const player = makePlayer();
    player.modalState = ModalState.MAIN;
    player.modalMain = 10051;
    player.lastModalMain = 10051;

    Player.prototype.closeModal.call(player);
    Player.prototype.openChatModal.call(player, 200);
    NetworkPlayer.prototype.encodeOut.call(player);

    const writes = modalWrites(player);
    assert.equal(writes.filter(message => message instanceof IfClose).length, 1);
    assert(writes[0] instanceof IfClose, 'pending close must be flushed first');
    assert(writes[1] instanceof IfOpenChat, 'chat must open after the close');
    assert.equal(writes.slice(2).filter(message => message instanceof IfClose).length, 0, 'chat open must not be followed by a close');
    assert.equal(player.refreshModalClose, false);
    assert.equal(player.refreshModal, false);
    assert.equal(player.modalChat, 200);
    assert.equal(player.lastModalChat, 200);
}

{
    const player = makePlayer();
    player.modalState = ModalState.MAIN;
    player.modalMain = 10051;

    Player.prototype.closeModal.call(player);
    NetworkPlayer.prototype.encodeOut.call(player);

    const writes = modalWrites(player);
    assert.equal(writes.length, 1);
    assert(writes[0] instanceof IfClose, 'close-only tick must flush its close');
    assert.equal(player.refreshModalClose, false);
}

{
    const player = makePlayer();
    Player.prototype.openChatModal.call(player, 200);
    NetworkPlayer.prototype.encodeOut.call(player);

    const writes = modalWrites(player);
    assert.equal(writes.length, 1);
    assert(writes[0] instanceof IfOpenChat);
    assert.equal(player.refreshModalClose, false);
}

{
    const player = makePlayer();
    Player.prototype.openChatModal.call(player, 200);
    Player.prototype.openChatModal.call(player, 201);
    NetworkPlayer.prototype.encodeOut.call(player);

    const writes = modalWrites(player);
    assert.equal(writes.filter(message => message instanceof IfClose).length, 0);
    assert.equal(writes.filter(message => message instanceof IfOpenChat).length, 2);
    assert.equal(player.lastModalChat, 201);
}

{
    const player = makePlayer();
    player.modalState = ModalState.MAIN;
    player.modalMain = 10051;
    player.lastModalMain = 10051;

    Player.prototype.closeModal.call(player);
    Player.prototype.openMainModal.call(player, 10051);
    NetworkPlayer.prototype.encodeOut.call(player);

    const writes = modalWrites(player);
    assert(writes[0] instanceof IfClose, 'deferred main open must retain close-first ordering');
    assert(writes[1] instanceof IfOpenMain, 'deferred main open must still be emitted');
}

console.log('Modal close/open ordering behavior ok');
process.exit(0);
