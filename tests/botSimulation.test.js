'use strict';
// Dört botla çok sayıda el oynatır: taş kaybı/çoğalması, kilitlenme ve geçersiz masa grubu olmamalı.
const assert = require('node:assert/strict');
const Module = require('node:module');
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n=0;
  constructor(io){this.id='sim'+(++FakeSocket.n);this.handlers={};this.out=[];this.rooms=new Set();this.data={};io.sockets.sockets.set(this.id,this);io.connect(this);}
  on(e,fn){this.handlers[e]=fn;} emit(e,d){this.out.push({event:e,data:d});}
  join(r){this.rooms.add(r);} leave(r){this.rooms.delete(r);}
  receive(e,d){return this.handlers[e](d);}
  last(e){return this.out.filter(x=>x.event===e).at(-1)?.data;}
}
class FakeIO {
  constructor(){fakeIO=this;this.sockets={sockets:new Map()};}
  on(e,cb){if(e==='connection')this.connect=cb;}
  to(room){return {emit:(e,d)=>{for(const s of this.sockets.sockets.values())if(s.rooms.has(room)||s.id===room)s.emit(e,d);}};}
}
function express(){return {disable(){},use(){},get(){},post(){},set(){}};}
express.json=()=>()=>{};express.static=()=>()=>{};
Module._load=function(request){
  if(request==='express')return express;
  if(request==='socket.io')return {Server:FakeIO};
  if(request==='http')return {createServer:()=>({listen(){}})};
  return nativeLoad.apply(this,arguments);
};
const Logger=require('../server/logger');for(const k of ['game','debug','info','warn','log'])Logger[k]=()=>{};
const {rooms,_testing}=require('../server/index');Module._load=nativeLoad;

function fire(room,key){const t=room[key];if(!t)return false;const cb=t._onTimeout;clearTimeout(t);room[key]=null;cb();return true;}
function tileCount(room){
  const g=room.game;
  return g.tiles.length+1+g.playerTiles.flat().length+g.discardPiles.flat().length+
    g.playerStates.flatMap(s=>s.openedGroups).flat().length;
}
let rounds=0,wins=0,okeySwaps=0;
const MATCHES=Number(process.env.SIM_MATCHES)||40;
for(let match=0;match<MATCHES;match++){
  const human=new FakeSocket(fakeIO);
  human.receive('joinGame',{mode:'create',autoBots:true,playerName:'h'+match,token:'x'.repeat(30)+match,roundLimit:4});
  const room=rooms.get(human.last('joinedGame').code);
  fire(room,'botFillTimer');
  room.players[0].isBot=true;room.players[0].socketId=null; // herkes bot
  _testing.beginTurn(room);
  room.penaltyMode=true;
  let guard=0;
  while(!room.matchEnded&&guard++<4000){
    if(room.started){
      assert.equal(tileCount(room),106,'Toplam taş 106 kalmalı');
      for(const s of room.game.playerStates)for(const grp of s.openedGroups){
        if(s.openType==='pairs')assert.equal(grp.length,2);
        else assert(room.game.isValidGroup(grp),'Masadaki her grup geçerli olmalı');
      }
      const before=room.game.playerStates.flatMap(s=>s.openedGroups).flat().filter(t=>room.game.isOkey(t)).length;
      const seat=room.game.currentPlayer;
      assert(fire(room,'botTurnTimer'),'Bot sırası zamanlanmalı');
      if(room.started&&room.game.currentPlayer===seat)assert.fail('Bot sırasını geçmedi');
      const after=room.game?.playerStates.flatMap(s=>s.openedGroups).flat().filter(t=>room.game.isOkey(t)).length;
      if(after<before)okeySwaps++;
    }else{
      const done=room.completedRounds;
      if(room.lastRoundResult&&room.lastRoundResult.winner!==null)wins++;
      rounds++;
      if(!fire(room,'nextRoundTimer'))fire(room,'botFillTimer');
      if(!room.started&&!room.matchEnded)assert.fail('Yeni el başlamadı: '+done);
    }
  }
  if(room.lastRoundResult?.winner!==null&&room.matchEnded)wins++;
  rounds++;
  assert(room.matchEnded,'Maç bitmeli');
}
console.log(`botSimulation: ${rounds} el oynandı, ${wins} el kazananla bitti, ${okeySwaps} okey alma; 106 taş ve grup geçerliliği korundu`);
