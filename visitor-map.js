(() => {
  const host=document.getElementById('routeView');
  const toolbar=document.createElement('div');
  toolbar.innerHTML='<button id="showVisitorMap">查看地图</button><button id="hideVisitorMap" hidden>返回摊位一览</button>';
  host.prepend(toolbar);
  const section=document.createElement('section');
  section.hidden=true;
  section.innerHTML='<label>场馆 <select id="visitorHall"><option value="壹">1号馆</option><option value="贰">2号馆</option><option value="叁">3号馆（含创作摊）</option><option value="肆">4号馆</option><option value="玖">9号企业馆</option></select></label><input id="mapSearch" placeholder="摊位号、名称、街道"><select id="mapResults" aria-label="地图搜索结果"></select><select id="mapTargets" aria-label="个人标记筛选"><option value="all">我的全部目标</option><option value="star">仅重点星标</option><option value="pending">未逛目标</option><option value="return">需要返场</option><option value="none">隐藏个人标记</option></select><button id="mapFit">适应地图</button><button id="mapZoomIn">＋</button><button id="mapZoomOut">－</button><p id="mapMessage" role="status"></p><svg id="visitorCanvas" style="width:100%;height:65vh;touch-action:none;background:#f6f0e7" aria-label="摊位地图"></svg><div id="mapCard"></div>';
  toolbar.after(section);
  const listElements=[...host.children].filter(element=>element!==toolbar&&element!==section);
  function setMapVisible(visible){
    section.hidden=!visible;
    listElements.forEach(element=>element.hidden=visible);
    document.getElementById('hideVisitorMap').hidden=!visible;
  }
  const el=id=>document.getElementById(id);
  let rows=[],annotations={},loaded=false,view,selected,drag;
  const views={},dimensions={},hall=()=>el('visitorHall').value;
  async function prepare(){
    if(loaded)return;
    const [data,notes]=await Promise.all([fetch('data/cptf-map-7166.json').then(r=>r.json()),fetch('maps/annotations.json').then(r=>r.json())]);
    annotations=notes.halls;
    const otherNotes=await Promise.all(['hall2','hall3','hall4'].map(name=>fetch('maps/'+name+'.json').then(response=>response.json())));
    otherNotes.forEach(note=>Object.assign(annotations,note.halls));
    const names=new Map(data.bindings.map(r=>[r[0],Object.fromEntries(data.bindingColumns.map((k,i)=>[k,r[i]]))]));
    rows=data.positions.map((r,i)=>({...names.get(r[0]),...Object.fromEntries(data.positionColumns.map((k,j)=>[k,r[j]])),id:String(i)}));
    loaded=true;
  }
  function rectangle(r){
    const c=annotations[r.hall],t=c?.transform||[1,1,0,0];
    return c?.fixes[r.id]?.rect||[r.x*t[0]+t[2],r.y*t[1]+t[3],r.width*t[0],r.height*t[1]];
  }
  async function show(code){
    try{
      await prepare();
      const match=code&&rows.find(r=>boothKey(r.boothCode)===boothKey(code));
      if(code&&!match){toast('地图中没有精确匹配的摊位');return;}
      setMapVisible(true);
      el('hideVisitorMap').hidden=false;
      if(match){selected=match;el('visitorHall').value=match.hall;}
      const h=hall(),image=new Image();
      image.onload=()=>{
        if(h!==hall())return;
        dimensions[h]=[image.naturalWidth,image.naturalHeight];
        view=views[h]||[0,0,...dimensions[h]];
        if(match){const [x,y,w,ht]=rectangle(match),span=image.naturalWidth/4;view=[x+w/2-span/2,y+ht/2-span/2,span,span];}
        search();draw();
      };
      image.src='maps/'+({壹:1,贰:2,叁:3,肆:4,玖:9}[h])+'.png';
    }catch(error){el('mapMessage').textContent='地图加载失败，请重试';console.error(error);}
  }
  function draw(){
    if(section.hidden||!view)return;
    views[hall()]=view;
    const known=new Set(allKnownBoothRows().map(r=>boothKey(r.booth))),filter=el('mapTargets').value;
    const [w,h]=dimensions[hall()];
    el('visitorCanvas').setAttribute('viewBox',view.join(' '));
    el('visitorCanvas').innerHTML=`<image href="maps/${({壹:1,贰:2,叁:3,肆:4,玖:9}[hall()])}.png" width="${w}" height="${h}"/>`+rows.filter(r=>r.hall===hall()).map(r=>{
      const key=boothKey(r.boothCode),status=state.boothStates[r.boothCode]||'pending',star=isStarred(r.boothCode);
      const target=known.has(key)&&filter!=='none'&&(filter==='all'||filter==='star'&&star||filter==='pending'&&status!=='visited'||filter==='return'&&status==='return');
      const active=selected===r,[x,y,width,height]=rectangle(r);
      return `<rect data-map-id="${r.id}" x="${x}" y="${y}" width="${width}" height="${height}" fill="${active?'#e38a21':target?'#248c83':'transparent'}" fill-opacity=".35" stroke="${active?'#c05015':target?'#248c83':'transparent'}" stroke-width="2" vector-effect="non-scaling-stroke"/>`+(target?`<text x="${x}" y="${y}" font-size="15" pointer-events="none">${star?'★':status==='visited'?'✓':status==='return'?'↩':'●'}</text>`:'');
    }).join('');
    if(selected){
      const r=selected,related=allKnownBoothRows().find(v=>boothKey(v.booth)===boothKey(r.boothCode));
      el('mapCard').innerHTML=`<h3>${esc(r.boothCode)} · ${esc(r.shopName||r.circleName||r.name||'未命名')}</h3><p>${esc(r.businessSectionName||'')} · 心愿制品 ${related?.items.length||0} 件 · 备忘 ${related?.memos.length||0} 条</p><button id="mapDetails">查看完整摊位详情</button><button id="mapExpense">记一笔</button>`;
      el('mapDetails').onclick=()=>openBooth(r.boothCode);
      el('mapExpense').onclick=()=>openQuickPurchase(r.boothCode);
    }
  }
  function search(){
    const q=el('mapSearch').value.trim().toLowerCase();
    el('mapResults').innerHTML='<option value="">选择搜索结果</option>'+rows.filter(r=>[r.boothCode,r.shopName,r.circleName,r.businessSectionName].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,80).map(r=>`<option value="${r.id}">${esc(r.boothCode)} · ${esc(r.shopName||r.circleName||r.name)} · ${esc(r.businessSectionName)}</option>`).join('');
  }
  function zoom(f){if(!view)return;const [x,y,w,h]=view;view=[x+w*(1-f)/2,y+h*(1-f)/2,w*f,h*f];draw();}
  el('showVisitorMap').onclick=()=>show();
  el('hideVisitorMap').onclick=()=>setMapVisible(false);
  el('visitorHall').onchange=()=>{selected=null;show();};
  el('mapSearch').oninput=search;
  el('mapResults').onchange=()=>{const r=rows.find(r=>r.id===el('mapResults').value);if(r)show(r.boothCode);};
  el('mapTargets').onchange=draw;
  el('mapFit').onclick=()=>{view=[0,0,...dimensions[hall()]];draw();};
  el('mapZoomIn').onclick=()=>zoom(.75);el('mapZoomOut').onclick=()=>zoom(1.33);
  const canvas=el('visitorCanvas');
  canvas.onwheel=e=>{e.preventDefault();zoom(e.deltaY>0?1.15:.87);};
  const pointers=new Map();
  let pinchDistance=0;
  canvas.onpointerdown=e=>{
    if(!view)return;
    pointers.set(e.pointerId,[e.clientX,e.clientY]);
    drag={x:e.clientX,y:e.clientY,view:[...view],id:e.target.dataset.mapId};
    if(pointers.size===2){const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a[0]-b[0],a[1]-b[1]);drag=null;}
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove=e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(pointers.size===2){
      const [a,b]=[...pointers.values()],distance=Math.hypot(a[0]-b[0],a[1]-b[1]);
      if(distance&&pinchDistance)zoom(pinchDistance/distance);
      pinchDistance=distance;return;
    }
    if(!drag)return;
    const scale=canvas.getScreenCTM().a;
    view=[drag.view[0]-(e.clientX-drag.x)/scale,drag.view[1]-(e.clientY-drag.y)/scale,...drag.view.slice(2)];draw();
  };
  canvas.onpointerup=e=>{
    if(drag&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5){selected=rows.find(r=>r.id===drag.id);draw();}
    pointers.delete(e.pointerId);drag=null;pinchDistance=0;
  };
  canvas.onpointercancel=e=>{pointers.delete(e.pointerId);drag=null;pinchDistance=0;};
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',draw));
  for(const id of ['dialogContent','boothDialogContent']){
    const container=el(id);if(!container)continue;
    new MutationObserver(()=>{
      if(container.querySelector('[data-locate-map]'))return;
      const link=container.querySelector('#dialogOpenBooth');
      const title=container.querySelector('h2')?.textContent||'';
      const code=link?.textContent.match(/查看 (.*?) 摊位/)?.[1]||title.match(/(?:创|壹|贰|叁|肆)[A-Z]?\d+/)?.[0];
      if(!code)return;
      const button=document.createElement('button');button.dataset.locateMap='1';button.textContent='在地图查看';
      button.onclick=()=>{container.closest('dialog')?.close();activateView('route');show(code);};
      container.append(button);
    }).observe(container,{childList:true});
  }
  document.querySelector('[data-view="route"]').addEventListener('click',draw);
})();
