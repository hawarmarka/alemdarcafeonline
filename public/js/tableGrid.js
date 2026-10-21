/* ALEMDAR 101 OKEY — deterministic, collision-free table placement.
 * Two independent 13x13 boards; three 2x2 pair sections per visible page.
 * Source is UMD so the placement rules can also be unit tested in Node.
 */
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.OkeyTableGrid = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
    'use strict';
    const SIDE = 13;
    const BOARDS = 2;
    const PAIR_COLUMNS = 2;
    const PAIR_ROWS = 2;
    const PAIR_SECTIONS = 3;
    const PAIR_PAGE_SIZE = PAIR_COLUMNS * PAIR_ROWS * PAIR_SECTIONS;

    function layoutSeries(groups) {
        const occupancy = Array.from({length: BOARDS}, () => Array.from({length: SIDE}, () => Array(SIDE).fill(false)));
        const placements = [];
        const overflow = [];
        for (let index = 0; index < groups.length; index++) {
            const group = groups[index];
            const length = group.tiles.length;
            if (length < 3 || length > SIDE) { overflow.push(group); continue; }
            const preferred = index % BOARDS;
            let selected = null;
            // First-fit in the least advanced row; balance sections to avoid piling on left.
            for (let row = 0; row < SIDE && !selected; row++) {
                for (const board of [preferred, 1 - preferred]) {
                    for (let col = 0; col <= SIDE - length; col++) {
                        if (col > 0 && occupancy[board][row][col - 1]) continue; // space between groups
                        if (col + length < SIDE && occupancy[board][row][col + length]) continue;
                        if (occupancy[board][row].slice(col, col + length).some(Boolean)) continue;
                        selected = {board, row, col, length, group};
                        break;
                    }
                    if (selected) break;
                }
            }
            if (!selected) { overflow.push(group); continue; }
            for (let col = selected.col; col < selected.col + length; col++) occupancy[selected.board][selected.row][col] = true;
            placements.push(selected);
        }
        return {placements, overflow, occupancy};
    }

    // 101 Okey Plus dizilimi: her grup kendi satırında, açılış sırasıyla (önce sol pano, sonra sağ).
    // Seri sayı hizasına konur (3-4-5 → 3. sütundan başlar); per sayısının hizasına yakın durur.
    // slotMap aynı elde grupların yerini sabit tutar: anahtar "sahip:grup" → satır numarası.
    function layoutByNumber(groups, slotMap, okey) {
        const placements = [], overflow = [];
        const isWild = t => okey && !t.isFakeJoker && t.color === okey.color && t.number === okey.number;
        const num = t => t.isFakeJoker && okey ? okey.number : t.number;
        for (const group of groups) {
            const key = group.owner + ':' + group.groupIndex;
            if (!slotMap.has(key)) slotMap.set(key, slotMap.size);
            const slot = slotMap.get(key), length = group.tiles.length;
            if (slot >= SIDE * BOARDS || length < 1 || length > SIDE) { overflow.push(group); continue; }
            const fixed = group.tiles.map((t, p) => ({ t, p })).filter(x => !isWild(x.t));
            const sameNumber = fixed.length && fixed.every(x => num(x.t) === num(fixed[0].t));
            let col;
            if (sameNumber && length <= 4) col = Math.min(num(fixed[0].t) - 1, SIDE - length);
            else col = fixed.length ? num(fixed[0].t) - fixed[0].p - 1 : 0;
            col = Math.max(0, Math.min(SIDE - length, col));
            placements.push({ board: Math.floor(slot / SIDE), row: slot % SIDE, col, length, group });
        }
        return { placements, overflow };
    }

    function layoutPairs(groups, page = 0) {
        const safePage = Math.max(0, Math.floor(Number(page) || 0));
        const pairs = [];
        for (const group of groups) {
            if (group.tiles?.length !== 2) continue;
            pairs.push(group);
        }
        // Two tile cells per pair. 2x2 sections therefore fit exactly two pairs.
        const pages = Math.max(1, Math.ceil(pairs.length / 6));
        const actualPage = Math.min(pages - 1, safePage);
        const visible = pairs.slice(actualPage * 6, actualPage * 6 + 6).map((group, index) => ({
            group,
            section: Math.floor(index / 2),
            row: index % 2,
            col: 0
        }));
        return {pages, page: actualPage, visible, total: pairs.length, capacityTiles: PAIR_PAGE_SIZE};
    }
    return {SIDE, BOARDS, PAIR_COLUMNS, PAIR_ROWS, PAIR_SECTIONS, layoutSeries, layoutByNumber, layoutPairs};
});
