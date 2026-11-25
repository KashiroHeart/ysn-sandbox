const ink = '#223e66';
const blue = '#2c5fd5';

function pixels(ctx, rows, x, y, size, color) {
  ctx.fillStyle = color;
  rows.forEach((row, j) => [...row].forEach((bit, i) => {
    if (bit === '1') ctx.fillRect(x + i * size, y + j * size, size, size);
  }));
}

export function icons(soundOn, expanded) {
  const logo = document.querySelector('#brand').getContext('2d');
  pixels(logo, ['00100000100','00010001000','00111111100','01101110110','11111111111','10111111101','10100000101','00011011000'], 2, 4, 3, blue);
  const speaker = document.querySelector('#sound canvas').getContext('2d');
  speaker.clearRect(0, 0, 22, 22);
  pixels(speaker, ['000011','000111','111111','111111','111111','000111','000011'], 0, 4, 2, ink);
  pixels(speaker, soundOn ? ['0010','1001','0101','0101','1001','0010'] : ['0000','1001','0110','0110','1001','0000'], 14, 5, 2, ink);
  const full = document.querySelector('#fullscreen canvas').getContext('2d');
  full.clearRect(0, 0, 22, 22);
  for (let i = 0; i < 4; i++) {
    full.save();
    full.translate(11, 11);
    full.rotate(i * Math.PI / 2);
    pixels(full, expanded ? ['001','001','111'] : ['111','100','100'], -9, -9, 2, ink);
    full.restore();
  }
}

const letters = {
  R:['11110','11011','11011','11110','11100','11010','11011'],
  A:['01110','11011','11011','11111','11011','11011','11011'],
  N:['11001','11101','11101','11111','11011','11011','11001'],
  D:['11110','11011','11011','11011','11011','11011','11110'],
  C:['01111','11000','11000','11000','11000','11000','01111'],
  T:['11111','11111','00110','00110','00110','00110','00110'],
  I:['111','111','011','011','011','111','111'],
  O:['01110','11011','11011','11011','11011','11011','01110'],
  S:['01111','11000','11000','01110','00011','00011','11110']
};

export function wordmark(canvas) {
  const ctx = canvas.getContext('2d');
  const glyphs = [...'RANDACTIONS'].map(c => letters[c]);
  const width = glyphs.reduce((w,g) => w + g[0].length + 1, -1);
  const px = 13;
  canvas.width = (width + 2) * px + 8;
  canvas.height = 7 * px + 14;
  // A stepped extrusion keeps the lettering crisp at every display size.
  for (let depth = 8; depth >= 0; depth--) {
    ctx.save();
    ctx.translate(18 - depth / 2, 1 + depth);
    ctx.transform(1, 0, -.16, 1, 0, 0);
    let x = 0;
    for (const glyph of glyphs) {
      pixels(ctx, glyph, x, 0, px, depth ? '#183465' : '#3063dd');
      x += (glyph[0].length + 1) * px;
    }
    ctx.restore();
  }
}

export function tile(ctx, x, y, s = 32) {
  ctx.fillStyle = ink;
  ctx.fillRect(x,y,s,s);
  ctx.fillStyle = '#a9c3e4';
  ctx.fillRect(x+2,y+2,s-4,s-4);
  ctx.fillStyle = '#e5f1ff';
  ctx.fillRect(x+2,y+2,s-4,3);
  ctx.fillRect(x+2,y+2,3,s-4);
  ctx.fillStyle = '#7294c0';
  ctx.fillRect(x+4,y+s-5,s-6,3);
  ctx.fillRect(x+s-5,y+4,3,s-6);
  const pad = Math.round(s*.23);
  ctx.fillStyle = '#416895';
  ctx.fillRect(x+pad,y+pad,s-pad*2,s-pad*2);
  ctx.fillStyle = '#c4d9f0';
  ctx.fillRect(x+pad+2,y+pad+2,s-pad*2-4,s-pad*2-4);
}

function polygon(ctx, points, fill, stroke) {
  ctx.beginPath();
  points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.closePath();
  ctx.fillStyle=fill; ctx.fill();
  if (stroke) { ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke(); }
}

export function triangle(ctx,x,y,s=30) {
  polygon(ctx,[[x+s/2,y+2],[x+s-1.5,y+s-1],[x+1.5,y+s-1]],blue,ink);
  polygon(ctx,[[x+s/2,y+6],[x+6,y+s-4],[x+10,y+s-4]],'#88baff');
}

export function diamond(ctx,x,y,s=32) {
  const m=s/2;
  polygon(ctx,[[x+m,y+1.5],[x+s-1.5,y+m],[x+m,y+s-1.5],[x+1.5,y+m]],'#f7ad60','#ac561f');
  const p=s*.21;
  polygon(ctx,[[x+m,y+p],[x+s-p,y+m],[x+m,y+s-p],[x+p,y+m]],'#edf2f8','#ac561f');
}

export function goal(ctx,x,y,s=32) {
  ctx.beginPath();ctx.arc(x+s/2,y+s/2,s/2-1,0,Math.PI*2);
  ctx.fillStyle='#f7c548';ctx.fill();ctx.strokeStyle='#806021';ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.arc(x+s/2,y+s/2,s*.34,3.45,4.9);ctx.strokeStyle='#fff2ab';ctx.lineWidth=3;ctx.stroke();
}

function cloud(ctx,x,y,scale) {
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  polygon(ctx, [[0,16],[8,16],[8,10],[16,10],[16,3],[31,3],[31,8],[40,8],[40,13],[49,13],[49,20],[0,20]],'#f8fbff','#c2d3e6');
  ctx.restore();
}

export function grid(ctx,w,h,offsetX=0,offsetY=0) {
  ctx.fillStyle='#edf2f8';ctx.fillRect(0,0,w,h);
  ctx.beginPath();
  for(let x=Math.round(offsetX)%32+.5;x<w;x+=32){ctx.moveTo(x,0);ctx.lineTo(x,h)}
  for(let y=Math.round(offsetY)%32+.5;y<h;y+=32){ctx.moveTo(0,y);ctx.lineTo(w,y)}
  ctx.strokeStyle='#dce5f0';ctx.lineWidth=1;ctx.stroke();
}

export function titleScene(ctx,w,h) {
  grid(ctx,w,h);
  const s = Math.max(19,Math.min(36,Math.round(w/30)));
  const base = h-1;
  cloud(ctx,w*.081,h*.19,1);
  cloud(ctx,w*.775,h*.12,.72);
  cloud(ctx,w*.90,h*.32,1.22);
  cloud(ctx,w*.32,h*.70,.66);
  // Platforms extend through the frame, like a cropped view of a larger stage.
  function platform(x, rows) {
    rows.forEach((height,col) => {
      for(let row=1;row<=height;row++) tile(ctx,x+col*s,base-row*s+2,s);
    });
  }
  platform(-s*.6,[2,2,2,3,3,3,2,2]);
  const middle = w*.49;
  for(let i=0;i<3;i++) tile(ctx,middle+i*s,base-s*1.75,s);
  const right=w-s*6.5;
  platform(right,[2,2,2,3,3,4,4,4]);
  triangle(ctx,s*3.6,base-3*s+2-s*.9,s*.9);
  goal(ctx,right+s*5.08,base-4*s+2-s*.84,s*.84);
  diamond(ctx,right-s*.95,base-2.9*s,s*.78);
  diamond(ctx,right-s*2,base-2.9*s,s*.78);
  ctx.beginPath();
  ctx.moveTo(s*4.4,base-3.65*s);
  ctx.quadraticCurveTo(s*5.7,base-5.7*s,s*7.55,base-3.1*s);
  ctx.setLineDash([4,6]);ctx.strokeStyle='#7898c3';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
  for(const [x,y] of [[.17,.4],[.70,.65],[.86,.17],[.37,.16],[.39,.88],[.08,.56]]) {
    ctx.fillStyle='#a7bbd6';ctx.fillRect(w*x-4,h*y,9,1);ctx.fillRect(w*x,h*y-4,1,9);
  }
}
