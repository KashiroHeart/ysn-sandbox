export const CELL = 32, COLS = 25, ROWS = 22;
const randomInt = (low, high) => low + Math.floor(Math.random() * (high - low + 1));

export function generateStage() {
  const blocks = [], hazards = [];
  const occupied = new Set();
  function block(col,row) {
    const key = col + ',' + row;
    if (!occupied.has(key)) {
      occupied.add(key);
      blocks.push({x:col*CELL, y:row*CELL});
    }
  }
  let col=0, row=randomInt(14,17);
  const spawn={x:CELL+1, y:row*CELL-31};
  let goal;
  while (col<COLS) {
    const length=Math.min(randomInt(3,5),COLS-col);
    for(let i=0;i<length;i++) {
      block(col+i,row);
      if (i>0 && i<length-1) block(col+i,row+1);
    }
    if (col+length>=COLS-2) {
      goal={x:(col+length-1)*CELL,y:(row-1)*CELL};
      break;
    }
    if(col>0 && length>=4 && Math.random()<.68) hazards.push({x:(col+1)*CELL,y:(row-1)*CELL});
    col+=length+randomInt(1,2);
    row=Math.max(9,Math.min(18,row+randomInt(-2,2)));
  }
  // Higher ledges provide alternate routes through the random field.
  for(let band=0;band<2;band++) {
    for(let x=randomInt(0,3);x<COLS;) {
      const y=randomInt(2,4)+band*4, n=Math.min(randomInt(2,4),COLS-x);
      for(let i=0;i<n;i++) block(x+i,y);
      if(n>2 && Math.random()<.4) hazards.push({x:(x+1)*CELL,y:(y-1)*CELL});
      x+=n+randomInt(2,4);
    }
  }
  return {blocks,hazards,goal,spawn};
}

export function newPlayer(stage) {
  return {...stage.spawn,vy:0,grounded:false,jumps:1};
}

function body(x,y) {return [[x+15,y+4],[x+26,y+30],[x+4,y+30]]}
function square({x,y}) {return [[x,y],[x+32,y],[x+32,y+32],[x,y+32]]}
function rhombus({x,y}) {return [[x+16,y],[x+32,y+16],[x+16,y+32],[x,y+16]]}

// Convex polygon intersection. Edges that merely touch a platform are free
// so horizontal motion stays smooth along a flat row of blocks.
function overlaps(a,b,touch) {
  for (const poly of [a,b]) {
    for(let i=0;i<poly.length;i++) {
      const p=poly[i], q=poly[(i+1)%poly.length];
      const nx=p[1]-q[1], ny=q[0]-p[0];
      const pa=a.map(v=>v[0]*nx+v[1]*ny), pb=b.map(v=>v[0]*nx+v[1]*ny);
      const gap=Math.max(Math.min(...pa)-Math.max(...pb),Math.min(...pb)-Math.max(...pa));
      if(touch ? gap>0 : gap>=0) return false;
    }
  }
  return true;
}

function contact(x,y,objects,shape,touch=false) {
  const triangle=body(x,y);
  return objects.some(o=>x+26>=o.x && x+4<=o.x+32 && y+30>=o.y && y+4<=o.y+32 &&
    overlaps(triangle,shape(o),touch));
}

function move(player,axis,amount,stage) {
  const origin=player[axis];
  player[axis]=origin+amount;
  if(!contact(player.x,player.y,stage.blocks,square)) return false;
  let low=0, high=1;
  for(let i=0;i<16;i++) {
    const mid=(low+high)/2;
    player[axis]=origin+amount*mid;
    if(contact(player.x,player.y,stage.blocks,square)) high=mid;
    else low=mid;
  }
  player[axis]=origin+amount*low;
  return true;
}

// One simulation tick is 1/60 s, independent of display refresh rate.
export function step(stage,p,input) {
  let event;
  if(input.jumpPressed && (p.grounded || p.jumps>0)) {
    p.jumps=p.grounded ? 1 : 0;
    p.vy=-10.3125;
    p.grounded=false;
    event='jump';
  }
  if(!input.jumpHeld && p.vy < -3.8) p.vy=-3.8;
  p.vy=Math.min(14,p.vy+.625);
  const dx=4*(Number(input.right)-Number(input.left));
  const parts=Math.ceil(Math.max(1,Math.abs(dx),Math.abs(p.vy))/2);
  p.grounded=false;
  for(let i=0;i<parts;i++) {
    if(dx) move(p,'x',dx/parts,stage);
    p.x=Math.max(-4,Math.min(COLS*CELL-26,p.x));
    if(p.vy && move(p,'y',p.vy/parts,stage)) {
      if(p.vy>0) {p.grounded=true;p.jumps=1}
      p.vy=0;
    }
    if(p.y+30>ROWS*CELL || contact(p.x,p.y,stage.hazards,rhombus,true)) return 'miss';
    if(contact(p.x,p.y,[stage.goal],square,true)) return 'clear';
  }
  return event;
}
