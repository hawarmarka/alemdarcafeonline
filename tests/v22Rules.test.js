'use strict';
// Açtıktan sonra seri/çift indirme, masadaki okeyi alma, son taşı koruma ve okey cezası.
const assert = require('node:assert/strict');
const Module = require('node:module');
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n=0;
  constructor(io){this.id='v22s'+(++FakeSocket.n);this.handlers={};this.out=[];this.rooms=new Set();this.data={};io.sockets.sockets.set(this.id,this);io.connect(this);}
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
const Melds=require('../public/js/meldSolver');
const GameLogic=require('../server/gameLogic');

const t=(color,number,id)=>({id:id||`${color}-${number}-x`,color,number,isFakeJoker:false});
const okey={color:'Mavi',number:6};

// Çözücü: keepOne ile elde atılacak bir taş kalır.
const full=[t('Kirmizi',11),t('Kirmizi',12),t('Kirmizi',13),t('Siyah',11),t('Siyah',12),t('Siyah',13)];
assert.equal(Melds.solve(full,okey).groups.flat().length,6);
assert(Melds.solve(full,okey,null,true).groups.flat().length<=5,'keepOne bir taş bırakmalı');

// Okey serideki yuvasında durur; değeri yuvasına göre hesaplanır.
const g=new GameLogic(); g.okey=okey;
const J=t('Mavi',6,'joker');
assert.deepEqual(g.arrangeGroup([t('Kirmizi',5,'a'),J,t('Kirmizi',7,'b')]).map(x=>x.id),['a','joker','b']);
assert.deepEqual(g.arrangeGroup([t('Kirmizi',7,'b'),t('Kirmizi',5,'a'),J]).map(x=>x.id),['a','joker','b'],'okey eksik 6 yerine');
assert.equal(g.calculateGroupValue([J,t('Kirmizi',5,'a'),t('Kirmizi',6,'c')]),15,'okey 4 yerine');
// Elde kalan okey yalnızca 101 sayılır.
g.playerTiles=[[],[J,t('Kirmizi',3)],[],[]];
assert.equal(g.handPenalty(1),104);

// Sunucu senaryosu
const human=new FakeSocket(fakeIO);
human.receive('joinGame',{mode:'create',autoBots:true,playerName:'ali',token:'q'.repeat(40),roundLimit:1});
const room=rooms.get(human.last('joinedGame').code);
const fill=room.botFillTimer,cb=fill._onTimeout;clearTimeout(fill);cb();
const game=room.game; game.okey=okey;
_testing.stopTurn(room);
game.currentPlayer=0; game.hasDrawn=true;
game.playerStates.forEach(s=>Object.assign(s,{hasOpened:false,openType:null,openedGroups:[],mustOpenThisTurn:false,drawnFromDiscardTile:null}));
const ids=arr=>arr.map(x=>x.id);

// 1) Tüm taşları açmak (atılacak taş kalmaması) reddedilir.
const run1=[t('Kirmizi',11,'r11'),t('Kirmizi',12,'r12'),t('Kirmizi',13,'r13')];
const run2=[t('Siyah',11,'s11'),t('Siyah',12,'s12'),t('Siyah',13,'s13')];
const run3=[t('Yesil',10,'y10'),t('Yesil',11,'y11'),t('Yesil',12,'y12')];
game.playerTiles[0]=[...run1,...run2,...run3];
human.receive('openHand',{groups:[ids(run1),ids(run2),ids(run3)]});
assert.match(human.last('gameError').message,/atılacak bir taş/);
assert.equal(game.playerStates[0].hasOpened,false);

// 2) Açılış + sonraki turda puan sınırı olmadan yeni seri indirme.
const extra=[t('Mavi',1,'m1'),t('Mavi',2,'m2'),t('Mavi',3,'m3')];
game.playerTiles[0]=[...run1,...run2,...run3,t('Kirmizi',1,'k1'),...extra,J];
human.receive('openHand',{groups:[ids(run1),ids(run2),ids(run3)]});
assert.equal(game.playerStates[0].hasOpened,true,'101+ açılış yapılmalı');
human.receive('openHand',{groups:[ids(extra)]});
assert.equal(game.playerStates[0].openedGroups.length,4,'Açtıktan sonra yeni seri indirilebilmeli');

// 3) Masadaki okeyi temsil ettiği taşla alma.
game.playerStates[1].openType='normal';game.playerStates[1].hasOpened=true;
game.playerStates[1].openedGroups=[[t('Siyah',4,'s4'),J,t('Siyah',6,'s6')]];
game.playerTiles[0]=game.playerTiles[0].filter(x=>x.id!=='joker');
game.playerTiles[0].push(t('Siyah',5,'s5'));
human.receive('addToGroup',{tileId:'s5',targetPlayerIndex:1,targetGroupIndex:0,targetTileId:'joker'});
assert(game.playerTiles[0].some(x=>x.id==='joker'),'Okey ele geçmeli');
assert.deepEqual(ids(game.playerStates[1].openedGroups[0]),['s4','s5','s6']);

// 4) Son taş işlenemez.
game.playerTiles[0]=[t('Siyah',7,'s7')];
human.receive('addToGroup',{tileId:'s7',targetPlayerIndex:1,targetGroupIndex:0});
assert.match(human.last('gameError').message,/Son taş/);

// 5) Çift açan oyuncu sonradan yeni çift indirir.
game.playerStates[0]=Object.assign(game.playerStates[0],{hasOpened:true,openType:'pairs',openedGroups:[]});
game.playerTiles[0]=[t('Yesil',4,'a1'),t('Yesil',4,'a2'),t('Mavi',9,'b1'),t('Mavi',9,'b2'),t('Siyah',2,'c1')];
human.receive('openWithPairs');
assert.equal(game.playerStates[0].openedGroups.length,2);
assert.deepEqual(ids(game.playerTiles[0]),['c1']);
// 6) Bir sete bir turda en fazla 2 taş işlenir (7-8-9'a 6 ve 5 olur, 4 olmaz).
game.playerStates[0]=Object.assign(game.playerStates[0],{hasOpened:true,openType:'normal',openedGroups:[]});
game.playerStates[1].openedGroups=[[t('Kirmizi',7,'k7'),t('Kirmizi',8,'k8'),t('Kirmizi',9,'k9')]];
game.playerTiles[0]=[t('Kirmizi',6,'k6'),t('Kirmizi',5,'k5'),t('Kirmizi',4,'k4'),t('Siyah',1,'z1')];
for(const id of ['k6','k5','k4'])human.receive('addToGroup',{tileId:id,targetPlayerIndex:1,targetGroupIndex:0});
assert.equal(game.playerStates[1].openedGroups[0].length,5);
assert.match(human.last('gameError').message,/en fazla 2/);
game.turnSerial=(game.turnSerial||0)+1; // sonraki tur
human.receive('addToGroup',{tileId:'k4',targetPlayerIndex:1,targetGroupIndex:0});
assert.equal(game.playerStates[1].openedGroups[0].length,6,'sonraki turda işlenebilmeli');
_testing.stopTurn(room);
console.log('v22Rules: açtıktan sonra seri/çift indirme, okey alma, son taşı koruma, okey cezası geçti');
