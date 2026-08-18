export const LOGIN_REV = 410;
export const LOGIN_OUTER_FRESH = 16; // literal only
export const LOGIN_OUTER_RECONNECT = 18; // literal only
export const LOGIN_TRAILER = 53; // 4 + 1 + 12*4
export const LOGIN_REPLY_OUTOFDATE = 6; // 377 World already uses this; do not rename
export const LOGIN_REPLY_CONTINUE = 0;

export type Login410PreludeResult = { kind: 'ok'; rev: number; flag: number } | { kind: 'outofdate'; rev: number } | { kind: 'bad-shape' };

export function parseLogin410Prelude(opcode: number, framed: Uint8Array): Login410PreludeResult {
    if (opcode !== LOGIN_OUTER_FRESH && opcode !== LOGIN_OUTER_RECONNECT) {
        return { kind: 'bad-shape' };
    }
    if (framed.length < 1) {
        return { kind: 'bad-shape' };
    }
    const n = framed[0];
    if (n < LOGIN_TRAILER || framed.length < 1 + n) {
        return { kind: 'bad-shape' };
    }
    const payload = framed.subarray(1, 1 + n);
    const rev = ((payload[0] << 24) | (payload[1] << 16) | (payload[2] << 8) | payload[3]) >>> 0;
    if (rev !== LOGIN_REV) {
        return { kind: 'outofdate', rev };
    }
    return { kind: 'ok', rev, flag: payload[4] };
}
