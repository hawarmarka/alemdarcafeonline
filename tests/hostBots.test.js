'use strict';
// Özel masa: otomatik bot yok; yalnızca masayı açan bot ekler/çıkarır/botlarla başlatır; kurucu ayrılınca yönetim devredilir.
const assert = require('node:assert/strict');
const Module = require('node:module');
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n=0;
  constructor(io){this.id='hb'+(++FakeSocket.n);this.handlers={};this.out=[];this.rooms=new Set();this.data={};io.sockets.sockets.set(this.id,this);io.connect(this);}
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

const host=new FakeSocket(fakeIO);
host.receive('joinGame',{mode:'create',playerName:'kurucu',token:'k'.repeat(40),roundLimit:1,teamMode:true});
const room=rooms.get(host.last('joinedGame').code);
assert.equal(room.botFillTimer,null,'özel masa kendiliğinden bot almamalı');
assert.equal(host.last('lobbyUpdate').hostIndex,0);
const friend=new FakeSocket(fakeIO);
friend.receive('joinGame',{mode:'code',roomCode:room.code,playerName:'arkadas',token:'a'.repeat(40)});
assert.equal(room.players.length,2);
friend.receive('addBot');
assert.match(friend.last('gameError').message,/masayı açan/,'yalnızca kurucu bot ekleyebilmeli');
host.receive('addBot');
assert.equal(room.players.length,3);
assert(room.players[2].isBot);
host.receive('removeBot',{index:2});
assert.equal(room.players.length,2,'bot çıkarılabilmeli');
host.receive('removeBot',{index:1});
assert.match(host.last('gameError').message,/bot yok/,'gerçek oyuncu çıkarılamaz');
// Kurucu ayrılırsa yönetim arkadaşa geçer
host.receive('leaveGame');
assert.equal(room.players.length,1);
assert.equal(friend.last('lobbyUpdate').hostIndex,0,'yönetim kalan oyuncuya geçmeli');
friend.receive('addBot');
assert.equal(room.players.length,2);
friend.receive('startWithBots');
assert.equal(room.players.length,4);
assert.equal(room.started,true,'botlarla başlatınca oyun başlamalı');
friend.receive('addBot');
assert.match(friend.last('gameError').message,/başladıktan/);
_testing.stopTurn(room);
// Açık masa hâlâ kendiliğinden dolar
const solo=new FakeSocket(fakeIO);
solo.receive('joinGame',{mode:'random',modeKey:'klasik',playerName:'tek',token:'t'.repeat(40)});
const pub=rooms.get(solo.last('joinedGame').code);
assert(pub.botFillTimer,'açık masa botla dolmalı');
clearTimeout(pub.botFillTimer);
console.log('hostBots: özel masada kurucu bot ekler/çıkarır/başlatır, yönetim devri, açık masa otomatik dolar geçti');
process.exit(0);
