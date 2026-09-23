
/* Original procedural 3D origin mesh, software rasterized with depth-sorted faces. */
window.OriginVolume=(()=>{
 const norm=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);},light=norm([-0.6,1,1.5]);
 function create(pet){
  const canvas=document.createElement('canvas');canvas.className='origin-volume';canvas.width=300;canvas.height=330;canvas.setAttribute('aria-hidden','true');pet.prepend(canvas);
  const ctx=canvas.getContext('2d');let reaction={kind:'idle',time:performance.now()},blink=0,wink=false;
  function react(kind){if(kind==='blink'||kind==='wink'){blink=performance.now();wink=kind==='wink';}else reaction={kind,time:performance.now()};}
  function render(now,physics={},motion={}){
   const elapsed=(now-reaction.time)/1600,t=Math.max(0,Math.min(1,elapsed)),pulse=Math.sin(t*Math.PI),kind=reaction.kind;
   let yaw=0,pitch=0,roll=0;
   if(['turn','look','peek','curious'].includes(kind))yaw=pulse*(kind==='turn'?1.05:.55)*(kind==='look'?Math.cos(t*Math.PI*2):1);
   if(['tilt','sway','wiggle'].includes(kind)){roll=Math.sin(t*Math.PI*2)*.09;yaw=Math.sin(t*Math.PI*2)*.25;}
   if(kind==='nod')pitch=Math.sin(t*Math.PI*4)*.13;
   if(kind==='sleepy')pitch=pulse*.14;
   const scaleY=motion.sy||1,hop=-(motion.y||0)/75,triangles=[];
   function rotate(v){let [x,y,z]=v;const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);[x,z]=[x*cy+z*sy,-x*sy+z*cy];[y,z]=[y*cp-z*sp,y*sp+z*cp];return [x*Math.cos(roll)-y*Math.sin(roll), (x*Math.sin(roll)+y*Math.cos(roll))*scaleY+hop,z];}
   function add(a,b,c,color){const av=rotate(a),bv=rotate(b),cv=rotate(c);const u=bv.map((n,i)=>n-av[i]),v=cv.map((n,i)=>n-av[i]);let normal=norm([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]);if(normal[2]<0)normal=normal.map(n=>-n);
     const diffuse=Math.max(0,normal.reduce((n,x,i)=>n+x*light[i],0)),shine=Math.pow(Math.max(0,normal.reduce((n,x,i)=>n+x*norm([-.3,.5,2])[i],0)),32)*.13;
     const rgb=color.map(c=>Math.round(Math.min(255,c*(.8+.2*diffuse)+255*shine)));
     triangles.push({points:[av,bv,cv],depth:(av[2]+bv[2]+cv[2])/3,color:'rgb('+rgb.join(',')+')'});
   }
   function surface(fn,color,rows=36,cols=64){for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=fn(i/rows,j/cols),b=fn((i+1)/rows,j/cols),c=fn((i+1)/rows,(j+1)/cols),d=fn(i/rows,(j+1)/cols),col=typeof color==='function'?color(i/rows):color;add(a,b,c,col);add(a,c,d,col);}}
   surface((u,v)=>{const a=u*Math.PI,b=v*Math.PI*2;return [Math.sin(a)*Math.cos(b),Math.cos(a)*(Math.cos(a)<0?.63:.83),Math.sin(a)*Math.sin(b)*.78];},u=>{const cream=Math.max(0,(u-.48)/.52);return [255,151+88*cream,54+170*cream];});
   const shut=blink&&now-blink<230?1-Math.sin((now-blink)/230*Math.PI)*.94:1;
   [-1,1].forEach(side=>{const eyeY=kind==='sleepy'?1-pulse*.8:kind==='happy'?1-pulse*.65:1;surface((u,v)=>{const a=u*Math.PI,b=v*Math.PI*2;return [side*.34+Math.sin(a)*Math.cos(b)*.085,.19+Math.cos(a)*.16*eyeY*(wink&&side===1?1:shut),.73+Math.sin(a)*Math.sin(b)*.055];},[255,255,250],10,16);});
   const bend=(physics.angle||0)*Math.PI/180;
   const sprout=v=>{const [x,y,z]=v;return [x*Math.cos(bend)-(y-.72)*Math.sin(bend),.72+x*Math.sin(bend)+(y-.72)*Math.cos(bend),z];};
   surface((u,v)=>sprout([-.035+Math.cos(v*Math.PI*2)*.03,.72+u*.4,.015+Math.sin(v*Math.PI*2)*.03]),[59,190,115],8,10);
   [-1,1].forEach(side=>{
    const flex=(side<0?physics.left:physics.right)||0;
    surface((u,v)=>{const width=Math.sin(Math.PI*u)*.18,across=(v-.5)*2;return sprout([-.03+side*u*.46,1.04+u*(side<0?.18:.38)+Math.sin(u*Math.PI)*.08+across*width*.4,.015+across*width+Math.sin(u*Math.PI)*.1+Math.sin(flex*Math.PI/180)*u*.2]);},[74,207,134],12,8);
   });
   ctx.clearRect(0,0,300,330);triangles.sort((a,b)=>a.depth-b.depth);
   for(const face of triangles){ctx.beginPath();face.points.forEach(([x,y,z],i)=>{const p=6/(6-z),px=150+x*112*p,py=225-y*112*p;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.closePath();ctx.fillStyle=face.color;ctx.fill();ctx.strokeStyle=face.color;ctx.lineWidth=.55;ctx.stroke();}
  }
  render(performance.now());return {react,render};
 }
 return {create};
})();

