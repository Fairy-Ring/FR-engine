import assert from 'node:assert/strict';

import FontType from '#/cache/config/FontType.js';

/** Deterministic monospaced font: every code unit advances by `advance` px. */
function makeFont(advance = 10): FontType {
    const font = Object.create(FontType.prototype) as FontType;
    font.charMask = new Array(256);
    font.charMaskWidth = new Uint8Array(256);
    font.charMaskHeight = new Uint8Array(256);
    font.charOffsetX = new Uint8Array(256);
    font.charOffsetY = new Uint8Array(256);
    font.charAdvance = new Uint8Array(256);
    font.height = 12;
    for (let i = 0; i < 256; i++) {
        font.charAdvance[i] = advance;
    }
    return font;
}

const font = makeFont(10);
const maxWidth = 120;

// Long clause before hard pipe must soft-wrap on the last in-width space, then honor the pipe.
{
    const lines = font.split('AAAAA BBBBB CCCCC|next', maxWidth);
    assert.deepEqual(lines, ['AAAAA BBBBB', 'CCCCC', 'next']);
    for (const line of lines) {
        assert.ok(font.stringWidth(line) <= maxWidth, `line too wide: ${JSON.stringify(line)} w=${font.stringWidth(line)}`);
    }
}

// Double-pipe after an overlong clause: soft-wrap first, retain blank row from ||, then tail.
{
    const lines = font.split('AAAAA BBBBB CCCCC||TAIL', maxWidth);
    assert.deepEqual(lines, ['AAAAA BBBBB', 'CCCCC', '', 'TAIL']);
    assert.equal(lines[2], '', 'blank row from || must be retained');
}

// Short explicit hard breaks unchanged when pre-pipe fits.
{
    assert.deepEqual(font.split('HI|YO', maxWidth), ['HI', 'YO']);
    assert.deepEqual(font.split('HI||YO', maxWidth), ['HI', '', 'YO']);
    assert.deepEqual(font.split('A|B|C', maxWidth), ['A', 'B', 'C']);
}

// Ordinary no-pipe wrap still breaks on spaces only.
{
    assert.deepEqual(font.split('AAAAA BBBBB CCCCC DDDDD', maxWidth), ['AAAAA BBBBB', 'CCCCC DDDDD']);
    assert.deepEqual(font.split('SHORT', maxWidth), ['SHORT']);
}

// Colour tags are width-transparent; colour carries across soft wraps and after later pipe.
{
    assert.equal(font.stringWidth('@dre@AAAAA BBBBB CCCCC'), font.stringWidth('AAAAA BBBBB CCCCC'));
    const lines = font.split('@dre@AAAAA BBBBB CCCCC|@red@X', maxWidth);
    assert.deepEqual(lines, ['@dre@AAAAA BBBBB', '@dre@CCCCC', '@dre@@red@X']);
    assert.ok(lines[0].startsWith('@dre@'));
    assert.ok(lines[1].startsWith('@dre@'), 'soft-wrap must carry colour');
}

// @str@ clears saved colour (existing strikeout path).
{
    const lines = font.split('@dre@AAAAA @str@BBBBB CCCCC|TAIL', maxWidth);
    assert.equal(lines[0], '@dre@AAAAA @str@BBBBB');
    // After @str@, no colour prefix on remainder before pipe consume.
    assert.ok(!lines[1].startsWith('@dre@'), `strikeout must clear colour carry: ${lines[1]}`);
}

// Unbreakable single word before pipe: still hard-breaks at pipe (no prior space to prefer).
{
    const lines = font.split('AAAAAAAAAAAAAAA|X', 50);
    assert.deepEqual(lines, ['AAAAAAAAAAAAAAA', 'X']);
    assert.ok(font.stringWidth(lines[0]) > 50, 'unbreakable overlong word remains a single line');
}

// Empty string special case preserved.
{
    assert.deepEqual(font.split('', maxWidth), ['']);
}

console.log('FontType.split regression ok');
