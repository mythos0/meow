import { CatBrain } from '../../src/cat-brain.js';
function mulberry32(seed){let a=seed>>>0;return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const b = new CatBrain({ bounds:{x:0,y:0,w:1600,h:900}, groundY:860, x:800, rand:mulberry32(20260925), speed:55, runSpeed:150 });
b.setNoWalkZones([{x:200,y:700,w:500,h:300},{x:900,y:700,w:500,h:300}]);
let last=''; let runs=[];
for (let i=0;i*1/60<90;i++){
  b.tick(1/60);
  const key = b.state + (b.state==='walk'?(b._pauseT>0?'(pause)':''):'');
  if (key!==last){ runs.push(`t=${b.t.toFixed(1)} ${key} x=${b.x.toFixed(0)} wt=${b._wallTurns}`); last=key; }
}
console.log(runs.slice(0,45).join('\n'));
console.log('total runs:', runs.length);
