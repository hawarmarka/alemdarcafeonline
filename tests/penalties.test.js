'use strict';
// Ceza sistemi ve el sonu puanlaması: işlek atma, okey atma, hatalı açma, bitiş çarpanları, deste bitişi.
const assert = require('node:assert/strict');
const Module = require('node:module');
const nativeLoad = Module._load;
let fakeIO;
class FakeSocket {
  static n=0;
  constructor(io){this.id='pen'+(++FakeSocket.n);this.handlers={};this.out=[];this.rooms=new Set();this.data={};io.sockets.sockets.set(this.id,this);io.connect(this);}
  on(e,fn){this.handlers[e]=fn;} emit(e,d){this.out.push({event:e,data:d});}
  join(r){this.rooms.add(r);} leave(r){this.rooms.delete(r);}
  receive(e,d){return this.handlers[e](d);}
  last(e){return this.out.filter(x=>x.event===e).at(-1)?.data;}
  all(e){return this.out.filter(x=>x.event===e).map(x=>x.data);}
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

const t=(color,number,id)=>({id:id||`${color}-${number}-${Math.random()}`,color,number,isFakeJoker:false});
const okey={color:'Mavi',number:6};
function setup(name){
  const s=new FakeSocket(fakeIO);
  s.receive('joinGame',{mode:'create',autoBots:true,playerName:name,token:name.padEnd(30,'z'),roundLimit:2});
  const room=rooms.get(s.last('joinedGame').code);
  const fill=room.botFillTimer,cb=fill._onTimeout;clearTimeout(fill);cb();
  const game=room.game; game.okey=okey; _testing.stopTurn(room);
  game.currentPlayer=0; game.hasDrawn=true; game.turnSerial=8;
  game.playerStates.forEach(st=>Object.assign(st,{hasOpened:false,openType:null,openedGroups:[],mustOpenThisTurn:false,drawnFromDiscardTile:null}));
  return {s,room,game,score:()=>room.scores[name]};
}

// 1) İşlek taş atma: +101 ve bildirim
{
  const {s,room,game,score}=setup('islekci');
  game.playerStates[1]=Object.assign(game.playerStates[1],{hasOpened:true,openType:'normal',openedGroups:[[t('Kirmizi',5),t('Kirmizi',6),t('Kirmizi',7)]]});
  game.playerTiles[0]=[t('Kirmizi',8,'k8'),t('Siyah',1),t('Siyah',2)];
  s.receive('discardTile',{tileId:'k8'});
  assert.equal(score(),101,'işlek atan 101 ceza almalı');
  assert.equal(s.last('penalty').reason,'İşlek taş attı');
  assert.equal(room.roundExtras[0],101,'ceza bu elin satırına da yazılmalı');
  _testing.stopTurn(room);
}
// 2) Okey atma: +101 (işlek cezası ayrıca yazılmaz)
{
  const {s,room,game,score}=setup('okeyci');
  game.playerStates[1]=Object.assign(game.playerStates[1],{hasOpened:true,openType:'normal',openedGroups:[[t('Kirmizi',5),t('Kirmizi',6),t('Kirmizi',7)]]});
  game.playerTiles[0]=[t('Mavi',6,'joker'),t('Siyah',1),t('Siyah',2)];
  s.receive('discardTile',{tileId:'joker'});
  assert.equal(score(),101,'okey atan yalnızca bir kez 101 ceza almalı');
  assert.equal(s.last('penalty').reason,'Okey attı');
  _testing.stopTurn(room);
}
// 3) Hatalı açma: 101'e ulaşmayan seri açılışı +101, aynı turda ikinci deneme tekrar ceza yazmaz
{
  const {s,room,game,score}=setup('acamayan');
  const low=[t('Kirmizi',1,'a'),t('Kirmizi',2,'b'),t('Kirmizi',3,'c')];
  game.playerTiles[0]=[...low,t('Siyah',9),t('Siyah',11)];
  s.receive('openHand',{groups:[['a','b','c']]});
  assert.equal(score(),101);
  assert.match(s.last('gameError').message,/101 ceza/);
  s.receive('openHand',{groups:[['a','b','c']]});
  assert.equal(score(),101,'aynı turda ceza bir kez yazılır');
  assert.equal(game.playerStates[0].hasOpened,false);
  _testing.stopTurn(room);
}
// 4) Ceza modu kapalı masada ceza yazılmaz
{
  const {s,room,game,score}=setup('cezasiz');
  room.penaltyMode=false;
  game.playerTiles[0]=[t('Mavi',6,'joker2'),t('Siyah',1),t('Siyah',2)];
  s.receive('discardTile',{tileId:'joker2'});
  assert.equal(score(),0);
  _testing.stopTurn(room);
}
// 5) Normal bitiş: kazanan -101, açan elindeki toplam (okey 101), açmayan 202
{
  const {s,room,game}=setup('bitiren');
  game.playerStates[0]=Object.assign(game.playerStates[0],{hasOpened:true,openType:'normal',openedAtTurn:2});
  game.playerStates[1]=Object.assign(game.playerStates[1],{hasOpened:true,openType:'normal'});
  game.playerTiles[1]=[t('Siyah',10),t('Mavi',6)]; // 10 + okey(101)
  game.playerTiles[0]=[t('Kirmizi',4,'last')];
  s.receive('discardTile',{tileId:'last'});
  const res=s.last('gameFinished');
  assert(res,'el bitmeli');
  assert.deepEqual(res.points,[-101,111,202,202]);
}
// 6) Okeyle bitiş: kazanan -202, diğerleri iki katı
{
  const {s,room,game}=setup('okeylebiten');
  game.playerStates[0]=Object.assign(game.playerStates[0],{hasOpened:true,openType:'normal',openedAtTurn:2});
  game.playerStates[1]=Object.assign(game.playerStates[1],{hasOpened:true,openType:'normal'});
  game.playerTiles[1]=[t('Siyah',10)];
  game.playerTiles[0]=[t('Mavi',6,'okeyLast')];
  s.receive('discardTile',{tileId:'okeyLast'});
  const res=s.last('gameFinished');
  assert.deepEqual(res.points,[-202,20,404,404]);
}
// 7) Elden bitiş (açtığı turda bitirme): kazanan -202, diğerleri iki katı
{
  const {s,room,game}=setup('eldenbiten');
  const g1=[t('Kirmizi',11,'r11'),t('Kirmizi',12,'r12'),t('Kirmizi',13,'r13')];
  const g2=[t('Siyah',11,'s11'),t('Siyah',12,'s12'),t('Siyah',13,'s13')];
  const g3=[t('Mavi',10,'m10'),t('Mavi',11,'m11'),t('Mavi',12,'m12')];
  game.playerTiles[0]=[...g1,...g2,...g3,t('Siyah',1,'last1')];
  s.receive('openHand',{groups:[g1.map(x=>x.id),g2.map(x=>x.id),g3.map(x=>x.id)]});
  assert.equal(game.playerStates[0].hasOpened,true);
  s.receive('discardTile',{tileId:'last1'});
  const res=s.last('gameFinished');
  assert.equal(res.points[0],-202);
  assert.deepEqual(res.points.slice(1),[404,404,404]);
}
// 8) Çift açan oyuncunun elindeki ceza iki katı; deste bitince açmayan 202
{
  const {room,game}=setup('desteBitti');
  game.playerStates[1]=Object.assign(game.playerStates[1],{hasOpened:true,openType:'pairs'});
  game.playerTiles[1]=[t('Siyah',5),t('Kirmizi',3)];
  game.playerStates[2]=Object.assign(game.playerStates[2],{hasOpened:true,openType:'normal'});
  game.playerTiles[2]=[t('Siyah',7)];
  assert.deepEqual(game.calculateExhaustedPoints(),[202,16,7,202]);
  _testing.finishRound(room,null,{type:'exhausted'});
  assert.equal(room.roundHistory.at(-1)[1],16);
}
console.log('penalties: işlek/okey atma, hatalı açma, cezasız masa, normal/okeyli/elden bitiş, çift ve deste bitişi puanları geçti');
process.exit(0);
