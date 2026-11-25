import {generateStage,newPlayer,step,CELL,COLS,ROWS} from './game.js';
import {icons,wordmark,grid,titleScene,tile,diamond,triangle,goal} from './art.js';

const $=id=>document.getElementById(id);
const field=$('field'), canvas=$('scene'), ctx=canvas.getContext('2d');
const held={left:new Set(),right:new Set(),jump:new Set()};
const keys={KeyA:'left',KeyD:'right',Space:'jump'};
let mode='title',stage,player,queuedJump=false,soundOn=true,audio;
let width=0,height=0,frame=0,previous=0,elapsed=0;
wordmark($('wordmark'));

function draw() {
  if(mode==='title') {titleScene(ctx,width,height);return}
  const ox=width/2-player.x-15, oy=height/2-player.y-15;
  grid(ctx,width,height,ox,oy);
  ctx.save();ctx.translate(ox,oy);
  ctx.strokeStyle='#a9bcd1';ctx.setLineDash([4,5]);ctx.strokeRect(0,0,COLS*CELL,ROWS*CELL);ctx.setLineDash([]);
  for(const b of stage.blocks) tile(ctx,b.x,b.y);
  for(const h of stage.hazards) diamond(ctx,h.x,h.y);
  goal(ctx,stage.goal.x,stage.goal.y);
  triangle(ctx,player.x,player.y);
  ctx.restore();
}
function resize() {
  width=field.clientWidth;height=field.clientHeight;
  const ratio=Math.min(devicePixelRatio || 1,3);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
  draw();
}
new ResizeObserver(resize).observe(field);
function unlockAudio() {
  if(!soundOn || !window.AudioContext) return;
  try {audio ??= new AudioContext();if(audio.state==='suspended') audio.resume().catch(()=>{});} catch {}
}
function tone(from,to,duration,delay=0) {
  if(!soundOn || audio?.state!=='running') return;
  const osc=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime+delay;
  osc.type='square';osc.frequency.setValueAtTime(from,t);osc.frequency.exponentialRampToValueAtTime(to,t+duration);
  gain.gain.setValueAtTime(.026,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+duration);
}
function resetInput() {
  Object.values(held).forEach(s=>s.clear());queuedJump=false;
  previous=0;elapsed=0;
}
function input(action,source,on) {
  if(on) {
    if(action==='jump' && !held.jump.size) queuedJump=true;
    held[action].add(source);
  } else held[action].delete(source);
}
function finish(result) {
  mode=result;resetInput();$('touch').hidden=true;
  const clear=result==='clear';
  $('result-title').textContent=clear?'Stage Clear!':'Miss!';
  $('result-title').classList.toggle('clear',clear);
  $('status').textContent=clear?'Stage clear':'Miss';
  if(clear){tone(392,523,.12);tone(523,784,.18,.12)} else tone(210,64,.22);
  $('result').showModal();$('replay').focus();
}
function loop(now) {
  if(mode!=='play') return;
  if(previous) elapsed+=Math.min(now-previous,100);
  previous=now;
  while(elapsed>=1000/60) {
    const result=step(stage,player,{left:!!held.left.size,right:!!held.right.size,jumpPressed:queuedJump,jumpHeld:!!held.jump.size});
    queuedJump=false;elapsed-=1000/60;
    if(result==='miss'||result==='clear'){finish(result);break}
    if(result==='jump') tone(240,530,.095);
  }
  draw();
  if(mode==='play') frame=requestAnimationFrame(loop);
}
function start(fresh) {
  if(fresh) stage=generateStage();
  player=newPlayer(stage);
  mode='play';resetInput();unlockAudio();tone(330,494,.12);
  if($('result').open) $('result').close();
  $('intro').hidden=true;$('touch').hidden=false;$('status').textContent='In play';
  field.focus({preventScroll:true});draw();
  cancelAnimationFrame(frame);frame=requestAnimationFrame(loop);
}
$('start').onclick=()=>start(true);
$('replay').onclick=()=>start(false);
$('back').onclick=()=>{
  $('result').close();mode='title';$('status').textContent='Title screen';
  $('intro').hidden=false;$('touch').hidden=true;draw();$('start').focus();
};
$('result').addEventListener('cancel',e=>e.preventDefault());
window.addEventListener('keydown',e=>{
  if(mode!=='play' || !keys[e.code] || e.metaKey || e.ctrlKey || e.altKey) return;
  if(e.target.closest('button,a') && e.code==='Space') return;
  e.preventDefault();if(!e.repeat) input(keys[e.code],e.code,true);
});
window.addEventListener('keyup',e=>{if(keys[e.code]) input(keys[e.code],e.code,false)});
window.addEventListener('blur',resetInput);
document.addEventListener('visibilitychange',resetInput);
for(const button of $('touch').querySelectorAll('button')) {
  button.onpointerdown=e=>{
    e.preventDefault();button.setPointerCapture(e.pointerId);
    input(button.dataset.action,e.pointerId,true);
  };
  button.onlostpointercapture=e=>input(button.dataset.action,e.pointerId,false);
}
function updateTools() {
  const expanded=!!document.fullscreenElement;
  icons(soundOn,expanded);
  $('sound').setAttribute('aria-pressed',String(soundOn));
  for(const [id,label] of [['sound',soundOn?'Mute sound':'Enable sound'],['fullscreen',expanded?'Exit fullscreen':'Enter fullscreen']]) {
    $(id).title=label;$(id).setAttribute('aria-label',label);
  }
}
$('sound').onclick=()=>{
  soundOn=!soundOn;unlockAudio();tone(420,520,.09);updateTools();
  if(mode==='play') field.focus();
};
$('fullscreen').hidden=!document.fullscreenEnabled;
$('fullscreen').onclick=async()=>{
  if(document.fullscreenElement) await document.exitFullscreen();
  else await $('arcade').requestFullscreen();
  if(mode==='play') field.focus();
};
document.addEventListener('fullscreenchange',updateTools);
updateTools();
// Use the shared navigation in the language of this example.
const nav=document.querySelector('.xh-nav');
if(nav) {
  nav.setAttribute('aria-label','Site');nav.querySelector('a').textContent='Home';
  document.querySelector('.xh-handle').setAttribute('aria-label','Toggle navigation');
}
