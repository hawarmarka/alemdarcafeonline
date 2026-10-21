'use strict';
// Okey çiftte joker; geri bırakılan yan taş aynı turda tekrar alınamaz; 'Masa Aç' açık masası kendi kurallarıyla listelenir.
const assert = require('node:assert/strict');
const Module = require('node:module');
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n=0;
  constructor(io){this.id='v33'+(++FakeSocket.n);this.handlers={};this.out=[];this.rooms=new Set();this.data={};io.sockets.sockets.set(this.id,this);io.connect(this);}
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
const Game=require('../server/gameLogic');
const t=(c,n,id)=>({id:id||`${c}${n}-${Math.random()}`,color:c,number:n,isFakeJoker:false});

// 1) Okey çiftte joker
const g=new Game(); g.okey={color:'Mavi',number:6};
const hand=[t('Kirmizi',3,'a'),t('Kirmizi',3,'b'),t('Siyah',9,'c'),t('Yesil',2,'d'),t('Mavi',6,'okey1')];
const pairs=g.countPairs(hand);
assert.equal(pairs.length,2,'doğal çift + okeyle çift');
assert(pairs.some(p=>p.some(x=>x.id==='okey1')&&p.some(x=>x.id==='c')),'okey en yüksek tek taşla (siyah 9) eşleşmeli');
assert.equal(g.countPairs(hand,false).length,1,'okeysiz sayımda yalnız doğal çift');
const twoOkeys=[t('Mavi',6,'o1'),t('Mavi',6,'o2')];
assert.equal(g.countPairs(twoOkeys).length,1,'iki okey kendi aralarında çift');

// 2) Geri bırakılan yan taş tekrar alınamaz
const s=new FakeSocket(fakeIO);
s.receive('joinGame',{mode:'create',autoBots:true,playerName:'yan',token:'y'.repeat(40),roundLimit:1});
const room=rooms.get(s.last('joinedGame').code);
const fill=room.botFillTimer,cb=fill._onTimeout;clearTimeout(fill);cb();
const game=room.game;_testing.stopTurn(room);
game.currentPlayer=0;game.hasDrawn=false;game.turnSerial=5;
game.discardPiles[3]=[t('Siyah',4,'left4')];game.deadDiscards={};
s.receive('drawTile',{fromDiscard:true});
assert(game.playerTiles[0].some(x=>x.id==='left4'),'yandan alınmalı');
s.receive('undoDiscardDraw');
assert.equal(game.discardPiles[3].at(-1).id,'left4','geri bırakılmalı');
s.receive('drawTile',{fromDiscard:true});
assert.match(s.last('gameError').message,/tekrar alamazsın/);
assert(!game.playerTiles[0].some(x=>x.id==='left4'));
s.receive('drawTile',{fromDiscard:false});
assert.equal(game.hasDrawn,true,'ortadan çekebilmeli');
_testing.stopTurn(room);

// 3) Masa Aç: açık masa kendi kurallarıyla, otomatik bot yok, kurucu yönetir
const h=new FakeSocket(fakeIO);
h.receive('joinGame',{mode:'create',isPublic:true,playerName:'kurucu2',token:'z'.repeat(40),teamMode:true,stackingMode:true,assisted:false,roundLimit:2});
const pub=rooms.get(h.last('joinedGame').code);
assert.equal(pub.isPublic,true);assert.equal(pub.teamMode,true);assert.equal(pub.stackingMode,true);assert.equal(pub.assisted,false);assert.equal(pub.roundLimit,2);
assert.equal(pub.botFillTimer,null,'kurucunun açtığı masa kendiliğinden dolmaz');
const r=new FakeSocket(fakeIO);
r.receive('joinGame',{mode:'random',modeKey:'klasik',playerName:'rastgele',token:'r'.repeat(40)});
assert.notEqual(r.last('joinedGame').code,pub.code,'HEMEN OYNA özel kurallı masaya düşmemeli');
clearTimeout(rooms.get(r.last('joinedGame').code).botFillTimer);
console.log('v33Rules: okeyle çift, geri bırakılan yan taş kilidi, Masa Aç açık masası geçti');
process.exit(0);
