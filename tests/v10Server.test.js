'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n=0;
  constructor(io) {this.id='v10s'+(++FakeSocket.n);this.io=io;this.handlers={};this.out=[];this.rooms=new Set();this.data={};io.sockets.sockets.set(this.id,this);io.connect(this);}
  on(event,fn){this.handlers[event]=fn;}
  emit(event,data){this.out.push({event,data});}
  join(room){this.rooms.add(room);}
  leave(room){this.rooms.delete(room);}
  receive(event,data){assert(this.handlers[event],`Handler yok: ${event}`);return this.handlers[event](data);}
  last(event){return this.out.filter(x=>x.event===event).at(-1)?.data;}
}
class FakeIO {
  constructor(){fakeIO=this;this.sockets={sockets:new Map()};}
  on(event,callback){if(event==='connection')this.connect=callback;}
  to(room){return {emit:(event,data)=>{for(const s of this.sockets.sockets.values())if(s.rooms.has(room)||s.id===room)s.emit(event,data);}};}
}
function express(){return {disable(){},use(){},get(){},post(){},set(){}};}
express.json=()=>()=>{};express.static=()=>()=>{};
Module._load=function(request,parent,isMain){
  if(request==='express')return express;
  if(request==='socket.io')return {Server:FakeIO};
  if(request==='http')return {createServer:()=>({listen(){}})};
  return nativeLoad.apply(this,arguments);
};
const {rooms,_testing}=require('../server/index');Module._load=nativeLoad;
const first = new FakeSocket(fakeIO);
first.receive('joinGame',{mode:'create',autoBots:true,playerName:'human',token:'a'.repeat(48),roundLimit:2});
const room=rooms.get(first.last('joinedGame').code);
assert(room.botFillTimer);
const filling=room.botFillTimer, fillCallback=filling._onTimeout;clearTimeout(filling);fillCallback();
assert.equal(room.players.length,4);
assert.equal(room.players.filter(p=>p.isBot).length,3);
assert.equal(room.started,true);
assert.equal(room.turnDurationMs,45000);
assert.equal(room.turnTimer._idleTimeout,45000);
const initialIndex=room.game.currentPlayer;
if(room.players[initialIndex].isBot){
  assert(room.botTurnTimer);
  const scheduled=room.botTurnTimer, botCallback=scheduled._onTimeout;clearTimeout(scheduled);botCallback();
  assert.notEqual(room.game.currentPlayer,initialIndex,'Bot oynamalı ve sırayı geçirmeli');
}
// Act as the current player to test 45 seconds -> automatic draw/discard.
const seat=room.game.currentPlayer;
const before=room.game.discardPiles[seat].length;
const deadline=room.turnDeadline;
const alarm=room.turnTimer, alarmCallback=alarm._onTimeout;clearTimeout(alarm);alarmCallback();
assert(room.turnDeadline>0);
assert.equal(room.game.discardPiles[seat].length,before+1);
assert.equal(room.game.currentPlayer,(seat+1)%4);
// Opening grants one bonus minute only in the opening turn.
room.game.currentPlayer=0;room.game.hasDrawn=true;
_testing.beginTurn(room);
const pre=room.turnTimer._idleTimeout;
_testing.extendTurnAfterOpening(room,0);
assert.equal(pre,45000);
assert(_testing.turnMsFor(room)===105000);
assert(room.turnTimer._idleTimeout>=104500);
const duration=room.turnTimer._idleTimeout;
_testing.extendTurnAfterOpening(room,0);
assert.equal(room.turnTimer._idleTimeout,duration,'Süre aynı sırada iki kere uzamamalı');
_testing.beginTurn(room);assert.equal(room.turnTimer._idleTimeout,45000);
// Leaving a started game replaces the player with bot without canceling.
// (Masada başka bir gerçek oyuncu var; son gerçek oyuncu ayrılırsa yalnız bot kalan masa kapanır, bkz. v35Persistence.)
room.players[1].isBot = false; room.players[1].socketId = 'baska-oyuncu';
first.receive('leaveGame');
assert.equal(room.players.length,4);
assert.equal(room.players[0].isBot,true);
assert.equal(room.players[0].name,'human','Skor tablosu kimliği korunmalı');
assert.equal(room.started,true);
assert(first.last('leftGame')===undefined || first.last('leftGame')===null || typeof first.last('leftGame')==='object');
// Round ends, a disconnected seat must not block the mandatory 5-second transition.
room.players[1].isBot = false;
room.players[1].socketId = null;
const completed = room.completedRounds;
_testing.finishRound(room, null, {type:'exhausted'});
assert.equal(room.started,false);
assert.equal(room.nextRoundTimer._idleTimeout,5000);
const nextRoundTimeout = room.nextRoundTimer, nextRoundCallback = nextRoundTimeout._onTimeout;
clearTimeout(nextRoundTimeout);nextRoundCallback();
assert.equal(room.completedRounds,completed+1);
assert.equal(room.roundId,2);
assert.equal(room.started,true);
assert.equal(room.players[1].isBot,true,'Ayrılmış oyuncu yerine botla el devam etmeli');
_testing.stopTurn(room);
console.log('v10Server: bot doldurma, bot turu, 45sn otomatik taş, 60sn tek seferlik ek süre, ayrılan yerine bot geçti');
