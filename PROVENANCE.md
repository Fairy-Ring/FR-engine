# Provenance — rs2-r410 Engine

**Derived from:** [LostCityRS/Engine-TS](https://github.com/LostCityRS/Engine-TS) via Fairy Ring **`rs2-r377`**.

```text
LostCityRS/Engine-TS@94fcfa2d2c2fc5812e6d448a5e4a04fd73879fd3
Fairy-Ring/FR-engine@bbd1e9812c92cd3b89213c77ee9088a9a847a1a1  (rs2-r377 at branch cut)
```

| Field | Value |
|-------|--------|
| Upstream org/repo | `LostCityRS/Engine-TS` |
| Upstream branch at fork | **`377-wip`** |
| **Upstream tip SHA (full)** | `94fcfa2d2c2fc5812e6d448a5e4a04fd73879fd3` |
| Fairy Ring 377 at cut | `bbd1e9812c92cd3b89213c77ee9088a9a847a1a1` (`rs2-r377`) |
| First 410 stack commit | `d27cb30e` — dat2 + idx255 census |
| Listen mid-gate HEAD | `ec96c42a` — hold archive-5 groups that T3 without a cited key |
| Local / product branch | **`rs2-r410`** (scratch was `rs2-r410-stack`; that name is not a remote) |
| Measured | 2026-08-18 |

## What landed on this branch (not World)

`src/engine/World.ts` has **zero** diff vs `rs2-r377` @ `bbd1e981`.  
`ENGINE_REVISION` default remains **377** (`.env.example`, `src/util/Environment.ts`).

410 files: `tools/410/**`, `src/io/Js5*.ts`, `src/io/Login410*.ts`.

Headed mid-gate (2026-08-18): Java OpenRS2 **32256** / FR-client-java `rs2-r410` → title + login **2** + scene 1 hang (`anInt1075==25`, Loading 47%). Loc XTEA 2/26.

## Remotes (operator)

| Remote | URL | Push |
|--------|-----|------|
| `origin` | LostCityRS/Engine-TS | **DISABLED** |
| `private` | Fairy-Ring/FR-engine | **`rs2-r410`** only for this line |

**Never** push this branch to LostCityRS. **Never** push scratch `rs2-r410-stack` as a remote name.

See [NOTICE.md](NOTICE.md).
