export const JS5_HELLO_P1 = 15;
export const JS5_REV = 410;
export const JS5_REPLY_CONTINUE = 0; // measured: nonzero takes js5connect* path
export const JS5_REPLY_OUTOFDATE = 6; // measured: js5connect_outofdate

export type Js5HelloResult = { kind: 'ok' } | { kind: 'outofdate' } | { kind: 'bad-shape' };

export function parseJs5Hello(data: Uint8Array): Js5HelloResult {
    if (data.length !== 5) {
        return { kind: 'bad-shape' };
    }
    if (data[0] !== JS5_HELLO_P1) {
        return { kind: 'bad-shape' };
    }
    const rev = (data[1] << 24) | (data[2] << 16) | (data[3] << 8) | data[4];
    // p4 is signed-capable; 410 fits in 31 bits. >>> 0 if you prefer uint32.
    if (rev >>> 0 !== JS5_REV) {
        return { kind: 'outofdate' };
    }
    return { kind: 'ok' };
}

export function replyByte(result: Js5HelloResult): number | null {
    if (result.kind === 'ok') {
        return JS5_REPLY_CONTINUE;
    }
    if (result.kind === 'outofdate') {
        return JS5_REPLY_OUTOFDATE;
    }
    return null; // bad-shape: close, no named status
}
