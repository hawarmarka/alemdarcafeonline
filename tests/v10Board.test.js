'use strict';
const assert = require('node:assert/strict');
const Grid = require('../public/js/tableGrid');
assert.equal(Grid.SIDE, 13);
assert.equal(Grid.BOARDS, 2);
assert.equal(Grid.PAIR_ROWS, 2);
assert.equal(Grid.PAIR_COLUMNS, 2);
assert.equal(Grid.PAIR_SECTIONS, 3);
for (let trial = 0; trial < 40; trial++) {
    const groups = Array.from({length: 23}, (_, i) => ({owner:i%4,groupIndex:i,tiles:Array(3+(i%6)).fill(null).map((_,j)=>({id:`${i}-${j}`}))}));
    const result = Grid.layoutSeries(groups);
    assert.equal(result.overflow.length,0,`Grup taştı: deneme ${trial}`);
    assert.equal(result.placements.length,23);
    const cells = new Set();
    for (const x of result.placements) {
        assert(x.board>=0&&x.board<2);
        assert(x.row>=0&&x.row<13);
        assert(x.col>=0&&x.col+x.length<=13);
        for (let j=0;j<x.length;j++) {
            const key = `${x.board}:${x.row}:${x.col+j}`;
            assert(!cells.has(key),`Üst üste binen taş: ${key}`);
            cells.add(key);
        }
    }
}
const pairGroups = Array.from({length: 15},(_,i)=>({owner:i%4,groupIndex:i,tiles:[{id:'a'+i},{id:'b'+i}]}));
for(let page=0;page<3;page++) {
    const view = Grid.layoutPairs(pairGroups,page);
    assert.equal(view.pages,3);
    assert.equal(view.page,page);
    assert(view.visible.length<=6);
    const occupied = new Set();
    view.visible.forEach(entry=>{
        assert(entry.section>=0&&entry.section<3);
        assert(entry.row>=0&&entry.row<2);
        for(let col=0;col<2;col++) {
            const id = `${entry.section}:${entry.row}:${col}`;
            assert(!occupied.has(id));occupied.add(id);
        }
    });
}
assert.equal(Grid.layoutPairs(pairGroups,900).page,2,'Son sayfa sınırı uygulanmalı');
console.log('v10Board: 2 adet 13x13; 3 adet 2x2; 15 çifte sayfalama ve çakışmasız seri dizimi geçti');
