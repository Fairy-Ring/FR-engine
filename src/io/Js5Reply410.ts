export function encodeJs5Group410(archive: number, group: number, blob: Uint8Array): Buffer {
    const stream = Buffer.alloc(3 + blob.length);
    stream[0] = archive & 0xff;
    stream.writeUInt16BE(group & 0xffff, 1);
    Buffer.from(blob).copy(stream, 3);

    const out: Buffer[] = [];
    let off = 0;
    while (off < stream.length) {
        if (off > 0) {
            out.push(Buffer.from([0xff]));
        }
        const take = Math.min(off === 0 ? 512 : 511, stream.length - off);
        out.push(stream.subarray(off, off + take));
        off += take;
    }
    return Buffer.concat(out);
}
