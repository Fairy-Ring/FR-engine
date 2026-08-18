import fs from 'fs';

import Packet from '#/io/Packet.js';
import RandomAccessFile from '#/util/RandomAccessFile.js';

/** JS5 disk store (410): dat2 + idx0-11 + idx255. Not 377 FileStream (dat + idx0-4). */
export default class Js5FileStore {
    readonly dir: string;
    private dat: RandomAccessFile;
    private idx: Map<number, RandomAccessFile> = new Map();

    constructor(dir: string) {
        const dat2 = `${dir}/main_file_cache.dat2`;
        const idx255 = `${dir}/main_file_cache.idx255`;
        if (!fs.existsSync(dat2) || !fs.existsSync(idx255)) {
            throw new Error(`Js5FileStore: missing dat2 or idx255 under ${dir}`);
        }

        this.dir = dir;
        this.dat = new RandomAccessFile(dat2, true);

        for (let i = 0; i <= 11; i++) {
            const p = `${dir}/main_file_cache.idx${i}`;
            if (!fs.existsSync(p)) {
                throw new Error(`Js5FileStore: missing idx${i}`);
            }
            this.idx.set(i, new RandomAccessFile(p, true));
        }
        this.idx.set(255, new RandomAccessFile(idx255, true));
    }

    count(index: number): number {
        const f = this.idx.get(index);
        if (!f) {
            return 0;
        }
        return f.length / 6;
    }

    read(index: number, file: number): Uint8Array | null {
        const idx = this.idx.get(index);
        if (!idx || file < 0 || file >= this.count(index)) {
            return null;
        }

        idx.pos = file * 6;
        const idxHeader = idx.gPacket(6);
        const size = idxHeader.g3();
        let sector = idxHeader.g3();

        if (size <= 0 || size > 2000000) {
            return null;
        }
        if (sector <= 0 || sector > this.dat.length / 520) {
            return null;
        }

        const data = new Packet(new Uint8Array(size));
        for (let part = 0; data.pos < size; part++) {
            if (sector === 0) {
                break;
            }
            this.dat.pos = sector * 520;
            let available = size - data.pos;
            if (available > 512) {
                available = 512;
            }
            const header = this.dat.gPacket(available + 8);
            const sectorFile = header.g2();
            const sectorPart = header.g2();
            const nextSector = header.g3();
            const sectorIndex = header.g1();

            // JS5 store id is the archive number (0-11) or 255. Not archive+1.
            if (file !== sectorFile || part !== sectorPart || index !== sectorIndex) {
                return null;
            }
            if (nextSector < 0 || nextSector > this.dat.length / 520) {
                return null;
            }
            data.pdata(header.data, header.pos, header.data.length);
            sector = nextSector;
        }

        return data.data;
    }

    has(index: number, file: number): boolean {
        return this.read(index, file) !== null;
    }

    close(): void {
        this.dat.close();
        for (const f of this.idx.values()) {
            f.close();
        }
    }
}
