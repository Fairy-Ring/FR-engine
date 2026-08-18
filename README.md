# Fairy Ring — Engine (`rs2-r410`)

**410** (~26 May 2006) JS5 / login **listen** stack. Live 377 product stays on **`rs2-r377`**.

| | |
|--|--|
| **Public brand** | **Fairy Ring** (engine tree) |
| **This branch** | `rs2-r410` |
| **Live 377 product** | [`rs2-r377`](https://github.com/Fairy-Ring/FR-engine/tree/rs2-r377) |
| **Upstream lineage** | [LostCityRS/Engine-TS](https://github.com/LostCityRS/Engine-TS) **`377-wip`** @ `94fcfa2d2c2fc5812e6d448a5e4a04fd73879fd3` |
| **Provenance** | [PROVENANCE.md](PROVENANCE.md) |
| **Companion Java client** | [FR-client-java](https://github.com/Fairy-Ring/FR-client-java) `rs2-r410` |
| **Companion workspace** | [Fairy Ring workspace](https://github.com/Fairy-Ring/fairy-ring-workspace) |

## What this branch is

A **listen stub** plus 410 IO helpers on top of the Fairy Ring 377 engine line. Headed mid-gate (2026-08-18): OpenRS2 **32256** Java client reached in-game chrome + **Loading - please wait (47%)** (`anInt1075==25`). Walkable scene **30** is blocked on missing loc XTEA (24 of 26 map keys unknown). Do **not** invent keys.

| Path | Role |
|------|------|
| `tools/410/listen.ts` | One process: JS5 hello `p1(15)+p4(410)` + login `p1(14)` / 16 / 18 + dat2 serve |
| `src/io/Js5*.ts` · `src/io/Login410*.ts` | Measured 410 bytes (hello, request, reply, prelude, RSA inner, follow-on) |
| `src/engine/World.ts` | **Untouched.** `ENGINE_REVISION` default remains **377**. |

This is **not** `ENGINE_REVISION=410` on World. `npm start` on this branch is still the 377 cycle engine.

## Derived from Lost City — not Lost City

This repository is a **derivation** of open **Lost City / LostCityRS Engine-TS** work. We build on that tree under its license, with our own residual bar, isolation defaults, and process.

**Derivation does not mean official.** This is **not** official Lost City / LostCityRS and is **not** endorsed by Jagex Ltd.

Do **not** present this repo as “Lost City Engine,” “LC,” or official LostCityRS.  
See [NOTICE.md](NOTICE.md).

## AI use (explicit)

Development of this fork **uses AI tools and coding agents**. Humans own product judgment and authenticity claims.

## Companion repos

| Repo | Role |
|------|------|
| [FR-client-java](https://github.com/Fairy-Ring/FR-client-java) | Compiling 410 Java deob (`rs2-r410`) |
| [FR-content](https://github.com/Fairy-Ring/FR-content) | Period scripts/configs/maps (`rs2-r377` live) |
| [FR-client-ts](https://github.com/Fairy-Ring/FR-client-ts) | Browser client (`rs2-r377`; no 410 TS yet) |
| [fairy-ring-workspace](https://github.com/Fairy-Ring/fairy-ring-workspace) | Docs, residual bar, harness toys |

## Listen (410 mid-gate)

Need OpenRS2 cache **1254** on disk (`main_file_cache.dat2` + `idx0`–`idx11` + `idx255`). Isolation ports: game **43596**, JS5 first-hop is the same port, management **8900**, web **82**. Do **not** bind 43595 / 81 / 8899 (live 377).

```sh
npx tsx tools/410/listen.ts 43596 /path/to/openrs2-410/disk/cache
```

Java client (Zulu 8), from [FR-client-java](https://github.com/Fairy-Ring/FR-client-java) compile output:

```sh
java -Djava.net.preferIPv4Stack=true -cp out client 3596 local wip highmem members
```

`local` + `worldid 3596` → game **43596**. Listen must bind **`0.0.0.0`**. Prefer IPv4 (`::1` will miss a 127.0.0.1-only bind).

## Completeness disclaimer

We do **not** claim this tree **is** authentic, original, or complete. The 410 listen path is a measured mid-gate, not a walkable 410 world.

## License

This project is licensed under the [MIT License](LICENSE) as upstream.  
Do **not** relicense Lost City–originated code as original work of this project.  
See [NOTICE.md](NOTICE.md).

## Upstream

- Engine-TS: https://github.com/LostCityRS/Engine-TS  
- 410 deob cite: https://github.com/RuneWiki/openrs2-nonfree/tree/410  

**Never push experiment work to `LostCityRS/*` without explicit permission.**  
Push remote (operator): `private` → [Fairy-Ring/FR-engine](https://github.com/Fairy-Ring/FR-engine) branch **`rs2-r410`**. Do not push scratch `rs2-r410-stack` as a remote name.
