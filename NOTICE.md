# NOTICE — rs2-r410 Engine

Attribution and provenance for this **410** listen branch of the Fairy Ring engine fork.

## Independent project, derived from Lost City

**rs2-r410 Engine** sits on the Fairy Ring **rs2-r377** line, itself a fork of
[LostCityRS/Engine-TS](https://github.com/LostCityRS/Engine-TS).

```text
LostCityRS/Engine-TS@94fcfa2d2c2fc5812e6d448a5e4a04fd73879fd3  (branch 377-wip)
```

`src/engine/World.ts` is **untouched**. `ENGINE_REVISION` default remains **377**.  
410 protocol lives in `tools/410/listen.ts` and `src/io/Js5*` / `src/io/Login410*`.

Live 377 product is branch **`rs2-r377`**. Do not treat this branch as a flipped World.

It is a **derivation** of open Lost City work under its license, with our own residual process and branding.  
**Pinned details:** [PROVENANCE.md](PROVENANCE.md).

**Not** official Lost City / LostCityRS and **not** endorsed by Jagex Ltd.

Do **not** present this repository as official Lost City Engine-TS.

## Shoulders of giants

| Source | Role |
|--------|------|
| **Lost City / LostCityRS Engine-TS** | Primary upstream derivation |
| **RuneWiki / openrs2-nonfree 410** | Compiling Java client cite (separate repo) |
| **OpenRS2 cache 1254** | Period 410 `dat2` store |
| **Period RuneScape (Jagex)** | Protocol and behaviour being simulated |
| **Contributors** | Humans who review and ship |
| **AI tools / coding agents** | Used openly — tools, not authenticity oracles |

## AI use

This fork **uses AI** in day-to-day development. Product claims require evidence (logs, SHAs, residual labels), not model assertion.

## License reminder

- Engine source under [LICENSE](LICENSE) (MIT) as upstream.  
- Do not relicense Lost City code as original Fairy Ring invention.  
- Prebuilt clients / caches are not a license grant for Jagex assets.

## Contact / adoption

Upstream adoption of patches is **welcome and not assumed**.  
Do not open PRs to `LostCityRS/*` from this experiment without coordination.
