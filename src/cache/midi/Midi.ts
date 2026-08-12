import fs from 'fs';
import path from 'path';

import OnDemand from '#/engine/OnDemand.js';
import Environment from '#/util/Environment.js';
import { printWarning } from '#/util/Logger.js';

type MidiTempoEvent = {
    tick: number;
    tempo: number;
    order: number;
};

// todo: move reads to Packet (need ig4 and gMidiVarLen)
function readU16BE(data: Uint8Array, offset: number): number {
    return (data[offset] << 8) | data[offset + 1];
}

function readU32BE(data: Uint8Array, offset: number): number {
    return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function readU32LE(data: Uint8Array, offset: number): number {
    return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

function readChunkId(data: Uint8Array, offset: number): string {
    return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
}

function readVarLen(data: Uint8Array, offset: number, limit: number): { value: number; offset: number } | null {
    let value = 0;
    for (let i = 0; i < 4; i++) {
        if (offset >= limit) {
            return null;
        }

        const byte = data[offset++];
        value = (value << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) {
            return { value, offset };
        }
    }

    return null;
}

function parseMidiLength(src: Uint8Array): number | null {
    const data = unwrapRiffMidi(src);
    if (!data) {
        return null;
    }

    if (data.length < 14) {
        return null;
    }

    let offset = 0;
    if (readChunkId(data, offset) !== 'MThd') {
        return null;
    }

    const headerLength = readU32BE(data, offset + 4);
    offset += 8;
    if (headerLength < 6 || offset + headerLength > data.length) {
        return null;
    }

    const format = readU16BE(data, offset);
    const trackCount = readU16BE(data, offset + 2);
    const division = readU16BE(data, offset + 4);
    offset += headerLength;

    if (format > 2 || trackCount <= 0) {
        return null;
    }

    let maxTick = 0;
    const tempos: MidiTempoEvent[] = [];
    let tempoOrder = 0;

    for (let track = 0; track < trackCount; track++) {
        if (offset + 8 > data.length) {
            return null;
        }

        if (readChunkId(data, offset) !== 'MTrk') {
            return null;
        }

        const trackLength = readU32BE(data, offset + 4);
        offset += 8;
        const trackEnd = offset + trackLength;
        if (trackEnd > data.length) {
            return null;
        }

        let tick = 0;
        let runningStatus = 0;

        while (offset < trackEnd) {
            const delta = readVarLen(data, offset, trackEnd);
            if (!delta) {
                return null;
            }

            tick += delta.value;
            offset = delta.offset;

            if (offset >= trackEnd) {
                break;
            }

            let status = data[offset];
            if (status < 0x80) {
                if (runningStatus === 0) {
                    return null;
                }

                status = runningStatus;
            } else {
                offset++;
                if (status < 0xf0) {
                    runningStatus = status;
                }
            }

            if (status === 0xff) {
                if (offset >= trackEnd) {
                    return null;
                }

                const metaType = data[offset++];
                const lengthInfo = readVarLen(data, offset, trackEnd);
                if (!lengthInfo) {
                    return null;
                }

                const metaLength = lengthInfo.value;
                offset = lengthInfo.offset;

                if (offset + metaLength > trackEnd) {
                    return null;
                }

                if (metaType === 0x51 && metaLength === 3) {
                    const tempo = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
                    tempos.push({ tick, tempo, order: tempoOrder++ });
                }

                offset += metaLength;

                if (metaType === 0x2f) {
                    offset = trackEnd;
                    break;
                }
            } else if (status === 0xf0 || status === 0xf7) {
                const lengthInfo = readVarLen(data, offset, trackEnd);
                if (!lengthInfo) {
                    return null;
                }

                const sysexLength = lengthInfo.value;
                offset = lengthInfo.offset + sysexLength;
                if (offset > trackEnd) {
                    return null;
                }
            } else if (status >= 0xf0) {
                let dataBytes = 0;
                if (status === 0xf1 || status === 0xf3) {
                    dataBytes = 1;
                } else if (status === 0xf2) {
                    dataBytes = 2;
                }

                offset += dataBytes;
                if (offset > trackEnd) {
                    return null;
                }
            } else {
                const type = status & 0xf0;
                const dataBytes = type === 0xc0 || type === 0xd0 ? 1 : 2;
                offset += dataBytes;
                if (offset > trackEnd) {
                    return null;
                }
            }
        }

        if (tick > maxTick) {
            maxTick = tick;
        }
    }

    if (division & 0x8000) {
        const smpte = (division >> 8) & 0xff;
        const framesPerSecond = 0x100 - smpte;
        const ticksPerFrame = division & 0xff;
        const ticksPerSecond = framesPerSecond * ticksPerFrame;
        const ms = ticksPerSecond > 0 ? Math.round((maxTick / ticksPerSecond) * 1000) : 0;
        return ms;
    }

    const ppq = division || 1;
    tempos.sort((a, b) => a.tick - b.tick || a.order - b.order);

    let currentTempo = 500000;
    let lastTick = 0;
    let totalUs = 0;

    for (const tempo of tempos) {
        if (tempo.tick < lastTick) {
            continue;
        }

        const deltaTicks = tempo.tick - lastTick;
        totalUs += (deltaTicks * currentTempo) / ppq;
        currentTempo = tempo.tempo;
        lastTick = tempo.tick;
    }

    if (maxTick > lastTick) {
        totalUs += ((maxTick - lastTick) * currentTempo) / ppq;
    }

    const ms = Math.round(totalUs / 1000);
    return ms;
}

// "attack1.mid" has a RIFF header
function unwrapRiffMidi(data: Uint8Array): Uint8Array | null {
    if (data.length < 12) {
        return data;
    }

    if (readChunkId(data, 0) !== 'RIFF') {
        return data;
    }

    if (readChunkId(data, 8) !== 'RMID') {
        return null;
    }

    let offset = 12;
    while (offset + 8 <= data.length) {
        const id = readChunkId(data, offset);
        const size = readU32LE(data, offset + 4);
        offset += 8;

        if (offset + size > data.length) {
            return null;
        }

        if (id === 'data') {
            return data.subarray(offset, offset + size);
        }

        offset += size + (size % 2);
    }

    return null;
}

export default class Midi {
    static lengths: number[] = [];

    static load(): void {
        const count = OnDemand.cache.count(3);
        if (count) {
            this.lengths = new Array(count).fill(0);

            for (let i = 0; i < count; i++) {
                const data = OnDemand.cache.read(3, i, true);
                if (!data) {
                    printWarning(`Missing midi id=${i}`);
                    continue;
                }

                const length = parseMidiLength(data);
                if (!length) {
                    printWarning(`Failed to parse midi id=${i}`);
                    continue;
                }

                this.lengths[i] = length;
            }
            return;
        }

        // 377 isolation: main_file_cache.idx3 is often empty; onDemand still
        // serves songs, but loop needs lengths. Parse source SMFs via midi.pack.
        this.loadFromSourceTree();
    }

    private static loadFromSourceTree(): void {
        const packPath = path.join(Environment.BUILD_SRC_DIR, 'pack/midi.pack');
        if (!fs.existsSync(packPath)) {
            printWarning('No MIDI data in cache and midi.pack missing.');
            return;
        }

        const lines = fs.readFileSync(packPath, 'utf8').split(/\r?\n/);
        let maxId = -1;
        const names = new Map<number, string>();
        for (const line of lines) {
            const eq = line.indexOf('=');
            if (eq < 0) {
                continue;
            }
            const id = Number(line.slice(0, eq));
            const name = line.slice(eq + 1).trim();
            if (!Number.isFinite(id) || !name) {
                continue;
            }
            names.set(id, name);
            if (id > maxId) {
                maxId = id;
            }
        }

        this.lengths = new Array(maxId + 1).fill(0);
        const dirs = [path.join(Environment.BUILD_SRC_DIR, 'songs'), path.join(Environment.BUILD_SRC_DIR, 'jingles')];

        for (const [id, name] of names) {
            let data: Uint8Array | null = null;
            for (const dir of dirs) {
                const fp = path.join(dir, `${name}.mid`);
                if (fs.existsSync(fp)) {
                    data = fs.readFileSync(fp);
                    break;
                }
            }
            if (!data || data.length === 0) {
                continue;
            }
            const length = parseMidiLength(data);
            if (length) {
                this.lengths[id] = length;
            }
        }
    }

    static getLength(id: number): number {
        return this.lengths[id] ?? 0;
    }

    static getTickLength(id: number): number {
        return Math.ceil(this.getLength(id) / 600) + 1;
    }
}
