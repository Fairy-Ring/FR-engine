/**
 * Page-side harness adapter — NOT a Client-TS fork.
 *
 * Emulates rs2b0t ClientAdapter:
 *   reader  — snapshots from a live Client instance
 *   actions — Client.useMenuOption / tryMove / IF_BUTTON (wire-identical to menu click)
 *
 * Loaded only by the **harness client** (`client-entry.ts` → harness-client.js),
 * which passes IfType/LocType/ObjType hooks. Pure `client.js` has no harness code.
 *
 * Use **build:dev** for the embedded Client (private field names).
 *
 * @see rs2b0t docs/ARCHITECTURE.md
 */

// Decision 012: Spessa + MidiFacade (not tinymidipcm)
import { stopMidi } from '../../vendor/client-ts/src/sound/MidiFacade.js';

// MiniMenuAction (377) — wire values from vendor/client-ts MiniMenuAction
const OP_LOC = [625, 721, 743, 357, 1071]; // OP_LOC1..5
const OP_NPC = [242, 209, 309, 852, 793]; // OP_NPC1..5
const OP_HELD = [694, 962, 795, 681, 100]; // OP_HELD1..5
/** Ground stack ops — OP_OBJ1..5 (Take defaults to OP_OBJ3 when type.op[2] empty). */
const OP_OBJ = [139, 778, 617, 224, 662];
const USEHELD_START = 102;
const USEHELD_ONHELD = 398;
const USEHELD_ONLOC = 810;
const USEHELD_ONNPC = 829;
const TGT_BUTTON = 274;
const TGT_NPC = 240;
const IF_BUTTON = 231;
const CLOSE_BUTTON = 737;
const PAUSE_BUTTON = 997;
const INV_BUTTON = [582, 113, 555, 331, 354]; // INV_BUTTON1..5
/** ClientProt.TUT_CLICKSIDE — server [tutorial,_] on flashing-tab open */
const TUT_CLICKSIDE = 119;

const CLIENT_CHEAT = 56;
const BUTTON_OK = 1;
const BUTTON_CONTINUE = 6;
const BUTTON_TARGET = 2;
const TYPE_INV = 2;
const SCRATCH = 499;
const SCENE = 104;
const VARP_TUTORIAL = 281; // may not be reliable — prefer inv/skills/tile for stages
const DESIGN_MODAL = 3559;
const DESIGN_ACCEPT = 3651;

/** Skill.names order (Client Skill.ts) for stat snapshots */
const SKILL_NAMES = [
  'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic',
  'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking', 'crafting',
  'smithing', 'mining', 'herblore', 'agility', 'thieving', 'slayer', '-unused-',
  'runecraft'
];

/**
 * Live CollisionMap: open Horror bridge gap 2597,3608 (see collisionPatches.ts).
 * Re-applies after scene rebuild. Named historically "outpost" — also bridge seam.
 * @param {any} client
 */
export function applyOutpostCollisionLivePatch(client) {
  if (!client) return;
  const maps = client.collision;
  if (!maps) return;
  const baseX = client.mapBuildBaseX | 0;
  const baseZ = client.mapBuildBaseZ | 0;
  const level = client.minusedlevel | 0;
  const map = maps[level];
  if (!map || !map.flags) return;
  const wx = 2597;
  const wz = 3608;
  const lx = wx - baseX;
  const lz = wz - baseZ;
  if (lx < 0 || lz < 0 || lx >= SCENE || lz >= SCENE) return;
  // Clear wall bits that block E/W entry (W_E / W_W and diagonals).
  const CF_WE = 0x8;
  const CF_WW = 0x80;
  const CF_DIAG = 0x4 | 0x10 | 0x1 | 0x40;
  const idx = lx * SCENE + lz;
  // Full open on gap + strip E/W walls on neighbours (tryMove checks dest walls).
  map.flags[idx] = 0;
  if (lx > 0) {
    const i = (lx - 1) * SCENE + lz;
    map.flags[i] = (map.flags[i] | 0) & ~(CF_WE | CF_DIAG);
  }
  if (lx + 1 < SCENE) {
    const i = (lx + 1) * SCENE + lz;
    map.flags[i] = (map.flags[i] | 0) & ~(CF_WW | CF_DIAG);
  }
}

/**
 * @param {any} client live stock Client instance
 * @param {{ ifGet?: Function, locList?: Function, objList?: Function, npcList?: Function, varbitList?: Function }} [hooks]
 *        Type registries from harness client-entry (not from pure Client.ts).
 */
export function install(client, hooks = {}) {
  if (!client) throw new Error('install(client): missing client');

  // Prefer explicit hooks from harness-client; optional global for debugging.
  const h = hooks?.ifGet ? hooks : globalThis.__lc377_hooks || hooks;
  if (!h?.ifGet) {
    console.warn('[harness] type hooks missing — use harness-client.js (not pure client.js)');
  }

  const ifGet = id => {
    try {
      return h?.ifGet?.(id) ?? null;
    } catch {
      return null;
    }
  };
  const locList = id => {
    try {
      return h?.locList?.(id) ?? null;
    } catch {
      return null;
    }
  };
  const objList = id => {
    try {
      return h?.objList?.(id) ?? null;
    } catch {
      return null;
    }
  };
  const npcList = id => {
    try {
      return h?.npcList?.(id) ?? null;
    } catch {
      return null;
    }
  };
  /**
   * Prefer pure Client NpcType.activeType / getMultiNpc (method476) when present.
   * Fallback mirrors that resolve for older bundles.
   * TBWT Tiadeche shore base has no name/models — concrete form is multinpc[tbwt_main].
   */
  const resolveNpcType = base => {
    if (!base) return null;
    try {
      if (typeof base.activeType === 'function') {
        return base.activeType();
      }
      if (typeof base.getMultiNpc === 'function' && base.multinpc) {
        return base.getMultiNpc();
      }
    } catch {
      /* fall through */
    }
    const multi = base.multinpc;
    if (!multi || multi.length === 0) return base;
    let state = -1;
    const mvb = base.multivarbit | 0;
    const mv = base.multivar | 0;
    try {
      if (mvb !== -1 && mvb !== 65535) {
        const vb = h?.varbitList?.(mvb);
        if (vb) {
          const width = ((vb.endbit | 0) - (vb.startbit | 0)) | 0;
          const mask = width >= 0 && width < 32 ? (1 << (width + 1)) - 1 : 0xffffffff;
          state =
            ((client.var?.[vb.basevar | 0] | 0) >> (vb.startbit | 0)) & mask;
        }
      } else if (mv !== -1 && mv !== 65535) {
        state = client.var?.[mv] | 0;
      }
    } catch {
      return base;
    }
    if (state < 0 || state >= multi.length) return null;
    const id = multi[state] | 0;
    if (id === -1 || id === 65535) return null;
    return npcList(id) ?? base;
  };

  // ── reader ─────────────────────────────────────────────────────────
  const reader = {
    loopCycle: () => (client.constructor?.loopCycle ?? 0) | 0,
    ingame: () => !!client.ingame,
    sceneState: () => client.sceneState | 0,
    /**
     * Why sceneState may be stuck at 1 (land/loc/models/playerinfo).
     * Aligns with Client.checkScene codes + diag log.
     */
    sceneDiag() {
      const state = client.sceneState | 0;
      let missingLand = 0;
      let missingLoc = 0;
      const ground = client.mapBuildGroundData;
      const locs = client.mapBuildLocationData;
      const gFile = client.mapBuildGroundFile;
      const lFile = client.mapBuildLocationFile;
      if (ground && locs && gFile && lFile) {
        for (let i = 0; i < ground.length; i++) {
          if (ground[i] == null && gFile[i] !== -1) missingLand++;
          if (locs[i] == null && lFile[i] !== -1) missingLoc++;
        }
      }
      let status = 0;
      if (!client.mapBuildIndex || !ground || !locs) status = -1000;
      else if (missingLand > 0) status = -1;
      else if (missingLoc > 0) status = -2;
      else if (client.awaitingPlayerInfo) status = -4;
      else if (state === 1) status = -3; // models / not yet built (checkLocations not public)
      return {
        sceneState: state,
        ingame: !!client.ingame,
        status,
        missingLand,
        missingLoc,
        onDemandRem: client.onDemand?.remaining?.() ?? -1,
        zones: [client.mapBuildCentreZoneX | 0, client.mapBuildCentreZoneZ | 0],
        base: [client.mapBuildBaseX | 0, client.mapBuildBaseZ | 0],
        loginMes: `${client.loginMes1 ?? ''} / ${client.loginMes2 ?? ''}`
      };
    },
    loginMes: () => `${client.loginMes1 ?? ''} / ${client.loginMes2 ?? ''}`,
    loginscreen: () => client.loginscreen | 0,
    varp(id) {
      const v = client.var;
      if (!v || id < 0 || id >= v.length) return 0;
      return v[id] | 0;
    },
    /**
     * Tutorial progress varp if present. Many progress varps are not transmitted
     * (274 lesson) — scripts must not stage solely on this; use inv/skills/tile.
     */
    tutorial: () => reader.varp(VARP_TUTORIAL),
    skillCount: () => SKILL_NAMES.length,
    /** @returns {{ name: string, effective: number, base: number, xp: number }} */
    stat(index) {
      const i = index | 0;
      const name = SKILL_NAMES[i] ?? `#${i}`;
      return {
        name,
        effective: (client.statEffectiveLevel?.[i] ?? 1) | 0,
        base: (client.statBaseLevel?.[i] ?? 1) | 0,
        xp: (client.statXP?.[i] ?? 0) | 0
      };
    },
    /** Local player primary anim id, or -1 when idle. */
    selfAnim() {
      const p = client.localPlayer;
      if (!p) return -1;
      return (p.primaryAnim ?? -1) | 0;
    },
    /**
     * Mid exact-move or still routing a walk — real "finish what you are doing".
     * Do **not** key on primaryAnim alone: many ready/idle-looking anims never
     * clear to -1 (upstream lesson) and hang waitIdle forever.
     */
    playerMoving() {
      const p = client.localPlayer;
      if (!p) return true;
      const cycle = (client.constructor?.loopCycle ?? client.loopCycle ?? 0) | 0;
      const emEnd = (p.exactMoveEnd ?? 0) | 0;
      const emStart = (p.exactMoveStart ?? 0) | 0;
      if (emEnd > cycle || emStart >= cycle) return true;
      if (((p.routeLength ?? 0) | 0) > 0) return true;
      return false;
    },
    /**
     * @deprecated Prefer playerMoving() + short anim grace. Sticky primaryAnim
     * alone is not "busy" for settle waits.
     */
    playerBusy() {
      const p = client.localPlayer;
      if (!p) return true;
      const cycle = (client.constructor?.loopCycle ?? client.loopCycle ?? 0) | 0;
      const emEnd = (p.exactMoveEnd ?? 0) | 0;
      const emStart = (p.exactMoveStart ?? 0) | 0;
      if (emEnd > cycle || emStart >= cycle) return true;
      if (((p.routeLength ?? 0) | 0) > 0) return true;
      return false;
    },
    loopCycle() {
      return (client.constructor?.loopCycle ?? client.loopCycle ?? 0) | 0;
    },
    /**
     * Run energy 0–100 (UPDATE_RUNENERGY g1). Not shown clearly on 377 HUD without hunting.
     */
    energy() {
      return (client.runenergy ?? 0) | 0;
    },
    /** Run weight in kg (UPDATE_RUNWEIGHT g2b). */
    weight() {
      return (client.runweight ?? 0) | 0;
    },
    /**
     * Hitpoints effective/base (skill index 3). 377 HUD is sparse — panel debug.
     * @returns {{ effective: number, base: number, xp: number }}
     */
    hitpoints() {
      const s = reader.stat(3);
      return { effective: s.effective | 0, base: s.base | 0, xp: s.xp | 0 };
    },
    /**
     * Recent game/public/private chat lines (newest first).
     * Mirrors rs2b0t ClientAdapter.chat — client chatType/Username/Text ring (100).
     * @param {number} [count=12]
     * @returns {{ type: number, username: string|null, text: string }[]}
     */
    chat(count = 12) {
      const n = Math.max(0, Math.min(100, count | 0));
      const texts = client.chatText;
      const types = client.chatType;
      const users = client.chatUsername;
      if (!texts || !types) return [];
      const out = [];
      for (let i = 0; i < n && i < texts.length; i++) {
        const text = texts[i];
        if (text == null || text === '') break;
        out.push({
          type: (types[i] ?? 0) | 0,
          username: users?.[i] != null && users[i] !== '' ? String(users[i]) : null,
          text: String(text)
        });
      }
      return out;
    },
    /**
     * Run toggle for client-trail multicolour paint.
     * Prefer harness setRun latch; then client fields used by 377 Client-TS.
     */
    runEnabled() {
      if (client._harnessRunOn === true) return true;
      if (client._harnessRunOn === false) return false;
      return !!(client.alreadyrunning || client.runMode || client.flagRun || client.running);
    },
    /**
     * Orbit camera yaw 0–2047 (client-only; TS-private on Client, plain at runtime).
     * Used by nav path camera follow.
     */
    cameraYaw() {
      return (client.orbitCameraYaw | 0) & 0x7ff;
    },
    cameraPitch() {
      return client.orbitCameraPitch | 0;
    },
    inCombat() {
      const p = client.localPlayer;
      if (!p) return false;
      const cycle = client.constructor?.loopCycle ?? 0;
      return (p.combatCycle | 0) > cycle + 100;
    },
    worldTile() {
      const p = client.localPlayer;
      if (!p) return null;
      const lx = p.routeX[0] | 0;
      const lz = p.routeZ[0] | 0;
      return {
        x: (client.mapBuildBaseX | 0) + lx,
        z: (client.mapBuildBaseZ | 0) + lz,
        level: client.minusedlevel | 0,
        lx,
        lz
      };
    },
    mapBuildBase: () => ({ x: client.mapBuildBaseX | 0, z: client.mapBuildBaseZ | 0 }),
    toLocal(wx, wz) {
      const lx = (wx | 0) - (client.mapBuildBaseX | 0);
      const lz = (wz | 0) - (client.mapBuildBaseZ | 0);
      if (lx < 0 || lz < 0 || lx >= SCENE || lz >= SCENE) return null;
      return { lx, lz };
    },
    /**
     * Scene collision flags at local tile (rs2b0t reader.collisionFlags).
     * Used by classic walk corridor / Reachability.canReach.
     */
    collisionFlags(lx, lz) {
      applyOutpostCollisionLivePatch(client);
      const x = lx | 0;
      const z = lz | 0;
      if (x < 0 || z < 0 || x >= SCENE || z >= SCENE) return null;
      const maps = client.collision;
      if (!maps) return null;
      const level = client.minusedlevel | 0;
      const map = maps[level];
      if (!map || !map.flags) return null;
      // CollisionMap.index = x * SIZE + z (BuildArea.SIZE === SCENE)
      return map.flags[x * SCENE + z] | 0;
    },
    /**
     * Last tryMove path as world tiles (src→dest). Requires harness Client fork
     * (`lastWalkPathLocal`). Empty on pure Client.
     */
    lastWalkPathWorld() {
      const local = client.lastWalkPathLocal;
      if (!Array.isArray(local) || local.length === 0) return [];
      const bx = client.mapBuildBaseX | 0;
      const bz = client.mapBuildBaseZ | 0;
      const level = client.minusedlevel | 0;
      return local.map(p => ({
        x: bx + (p.x | 0),
        z: bz + (p.z | 0),
        level
      }));
    },
    /**
     * Project world tile corner into areaGame pixels (harness fork projectAreaGame).
     * Only accurate during onAfterWorldRender.
     */
    projectAreaGameWorld(wx, wz, height = 0, u = 0.5, v = 0.5) {
      if (typeof client.projectAreaGame !== 'function') return null;
      const baseX = client.mapBuildBaseX | 0;
      const baseZ = client.mapBuildBaseZ | 0;
      // scene fine coords: tile centre / corner in 128-units
      const sceneX = ((wx - baseX) << 7) + Math.floor(u * 128);
      const sceneZ = ((wz - baseZ) << 7) + Math.floor(v * 128);
      return client.projectAreaGame(sceneX, sceneZ, height | 0);
    },
    modals: () => ({
      main: client.mainModalId ?? -1,
      side: client.sideModalId ?? -1,
      chat: client.chatModalId ?? -1
    }),
    activeSideTab: () => client.activeIcon | 0,
    sideTabInterface: tab => client.sideIcon?.[tab] ?? -1,

    npcs() {
      const out = [];
      const self = client.localPlayer;
      if (!self || !client.npc || !client.npcIds) return out;
      const px = (client.mapBuildBaseX | 0) + (self.x >> 7);
      const pz = (client.mapBuildBaseZ | 0) + (self.z >> 7);
      for (let i = 0; i < (client.npcCount | 0); i++) {
        const index = client.npcIds[i];
        const npc = client.npc[index];
        if (!npc?.type) continue;
        // Multi-npc base often has no display name (TBWT Tiadeche shore).
        // Resolve like Client.resolveMultiNpc; skip inactive multi slots.
        const type = resolveNpcType(npc.type);
        if (!type) continue;
        const x = (client.mapBuildBaseX | 0) + (npc.x >> 7);
        const z = (client.mapBuildBaseZ | 0) + (npc.z >> 7);
        const ops = Array.isArray(type.op) ? [...type.op] : [];
        const cycle = client.constructor?.loopCycle ?? 0;
        const combatCycle = npc.combatCycle | 0;
        out.push({
          index,
          id: type.id ?? npc.type.id ?? -1,
          name: type.name ?? null,
          ops,
          tile: { x, z, level: client.minusedlevel | 0 },
          distance: Math.max(Math.abs(x - px), Math.abs(z - pz)),
          inCombat: combatCycle > cycle + 100
        });
      }
      out.sort((a, b) => a.distance - b.distance);
      return out;
    },

    nearestNpc(name) {
      const want = String(name).toLowerCase();
      return reader.npcs().find(n => n.name && n.name.toLowerCase() === want) ?? null;
    },

    /**
     * Ground item stacks in the current scene (Client.groundObj).
     * Ops: type.op with default Take on slot 2 (Java/rs2b0t groundOps).
     * @param {{ maxDist?: number, name?: string }} [opts]
     */
    groundItems(opts = {}) {
      const out = [];
      const self = client.localPlayer;
      const grid = client.groundObj;
      if (!self || !grid) return out;
      const level = client.minusedlevel | 0;
      const baseX = client.mapBuildBaseX | 0;
      const baseZ = client.mapBuildBaseZ | 0;
      const px = baseX + (self.x >> 7);
      const pz = baseZ + (self.z >> 7);
      const maxD = opts.maxDist ?? 24;
      const want = opts.name?.trim().toLowerCase() || null;
      const layer = grid[level];
      if (!layer) return out;

      for (let lx = 0; lx < SCENE; lx++) {
        const row = layer[lx];
        if (!row) continue;
        for (let lz = 0; lz < SCENE; lz++) {
          const stack = row[lz];
          if (!stack) continue;
          const x = baseX + lx;
          const z = baseZ + lz;
          const distance = Math.max(Math.abs(x - px), Math.abs(z - pz));
          if (distance > maxD) continue;
          // Iterate head→next (same as rs2b0t ClientAdapter.groundItems)
          for (let obj = stack.head?.() ?? null; obj; obj = stack.next?.() ?? null) {
            const id = obj.id | 0;
            const type = objList(id);
            const name = type?.name ?? null;
            if (want && (!name || !name.toLowerCase().includes(want))) continue;
            const ops = Array.isArray(type?.op) ? [...type.op] : [null, null, null, null, null];
            while (ops.length < 5) ops.push(null);
            if (!ops[2]) ops[2] = 'Take';
            out.push({
              id,
              name,
              count: (obj.count | 0) || 1,
              ops,
              tile: { x, z, level },
              lx,
              lz,
              distance
            });
          }
        }
      }
      out.sort((a, b) => a.distance - b.distance);
      return out;
    },

    /**
     * Nearby locs with optional name filter (uses LocType.list from hooks).
     * @param {{ name?: string, maxDist?: number }} [opts]
     */
    locs(opts = {}) {
      const out = [];
      const world = client.world;
      const self = client.localPlayer;
      if (!world || !self) return out;
      const level = client.minusedlevel | 0;
      const plx = self.routeX[0] | 0;
      const plz = self.routeZ[0] | 0;
      const maxD = opts.maxDist ?? 15;
      const want = opts.name?.trim().toLowerCase() || null;

      for (let lx = Math.max(0, plx - maxD); lx <= Math.min(SCENE - 1, plx + maxD); lx++) {
        for (let lz = Math.max(0, plz - maxD); lz <= Math.min(SCENE - 1, plz + maxD); lz++) {
          const codes = [];
          try {
            const wall = world.getWall?.(level, lx, lz);
            if (wall?.typecode) codes.push(wall.typecode | 0);
            const decor = world.getDecor?.(level, lz, lx);
            if (decor?.typecode) codes.push(decor.typecode | 0);
            const scene = world.getScene?.(level, lx, lz);
            if (scene?.typecode) codes.push(scene.typecode | 0);
            const gd = world.getGd?.(level, lx, lz);
            if (gd?.typecode) codes.push(gd.typecode | 0);
          } catch {
            continue;
          }
          for (const typecode of codes) {
            const id = (typecode >> 14) & 0x7fff;
            let name = null;
            let ops = [];
            const lt = locList(id);
            if (lt) {
              name = lt.name ?? null;
              ops = Array.isArray(lt.op) ? [...lt.op] : [];
            }
            // Substring match (exact was dropping "Wall of flame" vs partial needles)
            if (want && (!name || !name.toLowerCase().includes(want))) continue;
            const x = (client.mapBuildBaseX | 0) + lx;
            const z = (client.mapBuildBaseZ | 0) + lz;
            out.push({
              typecode,
              id,
              name,
              ops,
              lx,
              lz,
              x,
              z,
              distance: Math.max(Math.abs(lx - plx), Math.abs(lz - plz))
            });
          }
        }
      }
      out.sort((a, b) => a.distance - b.distance);
      return out;
    },

    nearestLoc(name) {
      const list = reader.locs({ name, maxDist: 20 });
      return list[0] ?? null;
    },

    locAt(wx, wz) {
      const local = reader.toLocal(wx, wz);
      if (!local) return null;
      const hits = reader.locs({ maxDist: 50 }).filter(l => l.lx === local.lx && l.lz === local.lz);
      return hits[0] ?? null;
    },

    /**
     * Client `tutComMessage` (Java modalMessage): type-0 mes while tutComId sticky
     * is set. Drawn as parchment + blue "Click to continue"; cleared by **any**
     * left mouse click (Client mouseLoop), not IF_BUTTON. Blocks chat UI.
     */
    modalMessage() {
      const m = client.tutComMessage;
      return m == null || m === '' ? null : String(m);
    },

    chatContinueComId() {
      // modalMessage has no component id — continueDialog dismisses it separately
      if ((client.chatModalId ?? -1) === -1) return -1;
      let found = -1;
      const visit = comId => {
        if (found !== -1) return;
        const com = ifGet(comId);
        if (!com) return;
        if (com.buttonType === BUTTON_CONTINUE) {
          found = comId;
          return;
        }
        if (com.children) for (const c of com.children) visit(c);
      };
      visit(client.chatModalId);
      return found;
    },

    chatOptions() {
      const out = [];
      if ((client.chatModalId ?? -1) === -1) return out;
      const visit = comId => {
        const com = ifGet(comId);
        if (!com) return;
        if (com.buttonType === BUTTON_OK) {
          const label = com.text ?? com.buttonText;
          if (label) out.push({ comId, text: String(label) });
        }
        if (com.children) for (const c of com.children) visit(c);
      };
      visit(client.chatModalId);
      return out;
    },

    /**
     * Visible chat body text (NPC name + lines). Successive "Click to continue"
     * pages share the same structure but **different text** — used for unique fingerprints.
     * Skips BUTTON_OK option labels and pure "Click here to continue" chrome.
     */
    chatBodyText() {
      if ((client.chatModalId ?? -1) === -1) {
        const m = reader.modalMessage();
        return m ? String(m) : '';
      }
      const parts = [];
      const visit = comId => {
        const com = ifGet(comId);
        if (!com) return;
        // Option buttons are multi choices — not body
        if (com.buttonType === BUTTON_OK) {
          if (com.children) for (const c of com.children) visit(c);
          return;
        }
        const t = com.text ?? com.buttonText ?? com.text2;
        if (t && typeof t === 'string') {
          const s = t.trim();
          if (
            s &&
            !/^click here to continue$/i.test(s) &&
            !/^please wait/i.test(s) &&
            !/^select an option$/i.test(s)
          ) {
            parts.push(s);
          }
        }
        if (com.children) for (const c of com.children) visit(c);
      };
      visit(client.chatModalId);
      return parts.join('\n');
    },

    /**
     * Chat blocked for interaction: sticky chat modal **or** modalMessage
     * ("You retrieve a bar of bronze." / Click to continue).
     */
    dialogOpen: () => (client.chatModalId ?? -1) !== -1 || !!reader.modalMessage(),

    inventory() {
      const out = [];
      const rootId = client.sideIcon?.[3] ?? -1;
      if (rootId === -1) return out;
      const invCom = findInvCom(rootId);
      if (!invCom?.linkObjType || !invCom.linkObjNumber) return out;
      // linkObjType stores objId+1 (0 = empty) — same as menu / rs2b0t adapter
      const comId = (invCom.id ?? rootId) | 0;
      for (let i = 0; i < invCom.linkObjType.length; i++) {
        const idPlusOne = invCom.linkObjType[i] | 0;
        if (idPlusOne <= 0) continue;
        const id = idPlusOne - 1;
        const ot = objList(id);
        const ops = Array.isArray(ot?.iop) ? [...ot.iop] : Array.isArray(ot?.op) ? [...ot.op] : [];
        out.push({
          slot: i,
          id,
          count: invCom.linkObjNumber[i] | 0,
          name: ot?.name ?? null,
          comId,
          ops
        });
      }
      return out;
    },

    /** Worn equipment (side tab 4). */
    equipment() {
      const out = [];
      const rootId = client.sideIcon?.[4] ?? -1;
      if (rootId === -1) return out;
      const invCom = findInvCom(rootId);
      if (!invCom?.linkObjType || !invCom.linkObjNumber) return out;
      const comId = (invCom.id ?? rootId) | 0;
      for (let i = 0; i < invCom.linkObjType.length; i++) {
        const idPlusOne = invCom.linkObjType[i] | 0;
        if (idPlusOne <= 0) continue;
        const id = idPlusOne - 1;
        const ot = objList(id);
        out.push({
          slot: i,
          id,
          count: invCom.linkObjNumber[i] | 0,
          name: ot?.name ?? null,
          comId,
          ops: Array.isArray(ot?.iop) ? [...ot.iop] : []
        });
      }
      return out;
    },

    bankOpen() {
      // Bank main modal typically large inv; also mainModalId known ranges — best-effort
      const main = client.mainModalId | 0;
      if (main === -1) return false;
      const com = ifGet(main);
      if (!com) return false;
      // Heuristic: bank root or child has a big inv
      const inv = findInvCom(main);
      return !!(inv?.linkObjType && inv.linkObjType.length >= 28);
    },

    invHas(nameSubstr) {
      const want = String(nameSubstr).toLowerCase();
      return reader.inventory().find(i => i.name && i.name.toLowerCase().includes(want)) ?? null;
    },

    /**
     * Smith / skill make-panel products under mainModalId.
     * rs2b0t ClientAdapter.mainSkillMultiItems: TYPE_INV children whose
     * component iop starts with "Make" (smithing.if column1–5 option1–3).
     * Ops come from the **component** iop (Make / Make 5 / Make 10), not ObjType.
     * @returns {{ slot: number, id: number, count: number, name: string|null, comId: number, ops: (string|null)[] }[]}
     */
    mainSkillMultiItems() {
      const main = client.mainModalId | 0;
      if (main === -1) return [];
      const out = [];
      const visit = comId => {
        const com = ifGet(comId);
        if (!com) return;
        const id = (com.id ?? comId) | 0;
        if (com.type === TYPE_INV) {
          const iop = Array.isArray(com.iop) ? com.iop : null;
          const hasMake = iop?.some(op => op != null && String(op).toLowerCase().startsWith('make'));
          if (hasMake && com.linkObjType && com.linkObjNumber) {
            for (let slot = 0; slot < com.linkObjType.length; slot++) {
              const idPlusOne = com.linkObjType[slot] | 0;
              if (idPlusOne <= 0) continue;
              const objId = idPlusOne - 1;
              const ot = objList(objId);
              out.push({
                slot,
                id: objId,
                count: com.linkObjNumber[slot] | 0,
                name: ot?.name ?? null,
                comId: id,
                // Component options — INV_BUTTON1..n (not held inventory iop)
                ops: iop.map(o => (o == null || o === '' ? null : String(o)))
              });
            }
          }
        }
        if (com.children) for (const c of com.children) visit(c);
      };
      visit(main);
      return out;
    },

    /**
     * TYPE_INV slots under mainModal (slide puzzles, etc.).
     * Ops from **ObjType.iop** (e.g. Move on reinit pieces), not component Make iop.
     * Empty slots omitted (idPlusOne <= 0). Prefer findInvCom (same as inventory/bank).
     */
    mainModalInvItems() {
      const main = client.mainModalId | 0;
      if (main === -1) return [];
      const out = [];
      const pushFrom = (invCom, comIdHint) => {
        if (!invCom) return;
        // Decode always allocates linkObjType for TYPE_INV; treat missing as empty
        const types = invCom.linkObjType;
        const nums = invCom.linkObjNumber;
        if (!types) return;
        const comId = (invCom.id ?? comIdHint ?? main) | 0;
        const len = types.length | 0;
        for (let slot = 0; slot < len; slot++) {
          const idPlusOne = types[slot] | 0;
          if (idPlusOne <= 0) continue;
          const objId = idPlusOne - 1;
          const ot = objList(objId);
          const ops = Array.isArray(ot?.iop) ? [...ot.iop] : Array.isArray(ot?.op) ? [...ot.op] : [];
          out.push({
            slot,
            id: objId,
            count: nums ? nums[slot] | 0 : 1,
            name: ot?.name ?? null,
            comId,
            ops
          });
        }
      };
      // Prefer explicit known reinit inv com id, then findInvCom, then BFS
      const REINIT_INV_COM = 19157; // reinitialisation_puzzle:com_3
      const tryIds = [REINIT_INV_COM, main];
      for (const id of tryIds) {
        const com = ifGet(id);
        if (com && (com.type === TYPE_INV || com.type === 2)) {
          if (com.id == null) com.id = id;
          pushFrom(com, id);
          if (out.length) return out;
        }
      }
      const invCom = findInvCom(main);
      if (invCom) {
        pushFrom(invCom, invCom.id);
        if (out.length) return out;
      }
      const visit = comId => {
        const com = ifGet(comId);
        if (!com) return;
        if (com.type === TYPE_INV || com.type === 2) {
          if (com.id == null) com.id = comId;
          pushFrom(com, comId);
        }
        const kids = com.children;
        if (kids) for (let i = 0; i < kids.length; i++) visit(kids[i] | 0);
      };
      visit(main);
      return out;
    },

    /** Debug: component tree under main modal (type, children, inv filled). */
    mainModalTree() {
      const main = client.mainModalId | 0;
      if (main === -1) return { main: -1, nodes: [] };
      const nodes = [];
      const visit = (comId, depth) => {
        if (depth > 6) return;
        const com = ifGet(comId);
        if (!com) {
          nodes.push({ id: comId, miss: true, depth });
          return;
        }
        const types = com.linkObjType;
        let filled = 0;
        if (types) for (let i = 0; i < types.length; i++) if ((types[i] | 0) > 0) filled++;
        nodes.push({
          id: comId,
          depth,
          type: com.type,
          kids: com.children ? com.children.length : 0,
          childIds: com.children ? [...com.children].slice(0, 12) : null,
          linkLen: types ? types.length : 0,
          filled
        });
        if (com.children) for (const c of com.children) visit(c | 0, depth + 1);
      };
      visit(main, 0);
      // also probe reinit com ids even if not in children
      for (let id = 19153; id <= 19158; id++) {
        if (!nodes.some(n => n.id === id)) visit(id, 0);
      }
      return { main, nodes };
    },

    /** Find IF button by visible text under a root (or main modal if root < 0). */
    buttonByText(rootComId, label) {
      const want = String(label).toLowerCase();
      const root = rootComId >= 0 ? rootComId : client.mainModalId | 0;
      if (root < 0) return -1;
      let found = -1;
      const visit = id => {
        if (found !== -1) return;
        const com = ifGet(id);
        if (!com) return;
        const t = `${com.text ?? ''} ${com.buttonText ?? ''} ${com.targetBase ?? ''}`.toLowerCase();
        if (t.includes(want) && (com.buttonType === BUTTON_OK || com.buttonType === BUTTON_TARGET || com.buttonType > 0)) {
          found = id;
          return;
        }
        if (com.children) for (const c of com.children) visit(c);
      };
      visit(root);
      return found;
    },

    targetButtonByBase(rootComId, base) {
      const want = String(base).toLowerCase();
      if (rootComId < 0) return -1;
      let found = -1;
      const visit = id => {
        if (found !== -1) return;
        const com = ifGet(id);
        if (!com) return;
        if (com.buttonType === BUTTON_TARGET && String(com.targetBase ?? '').toLowerCase() === want) {
          found = id;
          return;
        }
        // also match text
        if (String(com.targetBase ?? '').toLowerCase().includes(want) || String(com.text ?? '').toLowerCase().includes(want)) {
          if (com.buttonType === BUTTON_TARGET) {
            found = id;
            return;
          }
        }
        if (com.children) for (const c of com.children) visit(c);
      };
      visit(rootComId);
      return found;
    },

    closeButtonComId(rootComId) {
      // Prefer components named Close / X under modal
      const id = reader.buttonByText(rootComId, 'close');
      if (id !== -1) return id;
      // fallback: first child with close-ish
      return -1;
    },

    snapshot() {
      const hp = reader.hitpoints();
      return {
        ingame: reader.ingame(),
        sceneState: reader.sceneState(),
        tile: reader.worldTile(),
        tutorial: reader.tutorial(), // log-only; stages should not gate on this alone
        modals: reader.modals(),
        dialogOpen: reader.dialogOpen(),
        modalMessage: reader.modalMessage(),
        loopCycle: reader.loopCycle(),
        selfAnim: reader.selfAnim(),
        energy: reader.energy(),
        weight: reader.weight(),
        hitpoints: hp,
        skills: {
          firemaking: reader.stat(11).xp,
          cooking: reader.stat(7).xp,
          fishing: reader.stat(10).xp,
          smithing: reader.stat(13).xp,
          mining: reader.stat(14).xp,
          magic: reader.stat(6).xp,
          ranged: reader.stat(4).xp,
          hitpoints: hp.xp
        },
        chat: reader.chat(8).map(l => (l.username ? `${l.username}: ${l.text}` : l.text)),
        npcs: reader.npcs().slice(0, 8).map(n => n.name),
        // name#id@slot — catch wrong ObjType names vs empty progress
        inv: reader.inventory().map(i => `${i.name ?? '?'}#${i.id}@${i.slot}`),
        worn: reader.equipment().map(i => i.name)
      };
    },

    /**
     * Dense thrash datapoint — productive session telemetry (not a thin name list).
     * Host logs as one JSON line per tick; greppable / NDJSON.
     * @param {{ maxNpcs?: number, maxGround?: number, maxChat?: number, maxDist?: number }} [opts]
     */
    thrashSnap(opts = {}) {
      const maxNpcs = opts.maxNpcs ?? 16;
      const maxGround = opts.maxGround ?? 12;
      const maxChat = opts.maxChat ?? 6;
      const maxDist = opts.maxDist ?? 24;
      const tile = reader.worldTile();
      const inv = reader.inventory() ?? [];
      const worn = reader.equipment() ?? [];
      const hp = reader.hitpoints?.() ?? null;
      const npcs = (reader.npcs() ?? [])
        .filter(n => (n.distance ?? 999) <= maxDist)
        .slice(0, maxNpcs)
        .map(n => ({
          name: n.name,
          id: n.id,
          d: n.distance,
          wx: n.tile?.x,
          wz: n.tile?.z,
          combat: !!n.inCombat,
          idx: n.index,
          ops: (n.ops || []).filter(Boolean).slice(0, 5)
        }));
      const ground = (reader.groundItems?.({ maxDist }) ?? [])
        .slice(0, maxGround)
        .map(g => ({
          name: g.name,
          id: g.id,
          d: g.distance,
          wx: g.x ?? g.wx,
          wz: g.z ?? g.wz,
          n: g.count
        }));
      // Name histogram for "only Afflicted" vs "has Loar" at a glance
      const npcNames = {};
      for (const n of npcs) {
        const k = n.name || '?';
        npcNames[k] = (npcNames[k] || 0) + 1;
      }
      const invNames = inv.map(i => i?.name).filter(Boolean);
      const free = 28 - inv.length;
      return {
        ts: Date.now(),
        cycle: reader.loopCycle(),
        ingame: reader.ingame(),
        scene: reader.sceneState(),
        tile,
        moving: !!reader.playerMoving?.(),
        combat: !!reader.inCombat?.(),
        anim: reader.selfAnim?.() ?? -1,
        energy: reader.energy?.() ?? null,
        weight: reader.weight?.() ?? null,
        hp: hp
          ? { eff: hp.effective ?? hp.cur ?? null, base: hp.base ?? null }
          : null,
        free,
        inv: invNames,
        worn: worn.map(i => i?.name).filter(Boolean),
        has: {
          pyreLogs: invNames.some(n => /pyre logs/i.test(n)),
          sacredOil: invNames.some(n => /sacred oil/i.test(n)),
          olive: invNames.some(n => /olive oil/i.test(n)),
          remains: invNames.some(n => /remain/i.test(n)),
          tinder: invNames.some(n => /tinder/i.test(n)),
          logs: invNames.some(n => /^logs$/i.test(n))
        },
        npcNames,
        npcs,
        ground,
        chat: (reader.chat?.(maxChat) ?? []).map(l =>
          l?.username ? `${l.username}: ${l.text}` : String(l?.text ?? l ?? '')
        ),
        // Nearby locs (temple firewall / pyre / doors) — panel CLI + thrash grepping
        locs: (typeof reader.locs === 'function'
          ? reader.locs({ maxDist: opts.maxLocDist ?? 14 })
          : []
        )
          .slice(0, opts.maxLocs ?? 10)
          .map(l => ({
            name: l.name,
            id: l.id,
            d: l.distance,
            lx: l.lx,
            lz: l.lz,
            x: l.x,
            z: l.z
          })),
        modals: reader.modals?.() ?? null,
        dialog: !!reader.dialogOpen?.(),
        modalMes: reader.modalMessage?.() || null,
        sideTab: reader.activeSideTab?.() ?? null
      };
    }
  };

  // ── actions ────────────────────────────────────────────────────────
  const actions = {
    menuAction(action, a, b, c) {
      if (!client.ingame) return false;
      // Scene must be ready (2) — firing OPNPC/IF while sceneState=1 drops / no-ops
      if ((client.sceneState | 0) !== 2) return false;
      client.menuAction[SCRATCH] = action;
      client.menuParamA[SCRATCH] = a;
      client.menuParamB[SCRATCH] = b;
      client.menuParamC[SCRATCH] = c;
      client.useMenuOption(SCRATCH);
      return true;
    },
    walkTo(lx, lz) {
      if (!client.ingame || !client.localPlayer) return false;
      if ((client.sceneState | 0) !== 2) return false;
      return !!client.tryMove(
        client.localPlayer.routeX[0],
        client.localPlayer.routeZ[0],
        lx | 0,
        lz | 0,
        true,
        0,
        0,
        0,
        0,
        0,
        0
      );
    },
    walkRel(dx, dz) {
      if (!client.localPlayer) return false;
      return actions.walkTo(client.localPlayer.routeX[0] + (dx | 0), client.localPlayer.routeZ[0] + (dz | 0));
    },
    walkWorld(wx, wz) {
      const local = reader.toLocal(wx, wz);
      if (!local) return false;
      return actions.walkTo(local.lx, local.lz);
    },
    /**
     * Halt local player route (panel Stop / script abort).
     * Client Entity.abortRoute — stops footsteps immediately.
     */
    abortMovement() {
      const p = client.localPlayer;
      if (!p) return false;
      try {
        if (typeof p.abortRoute === 'function') {
          p.abortRoute();
          return true;
        }
      } catch (e) {
        console.warn('[harness] abortMovement', e);
      }
      return false;
    },
    talkNpc(name) {
      const n = reader.nearestNpc(name);
      if (!n) return false;
      return actions.menuAction(OP_NPC[0], n.index, 0, 0);
    },
    attackNpc(name) {
      const n = reader.nearestNpc(name);
      if (!n) return false;
      return actions.menuAction(OP_NPC[1], n.index, 0, 0);
    },
    /** NPC op by 1-based index (1=Talk, 2=Attack, …). */
    npcOp(index, op1based) {
      const code = OP_NPC[(op1based | 0) - 1];
      if (code == null) return false;
      return actions.menuAction(code, index | 0, 0, 0);
    },
    /**
     * Take / ground OP_OBJ. op1based 1..5 (Take is usually 3 when default).
     * menuAction(OP_OBJn, objId, lx, lz) — matches Client useMenuOption + rs2b0t takeObj.
     */
    takeObj(lx, lz, objId, op1based = 3) {
      const code = OP_OBJ[(op1based | 0) - 1];
      if (code == null) return false;
      return actions.menuAction(code, objId | 0, lx | 0, lz | 0);
    },
    /** Take nearest matching ground item by name substring (maxDist tiles). */
    takeGround(nameSubstr, maxDist = 12) {
      const want = String(nameSubstr).toLowerCase();
      const list = reader.groundItems({ maxDist });
      const hit =
        list.find(g => g.name && g.name.toLowerCase() === want) ??
        list.find(g => g.name && g.name.toLowerCase().includes(want));
      if (!hit) return false;
      // Prefer explicit Take op index
      let op = 3;
      const ops = hit.ops ?? [];
      for (let i = 0; i < ops.length; i++) {
        if (ops[i] && String(ops[i]).toLowerCase().includes('take')) {
          op = i + 1;
          break;
        }
      }
      return actions.takeObj(hit.lx, hit.lz, hit.id, op);
    },
    /**
     * First matching loc op by name + action substring (e.g. Tree + Chop).
     * Op index 0..4 → OP_LOC1..5.
     */
    opLoc(name, actionSubstr = '', maxDist = 16) {
      const wantAct = String(actionSubstr).toLowerCase();
      const list = reader.locs({ name, maxDist });
      for (const loc of list) {
        const ops = loc.ops || [];
        let opIndex = 0;
        if (wantAct) {
          const idx = ops.findIndex(o => o && String(o).toLowerCase().includes(wantAct));
          if (idx === -1) continue;
          opIndex = idx;
        }
        const code = OP_LOC[opIndex];
        if (code == null) continue;
        return actions.menuAction(code, loc.typecode, loc.lx, loc.lz);
      }
      return false;
    },
    /** Loc op by world tile + action substr (doors at known coords). */
    opLocAt(wx, wz, actionSubstr = '') {
      const loc = reader.locAt(wx, wz);
      if (!loc) return false;
      const wantAct = String(actionSubstr).toLowerCase();
      let opIndex = 0;
      if (wantAct) {
        const idx = (loc.ops || []).findIndex(o => o && String(o).toLowerCase().includes(wantAct));
        if (idx === -1) return false;
        opIndex = idx;
      }
      const code = OP_LOC[opIndex];
      if (code == null) return false;
      return actions.menuAction(code, loc.typecode, loc.lx, loc.lz);
    },
    opLoc1At(wx, wz) {
      return actions.opLocAt(wx, wz, '');
    },
    /**
     * Select held item then use on another held item (tinderbox→logs).
     * Prefer explicit ids/slots; names resolve via invHas (includes).
     * USEHELD_START sets client selection; USEHELD_ONHELD reads it for OPHELDU wire.
     */
    useHeldOnHeld(useNameOrSnap, targetNameOrSnap) {
      const use =
        typeof useNameOrSnap === 'object' && useNameOrSnap
          ? useNameOrSnap
          : reader.invHas(useNameOrSnap);
      const tgt =
        typeof targetNameOrSnap === 'object' && targetNameOrSnap
          ? targetNameOrSnap
          : reader.invHas(targetNameOrSnap);
      if (!use || !tgt) return false;
      if (use.slot === tgt.slot && use.comId === tgt.comId) return false;
      // a=objId, b=slot, c=comId (matches menu builder / useMenuOption USEHELD_*)
      if (!actions.menuAction(USEHELD_START, use.id | 0, use.slot | 0, use.comId | 0)) return false;
      return actions.menuAction(USEHELD_ONHELD, tgt.id | 0, tgt.slot | 0, tgt.comId | 0);
    },
    /**
     * Select held item then use on a loc (ore→furnace, dough→range).
     * use: string (includes) or inv snap `{ id, slot, comId }`.
     * loc: string name or loc snap `{ typecode, lx, lz }` (prefer snap — exact instance).
     * Inv panel need not be active side tab (tabs[] visibility, same idea as 274).
     */
    useHeldOnLoc(useNameOrSnap, locNameOrSnap, maxDist = 12) {
      const use =
        typeof useNameOrSnap === 'object' && useNameOrSnap
          ? useNameOrSnap
          : reader.invHas(useNameOrSnap);
      if (!use || use.id == null || use.slot == null) return false;
      let loc = null;
      if (typeof locNameOrSnap === 'object' && locNameOrSnap && locNameOrSnap.typecode != null) {
        loc = locNameOrSnap;
      } else {
        loc = reader.locs({ name: locNameOrSnap, maxDist })[0];
      }
      if (!loc || loc.typecode == null || loc.lx == null || loc.lz == null) return false;
      const comId = (use.comId | 0) || 0;
      if (!actions.menuAction(USEHELD_START, use.id | 0, use.slot | 0, comId)) return false;
      return actions.menuAction(USEHELD_ONLOC, loc.typecode | 0, loc.lx | 0, loc.lz | 0);
    },
    /**
     * Select held item then use on NPC (OPNPCU).
     * Prefer inv snap `{ id, slot, comId }` so dual-named objs (loaded vs empty vessel)
     * hit the correct slot — name-only invHas is first-match only.
     */
    useHeldOnNpc(useNameOrSnap, npcNameOrIndex) {
      const use =
        typeof useNameOrSnap === 'object' && useNameOrSnap && useNameOrSnap.id != null
          ? useNameOrSnap
          : reader.invHas(useNameOrSnap);
      if (!use) return false;
      let n = null;
      if (typeof npcNameOrIndex === 'number' && Number.isFinite(npcNameOrIndex)) {
        // Prefer exact index (multi Tyras guard at catapult)
        const list = reader.npcs?.() ?? [];
        n = list.find(x => (x.index | 0) === (npcNameOrIndex | 0)) || null;
        if (!n) n = { index: npcNameOrIndex | 0 };
      } else {
        n = reader.nearestNpc(npcNameOrIndex);
      }
      if (!n || n.index == null) return false;
      const comId = (use.comId | 0) || 0;
      if (!actions.menuAction(USEHELD_START, use.id | 0, use.slot | 0, comId)) return false;
      return actions.menuAction(USEHELD_ONNPC, n.index | 0, 0, 0);
    },
    ifButton(comId) {
      return actions.menuAction(IF_BUTTON, 0, 0, comId | 0);
    },
    /**
     * Dismiss Client.tutComMessage (Java modalMessage) — same as left-click
     * while "Click to continue" is shown. No server packet.
     */
    dismissModalMessage() {
      if (!client.tutComMessage) return false;
      client.tutComMessage = null;
      client.redrawChat = true;
      return true;
    },
    continueDialog() {
      // Prefer modalMessage (smelt "retrieve a bar", level-up style stickies)
      if (actions.dismissModalMessage()) return true;
      const comId = reader.chatContinueComId();
      if (comId === -1) return false;
      return actions.menuAction(PAUSE_BUTTON, 0, 0, comId);
    },
    /**
     * Chat multi (multi2/3/4/5 via p_choice / if_setresumebuttons): BUTTON_OK → IF_BUTTON.
     * Must set lastCom via IF_BUTTON so p_pausebutton resumes with switch_component.
     * Never default to last option (usually decline).
     */
    chooseOption(preferIncludes = []) {
      const opts = reader.chatOptions();
      if (!opts.length) return false;
      const lowered = opts.map(o => String(o.text ?? '').toLowerCase());
      let pick = -1;
      for (const p of preferIncludes) {
        const want = String(p).toLowerCase().trim();
        if (!want) continue;
        pick = lowered.findIndex(t => t.includes(want) || want.includes(t));
        if (pick !== -1) break;
      }
      // Progress defaults — not decline
      if (pick === -1) {
        for (const m of [
          'with what',
          "i'll help",
          'yes',
          'ok',
          'ready to move on',
          "i'm ready",
          'i am ready',
          'tell me',
          'how can i'
        ]) {
          pick = lowered.findIndex(t => t.includes(m) && !/sorry|passing|no thank|nothing, thanks/i.test(t));
          if (pick !== -1) break;
        }
      }
      // First non-decline
      if (pick === -1) {
        pick = lowered.findIndex(t => !/sorry|passing through|no thank|not interested/i.test(t));
      }
      if (pick === -1) pick = 0;
      const comId = opts[pick].comId | 0;
      if (!comId) return false;
      // IF_BUTTON (MiniMenu 231) → ClientProt.IF_BUTTON + lastCom for resumeButtons
      return actions.ifButton(comId);
    },
    /** Advance chat: modalMessage, then Continue, then options. */
    advanceDialog() {
      if (actions.continueDialog()) return true;
      if (reader.chatOptions().length) return actions.chooseOption();
      return false;
    },
    designAccept() {
      if ((client.mainModalId | 0) !== DESIGN_MODAL) return false;
      return actions.ifButton(DESIGN_ACCEPT);
    },
    /**
     * Open a side tab. Mirrors Client.iconLoop + draw path for tutorial:
     * when the flashing tut tab is selected, send TUT_CLICKSIDE so engine
     * runs [tutorial,_] (music tab / controls tab progress, etc.).
     */
    setSideTab(tab) {
      const t = tab | 0;
      if ((client.sideIcon?.[t] ?? -1) === -1) return false;
      client.activeIcon = t;
      client.redrawSide = true;
      client.redrawIcons = true;
      // Same condition as Client drawIcons: only when flash matches
      if ((client.tutFlashIcon | 0) === t && t !== -1) {
        client.tutFlashIcon = -1;
        if (client.ingame && client.out) {
          try {
            client.out.p1Enc(TUT_CLICKSIDE);
            client.out.p1(t);
          } catch (e) {
            console.warn('[harness] TUT_CLICKSIDE failed', e);
          }
        }
      }
      return true;
    },
    /**
     * Toggle run via controls interface (if_button controls:com_5 = on).
     * Required for tutorial quest-guide door (%tutorial has_toggled_on_run).
     */
    setRun(on) {
      client._harnessRunOn = !!on;
      const rootId = client.sideIcon?.[12] ?? -1;
      if (rootId === -1) {
        // Not on controls tab / not unlocked
        return false;
      }
      // Prefer side tab 12 active so interface is live
      if ((client.activeIcon | 0) !== 12) {
        actions.setSideTab(12);
      }
      const controls = findRunControls(rootId);
      if (!controls) return false;
      const comId = on ? controls.onComId : controls.offComId;
      return actions.ifButton(comId);
    },
    /**
     * Set orbit camera yaw (0–2047). Client-side only — flags periodic camera
     * report when sendCamera exists. Does not touch engine code.
     */
    setCameraYaw(yaw) {
      if (!client.ingame) return false;
      if (typeof client.orbitCameraYaw !== 'number') return false;
      client.orbitCameraYaw = yaw & 0x7ff;
      // Kill residual keycam velocity so we don't fight the player's last key hold
      if (typeof client.orbitCameraYawVelocity === 'number') {
        client.orbitCameraYawVelocity = 0;
      }
      if ('sendCamera' in client) {
        client.sendCamera = true;
      }
      return true;
    },
    /** Smooth step orbit yaw toward target (maxStep units). Returns yaw or -1. */
    stepCameraYaw(target, maxStep = 32) {
      if (!client.ingame || typeof client.orbitCameraYaw !== 'number') return -1;
      let d = ((target & 0x7ff) - (client.orbitCameraYaw & 0x7ff)) & 0x7ff;
      if (d > 1024) d -= 2048;
      const step = maxStep | 0;
      if (d > step) d = step;
      else if (d < -step) d = -step;
      client.orbitCameraYaw = (client.orbitCameraYaw + d) & 0x7ff;
      if (typeof client.orbitCameraYawVelocity === 'number') {
        client.orbitCameraYawVelocity = 0;
      }
      if ('sendCamera' in client) {
        client.sendCamera = true;
      }
      return client.orbitCameraYaw;
    },
    /** Use first inv item whose name includes substr (OP_HELD1). */
    useHeld(nameSubstr) {
      const item = reader.invHas(nameSubstr);
      if (!item) return false;
      return actions.menuAction(OP_HELD[0], item.id, item.slot, item.comId);
    },
    /** Held op 1-based (1=first iop, …). */
    heldOp(nameSubstr, op1based = 1) {
      const item = reader.invHas(nameSubstr);
      if (!item) return false;
      const code = OP_HELD[(op1based | 0) - 1];
      if (code == null) return false;
      return actions.menuAction(code, item.id, item.slot, item.comId);
    },
    /** Wield/Wear by name (finds matching iop). */
    equip(nameSubstr) {
      const item = reader.invHas(nameSubstr);
      if (!item) return false;
      const ops = item.ops || [];
      let idx = ops.findIndex(o => o && /wield|wear|equip/i.test(o));
      if (idx < 0) idx = 0; // often first held op is Wear
      const code = OP_HELD[idx] ?? OP_HELD[0];
      return actions.menuAction(code, item.id, item.slot, item.comId);
    },
    /**
     * Remove one worn item (equipment side tab).
     * Content: [inv_button1,wornitems:worn] → ~unequip — wire is **INV_BUTTON1**, not OP_HELD.
     * (mid36 FAIL used OP_HELD / obj Wear iop — no server unequip.)
     * menuAction(INV_BUTTON1, objId, slot, comId) ≡ Client INV_BUTTON packing.
     */
    unequip(nameSubstr) {
      actions.setSideTab(4);
      const want = String(nameSubstr).toLowerCase();
      const list = reader.equipment() ?? [];
      const item =
        list.find(i => i?.name && String(i.name).toLowerCase() === want) ??
        list.find(i => i?.name && String(i.name).toLowerCase().includes(want));
      if (!item || item.id == null || item.slot == null || item.comId == null) return false;
      // option1=Remove on wornitems inv → INV_BUTTON1
      return actions.invButton(item.id | 0, item.slot | 0, item.comId | 0, 1);
    },
    /** Unequip every worn slot (up to passes). Returns names still worn. */
    unequipAll(passes = 8) {
      for (let p = 0; p < (passes | 0); p++) {
        actions.setSideTab(4);
        const list = reader.equipment() ?? [];
        if (!list.length) return [];
        for (const it of list) {
          if (!it?.name) continue;
          // INV_BUTTON Remove; one tick between so engine processes
          actions.unequip(it.name);
        }
      }
      actions.setSideTab(4);
      const left = [];
      for (const it of reader.equipment() ?? []) {
        if (it?.name) left.push(it.name);
      }
      return left;
    },
    /**
     * Eat food only when it mostly pays off (missing HP ≥ heal), or emergency low HP.
     * Content: lobster `stat_heal,hitpoints,12,0` (consume_normal.dbrow).
     * Avoids fight thrash that spams Eat every N ticks and dumps a full stack at ~full HP.
     *
     * @param {string} [nameSubstr='Lobster']
     * @param {number} [heal=12] absolute heal amount for this food
     * @param {{ minMissing?: number, floor?: number, op1based?: number }} [opts]
     * @returns {{ ate: boolean, missing: number, effective: number, base: number, reason: string }}
     */
    eatIfNeeded(nameSubstr = 'Lobster', heal = 12, opts = {}) {
      const h = Math.max(1, heal | 0);
      const minMissing = opts.minMissing != null ? opts.minMissing | 0 : h;
      const hp = reader.hitpoints?.() ?? { effective: 1, base: 1 };
      const effective = (hp.effective | 0) || 0;
      const base = (hp.base | 0) || 1;
      const missing = Math.max(0, base - effective);
      const floor =
        opts.floor != null ? opts.floor | 0 : Math.max(8, Math.floor(base * 0.2));
      let reason = 'full';
      if (missing >= minMissing) reason = 'deficit';
      else if (effective <= floor) reason = 'floor';
      else {
        return { ate: false, missing, effective, base, reason: 'skip' };
      }
      actions.setSideTab(3);
      const op = opts.op1based != null ? opts.op1based | 0 : 1; // Eat = iop1 for lobster
      const ate = !!actions.heldOp(nameSubstr, op);
      return { ate, missing, effective, base, reason: ate ? reason : 'no-food' };
    },
    closeModal() {
      const main = client.mainModalId | 0;
      if (main === -1) return false;
      const comId = reader.closeButtonComId(main);
      if (comId !== -1) {
        return actions.menuAction(CLOSE_BUTTON, 0, 0, comId);
      }
      // last resort: clear client modal (local only; may re-open from server)
      client.mainModalId = -1;
      client.redrawSide = true;
      return true;
    },
    /** Cast spell (targetBase e.g. Wind Strike) on npc index. */
    castOnNpc(spellBase, npcIndex) {
      const magicTab = client.sideIcon?.[6] ?? -1;
      if (magicTab === -1) return false;
      const comId = reader.targetButtonByBase(magicTab, spellBase);
      if (comId === -1) {
        // try by text
        const byText = reader.buttonByText(magicTab, spellBase);
        if (byText === -1) return false;
        if (!actions.menuAction(TGT_BUTTON, 0, 0, byText)) return false;
      } else if (!actions.menuAction(TGT_BUTTON, 0, 0, comId)) {
        return false;
      }
      return actions.menuAction(TGT_NPC, npcIndex | 0, 0, 0);
    },
    /**
     * Inv-button on a skill make panel product (smithing dagger, etc.).
     * op 1-based → INV_BUTTON1..5 (Make / Make 5 / Make 10).
     */
    invButton(objId, slot, comId, op1based = 1) {
      const code = INV_BUTTON[(op1based | 0) - 1];
      if (code == null) return false;
      return actions.menuAction(code, objId | 0, slot | 0, comId | 0);
    },
    /**
     * Smith / multi-skill make panel: find product by name substr, fire INV_BUTTON
     * (rs2b0t ChatDialog.makeFromPanel → driver.invButton).
     * Optional op: exact option label (e.g. "Make", "Make 5"); default first non-null iop.
     * Does **not** use IF_BUTTON / buttonByText — columns are TYPE_INV.
     */
    makeFromPanel(label, op) {
      const items = reader.mainSkillMultiItems();
      const wanted = String(label ?? '').toLowerCase();
      const item = items.find(i => i.name && i.name.toLowerCase().includes(wanted));
      if (!item) return false;
      const ops = item.ops || [];
      const opWanted = op != null && op !== '' ? String(op).toLowerCase() : null;
      let opIndex = opWanted
        ? ops.findIndex(o => o && o.toLowerCase() === opWanted)
        : ops.findIndex(o => o != null);
      if (opIndex === -1) {
        // Prefer "Make" (qty 1) when no exact match requested
        opIndex = ops.findIndex(o => o && /^make$/i.test(String(o).trim()));
      }
      if (opIndex === -1) return false;
      // INV_BUTTON for interface inv ops; OP_HELD is not used for smith columns
      // (content: inv_button1/2/3,smithing:columnN). Keep OP_HELD as last-resort code path.
      const code = INV_BUTTON[opIndex] ?? OP_HELD[opIndex];
      if (code == null) return false;
      return actions.menuAction(code, item.id | 0, item.slot | 0, item.comId | 0);
    },
    cheat(command) {
      if (!client.ingame || !client.out) return false;
      const body = String(command).startsWith('::') ? String(command).slice(2) : String(command);
      client.out.p1Enc(CLIENT_CHEAT);
      client.out.p1(body.length + 1);
      client.out.pjstr(body);
      return true;
    },
    /**
     * Injected title login (rs2b0t tools/lib/harness.ts).
     * Sets loginUser/loginPass and calls Client.login — no canvas typing.
     * @returns {boolean} true if the call was dispatched (not that login succeeded)
     */
    login(user, pass = 'test', reconnect = false) {
      const u = String(user ?? '').slice(0, 12);
      const p = String(pass ?? 'test').slice(0, 20);
      if (!u) return false;
      try {
        client.loginUser = u;
        client.loginPass = p;
        // fire-and-forget Promise (same as rs2b0t void c.login(...))
        void client.login(u, p, !!reconnect);
        return true;
      } catch (e) {
        console.warn('[harness] login inject failed', e);
        return false;
      }
    },
    /**
     * Soft-drop the game stream **without** Client.logout teardown.
     * Keeps prepareGame chrome, player arrays, scene graph — the shape tryReconnect
     * expects before opcode-18 resume (reply 15).
     * @returns {boolean}
     */
    softDropStream() {
      try {
        if (client.stream && typeof client.stream.close === 'function') {
          client.stream.close();
        }
        client.stream = null;
        client.ingame = false;
        // leave loginUser/loginPass, areaChat, players, world — reconnect seed
        if (typeof client.loginRetryCount === 'number') client.loginRetryCount = 0;
        // Kill title / last track — reconnect (reply 15) does not re-run mapzone music.
        actions.clearMidiState('softDrop');
        return true;
      } catch (e) {
        console.warn('[harness] softDropStream failed', e);
        return false;
      }
    },
    /**
     * Stop MIDI (MidiFacade/Spessa) + clear Client midi bookkeeping so the next
     * MIDI_SONG from the server is not blocked by nextMidiSong === songId (title scape_main).
     */
    clearMidiState(reason = '') {
      try {
        stopMidi(false);
      } catch {
        /* backend may not be ready */
      }
      try {
        client.midiSong = -1;
        client.nextMidiSong = -1;
        client.nextMusicDelay = 0;
        client.midiFading = true;
      } catch {
        /* private dig failed */
      }
      if (reason) console.info('[harness] clearMidiState', reason);
      return true;
    },
    /**
     * Mid-session-shaped reconnect login (opcode 18). Call after softDropStream
     * (or while already post-prepareGame). World may reply 15 and swap onto a ghost.
     * @returns {boolean} dispatched
     */
    reconnectLogin(user, pass = 'test') {
      return actions.login(user, pass, true);
    },
    /**
     * Logout for mainlandAccount relog (harness / future bot test tools).
     * Prefer IF_BUTTON on `logout:try_logout` (com 2458) → server p_logout (clean session).
     * Socket-drop `client.logout()` alone is dirty: engine holds the player → long relog.
     * Keep this in attach only — do not move into pure Client-TS.
     */
    logout() {
      try {
        // Clean path first (same id as rs2b0t tools/lib/harness LOGOUT_BUTTON)
        if (actions.ifButton(2458)) return true;
        if (typeof client.logout === 'function') {
          void client.logout();
          return true;
        }
      } catch (e) {
        console.warn('[harness] logout failed', e);
      }
      return false;
    }
  };

  function findInvCom(rootId) {
    const stack = [rootId];
    const seen = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const com = ifGet(id);
      if (!com) continue;
      if (com.type === TYPE_INV && com.linkObjType) {
        if (com.id == null) com.id = id;
        return com;
      }
      if (com.children) for (const c of com.children) stack.push(c);
    }
    return null;
  }

  /**
   * rs2b0t-style: controls root has "Auto retaliate"; run off/on are children[4]/[5]
   * (controls:com_4 / com_5). Fallback: button text walk/run.
   */
  function findRunControls(rootId) {
    const root = ifGet(rootId);
    if (!root) return null;

    const visit = id => {
      const com = ifGet(id);
      if (!com) return null;
      const text = `${com.text ?? ''} ${com.buttonText ?? ''}`.toLowerCase();
      if (text.includes('auto retaliate') && com.children && com.children.length > 5) {
        return {
          offComId: com.children[4],
          onComId: com.children[5]
        };
      }
      if (com.children) {
        for (const c of com.children) {
          const hit = visit(c);
          if (hit) return hit;
        }
      }
      return null;
    };

    let found = visit(rootId);
    if (found) return found;

    // Fallback: text search under root for Run
    const onComId = reader.buttonByText(rootId, 'run');
    const offComId = reader.buttonByText(rootId, 'walk');
    if (onComId !== -1 && offComId !== -1) {
      return { onComId, offComId };
    }
    // Last resort: rs2b0t absolute children of root
    if (root.children && root.children.length > 5) {
      return { offComId: root.children[4], onComId: root.children[5] };
    }
    return null;
  }

  const abi = {
    ok: true,
    client,
    reader,
    actions,
    /** Harness-only outpost collision join — see collisionPatches.ts */
    applyOutpostCollisionLivePatch: () => applyOutpostCollisionLivePatch(client),
    // flat aliases for older smokes
    loopCycle: () => reader.loopCycle(),
    ingame: () => reader.ingame(),
    sceneState: () => reader.sceneState(),
    sceneDiag: () => reader.sceneDiag?.() ?? { sceneState: reader.sceneState() },
    loginMes: () => reader.loginMes(),
    loginscreen: () => reader.loginscreen(),
    varp: id => reader.varp(id),
    worldTile: () => reader.worldTile(),
    walkTo: (lx, lz) => actions.walkTo(lx, lz),
    walkRel: (dx, dz) => actions.walkRel(dx, dz),
    cheat: cmd => actions.cheat(cmd),
    menuAction: (a, b, c, d) => actions.menuAction(a, b, c, d),
    snapshot: () => reader.snapshot(),
    /** Dense thrash telemetry (one JSON line host-side). */
    thrashSnap: opts => reader.thrashSnap?.(opts) ?? reader.snapshot(),
    /** Injected login — prefer this over title clicks (rs2b0t). */
    login: (u, p, reconnect) => actions.login(u, p, reconnect),
    /** Soft logout for account-prep relog. */
    logout: () => actions.logout(),
    /** Drop stream only — keep game structure for reconnect (harness toy). */
    softDropStream: () => actions.softDropStream(),
    /** Opcode-18 login after softDrop / mid-session seed. */
    reconnectLogin: (u, p) => actions.reconnectLogin(u, p),
    /** Stop title/scape_main and clear midiSong bookkeeping. */
    clearMidiState: reason => actions.clearMidiState(reason)
  };

  globalThis.__lc377 = abi;
  console.info('[harness] adapter attached { reader, actions } (hooks pattern; not a client fork)');
  return abi;
}
