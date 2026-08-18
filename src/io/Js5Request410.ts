export type Js5Request410Result = { kind: 'ok'; p1: 0 | 1; id: number; archive: number; group: number } | { kind: 'bad-shape' };

export function parseJs5Request410(data: Uint8Array): Js5Request410Result {
    if (data.length !== 4) {
        return { kind: 'bad-shape' };
    }
    const p1 = data[0];
    if (p1 !== 0 && p1 !== 1) {
        return { kind: 'bad-shape' };
    }
    const id = ((data[1] << 16) | (data[2] << 8) | data[3]) >>> 0;
    return {
        kind: 'ok',
        p1,
        id,
        archive: (id >>> 16) & 0xff,
        group: id & 0xffff
    };
}
