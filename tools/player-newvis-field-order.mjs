/**
 * Regression: PlayerInfoEncoder new-player wire field order must match
 * Java Client.getPlayerNewVis (pid11, dx5, extended1, jump1, dz5).
 *
 * Invokes the real encoder; independently decodes with the Java order.
 * Run: node --experimental-strip-types tools/player-newvis-field-order.mjs
 *   or: npx tsx tools/player-newvis-field-order.mjs
 */
import { PlayerInfoEncoder } from '../src/network/rsbuf/info.ts';
import { Player } from '../src/network/rsbuf/player.ts';
import { PlayerRenderer } from '../src/network/rsbuf/renderer.ts';
import { ZoneMap } from '../src/network/rsbuf/grid.ts';
import { CoordGrid } from '../src/network/rsbuf/coord.ts';

class BitReader {
    constructor(data, bitLength) {
        this.data = data;
        this.bitPos = 0;
        this.bitEnd = bitLength;
    }

    gBit(n) {
        let value = 0;
        let remaining = n;
        while (remaining > 0) {
            if (this.bitPos >= this.bitEnd) {
                throw new Error(`gBit(${n}): past end at bitPos=${this.bitPos} bitEnd=${this.bitEnd}`);
            }
            const bytePos = this.bitPos >> 3;
            const bitOff = this.bitPos & 7;
            const avail = 8 - bitOff;
            const take = Math.min(remaining, avail);
            const shift = avail - take;
            const mask = (1 << take) - 1;
            value = (value << take) | ((this.data[bytePos] >> shift) & mask);
            this.bitPos += take;
            remaining -= take;
        }
        return value;
    }

    bitsRemaining() {
        return this.bitEnd - this.bitPos;
    }

    accessBytes() {
        return (this.bitPos + 7) >> 3;
    }
}

function signed5(v) {
    return v > 15 ? v - 32 : v;
}

/** Decode new-player section after local idle + known-count, Java field order. */
function decodeNewVisJavaOrder(payload) {
    // Full packet bit stream starts at 0. Local player: idle (1 bit 0). Known count: 8 bits.
    const bitEnd = payload.length * 8;
    const br = new BitReader(payload, bitEnd);

    const localUpdate = br.gBit(1);
    if (localUpdate !== 0) {
        throw new Error(`expected local idle bit 0, got ${localUpdate}`);
    }
    const known = br.gBit(8);
    if (known !== 0) {
        throw new Error(`expected known count 0, got ${known}`);
    }

    const news = [];
    // Java: while (bitPos + 10 < psize * 8)
    while (br.bitPos + 10 < bitEnd) {
        const pid = br.gBit(11);
        if (pid === 2047) {
            break;
        }
        const dx = signed5(br.gBit(5));
        const extended = br.gBit(1);
        const jump = br.gBit(1);
        const dz = signed5(br.gBit(5));
        news.push({ pid, dx, jump: jump === 1, extended: extended === 1, dz });
    }

    const bytePos = br.accessBytes();
    const updates = payload.subarray(bytePos);
    let upos = 0;
    for (const n of news) {
        if (!n.extended) {
            n.extendedBytes = 0;
            continue;
        }
        if (upos >= updates.length) {
            throw new Error(`extended flag set for pid ${n.pid} but no update bytes remain`);
        }
        let masks = updates[upos++];
        let header = 1;
        if ((masks & 0x20) !== 0) {
            if (upos >= updates.length) {
                throw new Error('BIG mask high byte missing');
            }
            masks |= updates[upos++] << 8;
            header = 2;
        }
        // FACE_COORD = 2 → 4 bytes; optional APPEARANCE = 4 → 1 + len
        let body = 0;
        if ((masks & 2) !== 0) {
            body += 4;
        }
        if ((masks & 4) !== 0) {
            if (upos + body >= updates.length) {
                throw new Error('appearance length missing');
            }
            body += 1 + updates[upos + body];
        }
        if ((masks & 1) !== 0) {
            body += 2;
        }
        if (upos + body > updates.length) {
            throw new Error(
                `extended body overrun for pid ${n.pid}: need ${header + body}, have ${updates.length - (upos - header)}`
            );
        }
        upos += body;
        n.extendedBytes = header + body;
        n.masks = masks;
    }

    return {
        news,
        terminatorAligned: true,
        updateBytesConsumed: upos,
        updateBytesTotal: updates.length,
        residualUpdateBytes: updates.length - upos,
    };
}

function encodeCase({ localPid, otherPid, dx, dz, jump }) {
    const encoder = new PlayerInfoEncoder();
    const renderer = new PlayerRenderer();
    const map = new ZoneMap();
    const grid = new Map();
    const players = Array(2048).fill(null);

    const local = new Player(localPid);
    const other = new Player(otherPid);

    const baseX = 3200;
    const baseZ = 3200;
    const y = 0;

    local.coord = CoordGrid.from(baseX, y, baseZ);
    local.origin = CoordGrid.from(baseX, y, baseZ);
    local.active = true;
    local.tele = false;
    local.jump = false;
    local.walkDir = -1;
    local.runDir = -1;
    local.masks = 0;

    other.coord = CoordGrid.from(baseX + dx, y, baseZ + dz);
    other.origin = CoordGrid.from(baseX + dx, y, baseZ + dz);
    other.active = true;
    other.tele = false;
    other.jump = jump;
    other.walkDir = -1;
    other.runDir = -1;
    other.masks = 0;
    other.lastAppearance = -1;
    other.appearance = new Uint8Array(0);

    players[localPid] = local;
    players[otherPid] = other;

    map.zone(local.coord.x(), local.coord.y(), local.coord.z()).addPlayer(localPid);
    map.zone(other.coord.x(), other.coord.y(), other.coord.z()).addPlayer(otherPid);

    const packedLocal = local.coord.packed;
    const packedOther = other.coord.packed;
    grid.set(packedLocal, [localPid]);
    if (packedOther === packedLocal) {
        grid.get(packedLocal).push(otherPid);
    } else {
        grid.set(packedOther, [otherPid]);
    }

    // rebuild=true clears known list so other goes through writeNewPlayers / add
    return encoder.encode(0, renderer, players, map, grid, local, 0, 0, true);
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

function runCase(label, spec) {
    const payload = encodeCase(spec);
    assert(payload.length > 0, `${label}: empty payload`);

    let decoded;
    try {
        decoded = decodeNewVisJavaOrder(payload);
    } catch (e) {
        throw new Error(`${label}: Java-order decode failed: ${e.message}`);
    }

    assert(decoded.news.length === 1, `${label}: expected 1 new player, got ${decoded.news.length}`);
    const n = decoded.news[0];
    assert(n.pid === spec.otherPid, `${label}: pid ${n.pid} !== ${spec.otherPid}`);
    assert(n.dx === spec.dx, `${label}: dx ${n.dx} !== ${spec.dx}`);
    assert(n.dz === spec.dz, `${label}: dz ${n.dz} !== ${spec.dz}`);
    assert(n.jump === spec.jump, `${label}: jump ${n.jump} !== ${spec.jump}`);
    assert(n.extended === true, `${label}: extended should be 1 (engine always writes lowdefinition)`);
    assert(n.extendedBytes > 0, `${label}: extended data not consumed`);
    assert(decoded.residualUpdateBytes === 0, `${label}: residual update bytes ${decoded.residualUpdateBytes}`);
    return { label, ok: true, n, payloadLen: payload.length };
}

const cases = [
    { label: 'zero offsets, jump false', localPid: 1, otherPid: 2, dx: 0, dz: 0, jump: false },
    { label: 'positive unequal offsets, jump false', localPid: 1, otherPid: 3, dx: 4, dz: 1, jump: false },
    { label: 'negative unequal offsets, jump true', localPid: 5, otherPid: 7, dx: -3, dz: -7, jump: true },
    { label: 'mixed sign unequal offsets, jump true', localPid: 10, otherPid: 11, dx: 5, dz: -2, jump: true },
    { label: 'edge 5-bit positive, jump false', localPid: 20, otherPid: 21, dx: 15, dz: 1, jump: false },
    // viewDistance default 15; |dx|/|dz| must stay within it for discovery
    { label: 'edge 5-bit negative, jump true', localPid: 30, otherPid: 31, dx: -15, dz: 8, jump: true },
];

const results = [];
let failed = 0;
for (const c of cases) {
    try {
        results.push(runCase(c.label, c));
        console.log(`PASS  ${c.label}`);
    } catch (e) {
        failed++;
        console.error(`FAIL  ${c.label}: ${e.message}`);
        results.push({ label: c.label, ok: false, error: e.message });
    }
}

if (failed > 0) {
    console.error(`\n${failed}/${cases.length} cases failed`);
    process.exit(1);
}
console.log(`\n${cases.length}/${cases.length} cases passed`);
