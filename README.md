# Fairy Ring — Engine

**Server engine** (TypeScript) for **RuneScape revision 377** (~2 May 2006): cycle simulation, protocol, pack tools, management.

| | |
|--|--|
| **Public brand** | **Fairy Ring** (engine tree) |
| **Branch** | `rs2-r377` |
| **Upstream lineage** | [LostCityRS/Engine-TS](https://github.com/LostCityRS/Engine-TS) **`377-wip`** @ `94fcfa2d2c2fc5812e6d448a5e4a04fd73879fd3` |
| **Provenance** | [PROVENANCE.md](PROVENANCE.md) — full SHA pin + history note |
| **Companion workspace** | [Fairy Ring workspace](https://github.com/Fairy-Ring/fairy-ring-workspace) |
| **Matching content** | Content fork on branch `rs2-r377` |

## Derived from Lost City — not Lost City

This repository is a **derivation** of open **Lost City / LostCityRS Engine-TS** work. We build on that tree under its license, with our own residual bar, isolation defaults, and process.

**Derivation does not mean official.** This is **not** official Lost City / LostCityRS and is **not** endorsed by Jagex Ltd. rs2b0t/rs2b2t patterns may be used as tools; this fork is not their product layer.

Do **not** present this repo as “Lost City Engine,” “LC,” or official LostCityRS.  
See [NOTICE.md](NOTICE.md).

## AI use (explicit)

Development of this fork **uses AI tools and coding agents**. Humans own product judgment and authenticity claims. Test harness and prep cheats belong in the **workspace** (`tools/harness/`), not as purity claims in this tree.

## What this tree is

Reverse-engineered engine code designed to simulate early RS2 cycle behaviour, with data tools and a compatible network protocol. **Game data** lives in the **Content** repository (matching branch required).

Upstream organizes historical versions into branches; **rs2-r377** is this project’s 377 working branch (may diverge from Lost City `377-wip` / tips).

## Companion repos

Public under **Fairy Ring** (separate remotes):

| Repo | Role |
|------|------|
| [FR-content](https://github.com/Fairy-Ring/FR-content) | Period scripts/configs/maps |
| [FR-client-ts](https://github.com/Fairy-Ring/FR-client-ts) | Pure browser client (no harness hooks) |
| [fairy-ring-workspace](https://github.com/Fairy-Ring/fairy-ring-workspace) | Docs, residual bar, harness toys, isolation scripts |

## Getting started

> Prefer the **workspace** runbooks for the full experiment stack (ports, pack policy, isolation). Below is a bare manual layout.

### Manual setup

```sh
# same parent folder
git clone <content-fork> -b rs2-r377 content
git clone <this-engine-fork> -b rs2-r377 engine
cd engine
npm start
```

Open the management/setup UI (Lost City default often `http://localhost:8898/setup`; **rs2-r377 isolation** uses different ports — see workspace `scripts/apply-isolation-config.sh` and runbooks).

### Client

- **Client-TS** fork (this project): pure 1:1 Java 377 → TypeScript for browsers.  
- **Client-Java** (upstream Lost City): deob research client.  
- Prebuilt client assets may be present under `public/` depending on build; treat workspace harness builds as **toys** when present.

### Dependencies

- [Node.js 24+](https://nodejs.org) (align with upstream Engine-TS expectations)

> Tip: VS Code RuneScript extension (upstream marketplace): `2004scape.runescriptlanguage`

### Workflow (upstream-compatible)

| Audience | Command |
|----------|---------|
| Content developers | `npm start` — watch scripts/configs, repack |
| Engine developers | `npm run dev` — same + restart on engine changes |

### Common issues

* `'"java"' is not recognized...` — Java not installed (some pack steps may need it).  
* Class file version errors — wrong Java major; set `JAVA_PATH` in `.env` if needed.  
* Pack orphans under `BUILD_VERIFY=true` — known experiment friction; see workspace pack notes (do not treat soft skip as authenticity).


## Completeness disclaimer

We do **not** claim this tree **is** authentic, original, or complete. Work is ongoing under an accuracy bar; humans and agents make mistakes. **Good-faith contributions from all** are welcome and will not be dismissed without clear rationale (see companion workspace `CONTRIBUTING.md`).

## License

This project is licensed under the [MIT License](LICENSE) as upstream.  
Do **not** relicense Lost City–originated code as original work of this project.  
See [NOTICE.md](NOTICE.md).

## Upstream

- Engine-TS: https://github.com/LostCityRS/Engine-TS  
- Content: https://github.com/LostCityRS/Content  
- Server (simplified setup, upstream): https://github.com/LostCityRS/Server  
- Lost City forum: https://lostcity.rs/

**Never push experiment work to `LostCityRS/*` without explicit permission.**  
Push remote (operator): `private` → [Fairy-Ring/FR-engine](https://github.com/Fairy-Ring/FR-engine).
