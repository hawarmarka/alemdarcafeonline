/* 101 Okey: deterministic client-side grouping. Server always validates the chosen groups.
   Runs are ordered 1..13; actual okey tiles are wild, fake okeys are fixed indicator+1. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.OkeyMelds=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const COLORS=['Kirmizi','Yesil','Mavi','Siyah'];
 // keepOne: oyuncu bitirmek için taş atmak zorunda; elde en az bir taş bırakan en iyi dizilimi döndürür.
 function solve(hand,okey,requiredId,keepOne){
  if(!okey||!Array.isArray(hand)||hand.length>32)return {groups:[],score:0};
  const {n,all,byTile,visit}=prepare(hand,okey);
  const full=((1<<n)-1)>>>0;
  // A constrained opening must include the discarded tile drawn from the previous player.
  const reqIndex=requiredId?hand.findIndex(t=>t.id===requiredId):-1;
  if(requiredId&&reqIndex<0)return {groups:[],score:0};
  function bestWithin(avail){
   if(reqIndex<0)return visit(avail);
   let out={score:0,groups:[]};
   for(const c of byTile[reqIndex]){
    if(((c.mask&avail)>>>0)!==c.mask)continue;
    const rest=visit((avail^c.mask)>>>0),score=c.points+rest.score;
    if(score>out.score)out={score,groups:[c,...rest.groups]};
   }
   return out;
  }
  let best=bestWithin(full);
  const covered=best.groups.reduce((s,c)=>s+c.indices.length,0);
  if(keepOne&&n>0&&covered>=n){
   let alt={score:0,groups:[]};
   for(let j=0;j<n;j++){
    if(j===reqIndex)continue;
    const r=bestWithin((full^(1<<j))>>>0);
    if(r.score>alt.score)alt=r;
   }
   best=alt;
  }
  const groups=best.groups.map(c=>c.indices.map(i=>hand[i]));
  return {groups,score:best.score,candidates:all.length};
 }
 // probeGains: elin en iyi puanı, her deneme taşı ayrı ayrı eklenince ne kadar artar?
 // solve([...hand, probe]).score - solve(hand).score ile aynı sonucu verir; elin çözümü bir kez yapılır,
 // her deneme taşı için yalnızca o taşı içeren gruplar denenir (botun taş seçimi için, sunucuda hız).
 function probeGains(hand,okey,probes){
  if(!okey||!Array.isArray(hand)||hand.length>=32)return probes.map(()=>0);
  const {n,wild,fixed,visit,resetBudget}=prepare(hand,okey);
  const full=((1<<n)-1)>>>0, base=visit(full).score;
  return probes.map(p=>{
   resetBudget();
   // Gerçek okey olan deneme taşı her gruba girebilir; nadir olduğu için tam çözüme bırakılır.
   if(!p.isFakeJoker&&p.color===okey.color&&p.number===okey.number)return Math.max(0,solve([...hand,p],okey).score-base);
   const color=p.isFakeJoker?okey.color:p.color, num=p.isFakeJoker?okey.number:p.number;
   let best=base;
   const tryGroup=(indices,points)=>{
    const mask=indices.reduce((m,i)=>m|(1<<i),0)>>>0;
    const score=points+visit((full^mask)>>>0).score;
    if(score>best)best=score;
   };
   // Per: deneme taşı + diğer renklerden en fazla birer taş + okeyler, toplam 3-4 taş.
   const others=COLORS.filter(c=>c!==color).map(c=>fixed.filter(t=>t.color===c&&t.number===num).map(t=>t.i));
   (function pick(k,arr){
    if(k===3){
     for(let w=0;w<=Math.min(wild.length,3-arr.length);w++){
      const size=arr.length+1+w;
      if(size<3||size>4)continue;
      if(w===0)tryGroup(arr,size*num);
      if(w===1)for(const j of wild)tryGroup([...arr,j],size*num);
      if(w===2&&wild.length===2)tryGroup([...arr,...wild],size*num);
     }
     return;
    }
    pick(k+1,arr);
    for(const i of others[k])pick(k+1,[...arr,i]);
   })(0,[]);
   // Seri: deneme taşı kendi sayısının yuvasında; diğer yuvalar aynı renkten taş veya okey.
   const bags=Array.from({length:14},(_,v)=>fixed.filter(t=>t.color===color&&t.number===v).map(t=>t.i));
   for(let start=Math.max(1,num-12);start<=num;start++)for(let end=Math.max(start+2,num);end<=Math.min(13,start+12);end++){
    const points=(start+end)*(end-start+1)/2;
    (function pick(v,arr){
     if(v>end){tryGroup(arr,points);return;}
     if(v===num){pick(v+1,arr);return;}
     for(const i of bags[v])pick(v+1,[...arr,i]);
     for(const j of wild)if(!arr.includes(j))pick(v+1,[...arr,j]);
    })(start,[]);
   }
   return best-base;
  });
 }
 // Elin aday grupları ve en iyi bölümleme araması (solve ve probeGains ortak kullanır).
 function prepare(hand,okey){
  const n=hand.length, wild=[],fixed=[];
  hand.forEach((t,i)=>{
   if(!t.isFakeJoker&&t.color===okey.color&&t.number===okey.number)wild.push(i);
   else fixed.push({i,color:t.isFakeJoker?okey.color:t.color,number:t.isFakeJoker?okey.number:t.number});
  });
  const candidates=new Map();
  function add(indices,points,kind){
   if(indices.length<3||indices.length>13||!indices.some(i=>!wild.includes(i)))return;
   const mask=indices.reduce((m,i)=>m|(1<<i),0)>>>0;
   const old=candidates.get(mask);
   if(!old||points>old.points)candidates.set(mask,{mask,indices,points,kind});
  }
  // Same-number sets: 3-4 distinct colours, any remaining slot may be a physical joker.
  for(let num=1;num<=13;num++){
   const bags=COLORS.map(color=>fixed.filter(t=>t.color===color&&t.number===num).map(t=>t.i));
   function pick(color,arr){
    if(color===4){
     for(let w=0;w<=Math.min(wild.length,4-arr.length);w++){
      if(arr.length+w<3||arr.length+w>4)continue;
      if(w===0)add(arr,arr.length*num,'set');
      if(w===1)for(const j of wild)add([...arr,j],(arr.length+1)*num,'set');
      if(w===2&&wild.length===2)add([...arr,...wild],(arr.length+2)*num,'set');
     }
     return;
    }
    pick(color+1,arr);
    for(const i of bags[color])pick(color+1,[...arr,i]);
   }
   pick(0,[]);
  }
  // Same-colour consecutive run, with at most two real okeys filling missing numbers.
  for(const color of COLORS){
   const bags=Array.from({length:14},(_,num)=>fixed.filter(t=>t.color===color&&t.number===num).map(t=>t.i));
   for(let start=1;start<=11;start++)for(let end=start+2;end<=13;end++){
    const points=(start+end)*(end-start+1)/2;
    function pick(num,arr,usedWild){
     if(num>end){add(arr,points,'run');return;}
     for(const i of bags[num])pick(num+1,[...arr,i],usedWild);
     if(usedWild<wild.length)for(const j of wild)if(!arr.includes(j))pick(num+1,[...arr,j],usedWild+1);
    }
    pick(start,[],0);
   }
  }
  const all=[...candidates.values()].sort((a,b)=>b.points-a.points||b.indices.length-a.indices.length);
  const byTile=Array.from({length:n},()=>[]);
  all.forEach(c=>c.indices.forEach(i=>byTile[i].push(c)));
  const memo=new Map();let visited=0;
  function visit(avail){
   if(!avail)return {score:0,groups:[]};
   if(memo.has(avail))return memo.get(avail);
   if(++visited>65000)return {score:0,groups:[]};
   const bit=(avail&-avail)>>>0,i=31-Math.clz32(bit);
   let best=visit((avail^bit)>>>0);
   for(const c of byTile[i]){
    if(((c.mask&avail)>>>0)!==c.mask)continue;
    const next=visit((avail^c.mask)>>>0),score=next.score+c.points;
    if(score>best.score){best={score,groups:[c,...next.groups]};}
   }
   memo.set(avail,best);return best;
  }
  // Arama sınırı her çözümde ayrı sayılır (probeGains her deneme taşı için sıfırlar).
  const resetBudget=()=>{visited=0;};
  return {n,wild,fixed,all,byTile,visit,resetBudget};
 }
 // Sunucudaki GameLogic.isValidGroup ile aynı kural: 3-13 taşlık aynı renk ardışık seri (13-1 yok)
 // veya 3-4 taşlık farklı renkli aynı sayı per. Gerçek okey joker, sahte okey okeyin değeri.
 function isValidGroup(tiles,okey){
  if(!okey||!Array.isArray(tiles)||tiles.length<3)return false;
  const isWild=t=>!t.isFakeJoker&&t.color===okey.color&&t.number===okey.number;
  const fixed=tiles.filter(t=>!isWild(t)).map(t=>t.isFakeJoker?{color:okey.color,number:okey.number}:t);
  if(!fixed.length)return false;
  if(tiles.length<=4&&fixed.every(t=>t.number===fixed[0].number)&&new Set(fixed.map(t=>t.color)).size===fixed.length)return true;
  if(tiles.length>13||fixed.some(t=>t.color!==fixed[0].color)||new Set(fixed.map(t=>t.number)).size!==fixed.length)return false;
  const min=Math.min(...fixed.map(t=>t.number)),max=Math.max(...fixed.map(t=>t.number));
  return max-min<tiles.length&&tiles.length<=13;
 }
 return {solve,probeGains,isValidGroup};
});
