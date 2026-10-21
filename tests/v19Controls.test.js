'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('public/game.html', 'utf8');
const script = fs.readFileSync('public/js/game.js', 'utf8');
const skin = fs.readFileSync('public/css/v19-controls.css', 'utf8');
const countId = name => (html.match(new RegExp(`id="${name}"`, 'g')) || []).length;
for (const id of ['toggleTableChat','gamebarLeaveBtn','quickMenuPanel','menuToggleScore','menuToggleSound','menuLeaveTable','menuShowRules','rulesModal','closeRulesModal','rackStatus','leftPlayerScoreChip','rightPlayerScoreChip']) {
  assert.equal(countId(id), 1, `${id} is missing or duplicated`);
}
for (const id of ['quickChatBtn','quickMenuBtn','bottomPlayerScoreChip']) assert.equal(countId(id), 0, `${id} duplicate must be removed`);
assert.match(script, /\$\('gamebarLeaveBtn'\)\.addEventListener\('click'/);
assert.doesNotMatch(script, /\$\('gamebarLeaveBtn'\)\.addEventListener\('click',\s*leave\)/);
assert.match(script, /const rackStatus = document\.getElementById\('rackStatus'\)/);
assert.match(script, /\$\('menuToggleScore'\).*toggleScorePanel/);
assert.match(script, /\$\('menuToggleSound'\).*addEventListener/);
assert.match(script, /\$\('menuShowRules'\).*addEventListener/);
assert.match(script, /\$\('menuLeaveTable'\).*addEventListener/);
assert.match(skin, /#gameContainer #rackStatus\.rack-status/);
console.log('v19 controls: no duplicate chat/menu; score markers, opening badge, menu actions and rule dialog wired');
