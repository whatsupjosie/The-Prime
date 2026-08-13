// Outside (Parking Lot) simple facade scene with a front door back into Josie's
(function(){
  const root = document.getElementById('outside-root');
  if (!root) return;

  const world = document.createElement('div');
  world.style.position = 'absolute';
  world.style.inset = '0';
  root.appendChild(world);

  // Ground (parking lot)
  const ground = document.createElement('div');
  ground.style.position = 'absolute';
  ground.style.left = '0';
  ground.style.right = '0';
  ground.style.bottom = '0';
  ground.style.height = '48%';
  ground.style.background = 'repeating-linear-gradient(0deg, #12151b 0, #12151b 28px, #131820 28px, #131820 56px)';
  world.appendChild(ground);

  // Stripes / stalls
  for (let i=0;i<8;i++){
    const s = document.createElement('div');
    s.style.position='absolute';
    s.style.bottom='20%';
    s.style.left = (10 + i*11) + '%';
    s.style.width='6%'; s.style.height='2px';
    s.style.background='#c8c863'; s.style.opacity='0.8';
    ground.appendChild(s);
  }

  // Building face
  const face = document.createElement('div');
  face.style.position='absolute';
  face.style.left='50%';
  face.style.top='8%';
  face.style.transform='translateX(-50%)';
  face.style.width='72%';
  face.style.height='32%';
  face.style.background='linear-gradient(180deg,#202632 0%, #1a1f2a 100%)';
  face.style.border='1px solid rgba(255,255,255,0.12)';
  face.style.borderRadius='12px';
  face.style.boxShadow='0 8px 28px rgba(0,0,0,0.35)';
  world.appendChild(face);

  // Front door back into Josie's
  const door = document.createElement('a');
  door.href='/pub';
  door.title="Enter Josie's";
  door.style.position='absolute';
  door.style.left='50%';
  door.style.top='34%';
  door.style.transform='translate(-50%,-50%)';
  door.style.width='82px';
  door.style.height='140px';
  door.style.borderRadius='10px';
  door.style.background='radial-gradient(60% 60% at 50% 40%, rgba(255,255,255,0.85), rgba(181,232,255,0.35) 60%, rgba(0,200,255,0.15) 100%)';
  door.style.boxShadow='0 0 22px rgba(0,200,255,0.75), inset 0 0 14px rgba(255,255,255,0.55)';
  door.style.outline='2px solid rgba(255,255,255,0.25)';
  world.appendChild(door);

  const label = document.createElement('div');
  label.textContent = "Enter Josie's";
  label.style.position='absolute';
  label.style.left='50%';
  label.style.top='47%';
  label.style.transform='translate(-50%,-50%)';
  label.style.color='#bfefff';
  label.style.textShadow='0 0 6px rgba(0,200,255,0.6)';
  label.style.font='600 12px system-ui,Segoe UI,Roboto,Helvetica,Arial';
  world.appendChild(label);

  // Sidewalk hint
  const sidewalk = document.createElement('div');
  sidewalk.style.position='absolute';
  sidewalk.style.left='0';
  sidewalk.style.right='0';
  sidewalk.style.top='52%';
  sidewalk.style.height='2%';
  sidewalk.style.background='#777b83';
  sidewalk.style.opacity='0.25';
  world.appendChild(sidewalk);
})();

