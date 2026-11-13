const $ = (s) => document.querySelector(s);
const STORE = 'lola-v1';
const MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
const CLOUD_URL = 'https://text.pollinations.ai/openai';
const CLOUD_MODEL = 'openai-fast';
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const CLOUD_MIN_MS = 30000;
const MEMORY_MAX = 2000;
const basePrompt = `Eres Lola, la asistente personal y comercial de Ángel. Hablas español de España, con trato directo y llano: vas al grano, sin rodeos. Le llamas Ángel. En temas de trabajo no usas cariños ni florituras. Ayudas a organizar, redactar y preparar tareas comerciales, con respuestas prácticas. No inventes datos ni afirmes haber hecho acciones fuera de esta conversación. Nunca des ni inventes precios, tarifas, descuentos ni comisiones: eso lo decide Ángel.
Conoces su negocio: Grupo Sinergys, comercializadora de luz, gas, telefonía y alarmas, con un equipo de comerciales repartidos por territorio. También Torre Sinergys, su edificio de oficinas virtuales. Si te falta un dato concreto del negocio, pregúntalo en vez de inventarlo.
Cuando aprendas un dato duradero sobre Ángel o su trabajo (nombres, empresas, clientes, preferencias, acuerdos), añade al final de tu respuesta, en una línea aparte, una marca así: [[recuerda: el dato en una frase corta]]. No la uses para cosas pasajeras. Si Ángel te pide olvidar algo, no lo vuelvas a guardar.`;
const PROVIDERS = { cloud:{ready:'Nube gratis lista'}, gemini:{ready:'Nube Gemini lista'}, local:{ready:'Inteligencia local lista'} };
let engine, isLoading=false, cloudReady=false, lastCloudRequest=0, recognition;
const defaults = {messages:[],voice:true,voiceName:'',voiceRate:1,memory:'',provider:'cloud',geminiKey:'',tasks:[],notes:[],events:[],contacts:[],opps:[],reminded:[]};
let state = Object.assign({}, defaults, JSON.parse(localStorage.getItem(STORE) || '{}'));
if(!PROVIDERS[state.provider]) state.provider='cloud';
const messages=$('#messages'), status=$('#status'), input=$('#messageInput'), send=$('.send');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const todayStr = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
function save(){ localStorage.setItem(STORE, JSON.stringify(state)); }
function setStatus(t){ status.textContent=t; }
function resize(){ input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,120)+'px'; }
function esc(t){ const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }

function bizSummary(){
  const t = state.tasks.filter(x=>!x.done);
  const today = todayStr();
  const due = t.filter(x=>x.date && x.date<=today);
  const fu = state.opps.filter(o=>o.followUp && o.followUp<=today && o.status!=='ganada' && o.status!=='perdida');
  let s = '';
  if(t.length) s += `\nTareas pendientes: ${t.length}` + (due.length?` (${due.length} para hoy o antes: ${due.slice(0,3).map(x=>x.text).join('; ')})`:'') + '.';
  if(fu.length) s += `\nSeguimientos comerciales que tocan: ${fu.slice(0,3).map(o=>contactName(o.contactId)+' ('+o.product+')').join('; ')}.`;
  return s;
}
function systemPrompt(){
  const memory = state.memory.trim();
  return basePrompt + (memory?`\n\nLo que recuerdas de Ángel (memoria guardada):\n${memory}`:'') + bizSummary();
}

function addMessage(role, text, persist=true){
  const wrap=document.createElement('div'); wrap.className=`msg-wrap ${role}`;
  const el=document.createElement('article'); el.className=`message ${role}`; el.textContent=text;
  wrap.append(el);
  if(role==='assistant' && text){
    const copy=document.createElement('button'); copy.className='msg-copy'; copy.type='button'; copy.title='Copiar o compartir'; copy.textContent='📋';
    copy.addEventListener('click', async ()=>{
      try{
        if(navigator.share){ await navigator.share({text:el.textContent}); }
        else{ await navigator.clipboard.writeText(el.textContent); copy.textContent='✓'; setTimeout(()=>copy.textContent='📋',1500); }
      }catch(e){ /* cancelado por el usuario */ }
    });
    wrap.append(copy);
  }
  messages.append(wrap); messages.scrollTop=messages.scrollHeight;
  if(persist && role!=='system'){ state.messages.push({role,content:text}); state.messages=state.messages.slice(-24); save(); }
  return el;
}
function renderStored(){ state.messages.forEach(({role,content})=>addMessage(role,content,false)); }

function rememberFact(fact){
  fact=fact.trim().replace(/\s+/g,' ');
  if(!fact || state.memory.toLowerCase().includes(fact.toLowerCase())) return false;
  state.memory=(state.memory?state.memory.trim()+'\n':'')+fact;
  if(state.memory.length>MEMORY_MAX) state.memory=state.memory.slice(-MEMORY_MAX);
  save(); $('#memoryText').value=state.memory;
  return true;
}
function extractMemory(answer){
  const marks=[...answer.matchAll(/\[\[recuerda:\s*([^\]]+)\]\]/gi)];
  const clean=answer.replace(/\n?\s*\[\[recuerda:[^\]]*\]\]/gi,'').trim();
  const saved=marks.map(m=>rememberFact(m[1])).some(Boolean);
  return {clean,saved};
}

function bestSpanishVoice(){
  const voices=speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith('es'));
  if(!voices.length) return null;
  const score=(v)=>{ const n=v.name.toLowerCase(); let s=0;
    if(n.includes('natural')||n.includes('neural')) s+=4;
    if(n.includes('google')) s+=3;
    if(n.includes('premium')||n.includes('enhanced')) s+=3;
    if(/(elvira|alvaro|monica|mónica|jorge|paulina|marisol)/.test(n)) s+=2;
    if(v.lang.toLowerCase().startsWith('es-es')) s+=2;
    if(v.localService) s+=1;
    return s; };
  return voices.reduce((a,b)=>score(b)>score(a)?b:a);
}
function populateVoices(){
  if(!('speechSynthesis' in window)) return;
  const select=$('#voiceSelect');
  const voices=speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith('es'));
  select.innerHTML='<option value="">Automática (la mejor voz en español)</option>';
  voices.forEach(v=>{ const o=document.createElement('option'); o.value=v.name; o.textContent=`${v.name} — ${v.lang}`; if(v.name===state.voiceName)o.selected=true; select.append(o); });
}
function rateLabel(){ const r=state.voiceRate; $('#voiceRateLabel').textContent=r<0.9?'Lenta':r>1.1?'Rápida':'Normal'; }
function speak(text){
  if(!state.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const chosen=state.voiceName?speechSynthesis.getVoices().find(v=>v.name===state.voiceName):bestSpanishVoice();
  const parts=text.match(/[^.!?\n]+[.!?]?\s*/g)||[text];
  for(const part of parts){
    const clean=part.trim(); if(!clean) continue;
    const u=new SpeechSynthesisUtterance(clean); u.lang='es-ES';
    if(chosen) u.voice=chosen;
    u.rate=state.voiceRate;
    speechSynthesis.speak(u);
  }
}
setInterval(()=>{ const av=$('#avatar'); if(av) av.classList.toggle('speaking', 'speechSynthesis' in window && speechSynthesis.speaking); }, 400);

function updateWelcome(){
  const btn=$('#startModel'), hint=$('#welcomeHint');
  if(state.provider==='local'){ btn.textContent='Activar inteligencia local'; hint.textContent='Descarga única aproximada: 1 GB. Privada: nada sale de tu dispositivo.'; }
  else if(state.provider==='gemini'){ btn.textContent='Empezar a hablar con Lola'; hint.textContent='Sin descarga. Tus mensajes se envían a Google Gemini: no escribas datos privados. Necesita tu clave gratuita en Ajustes (⚙).'; }
  else{ btn.textContent='Empezar a hablar con Lola'; hint.textContent='Sin descarga ni clave. Tus mensajes se envían a un servicio externo gratuito (Pollinations): no escribas datos privados.'; }
  $('#cloudNote').hidden = state.provider==='local';
}
function syncProviderUI(){ $('#providerSelect').value=state.provider; $('#geminiKeyBlock').hidden=state.provider!=='gemini'; updateWelcome(); }

async function activate(){
  if(state.provider==='local') return startLocal();
  if(state.provider==='gemini' && !state.geminiKey){
    addMessage('system','Para usar Gemini pega tu clave gratuita en Ajustes (⚙). Se guarda solo en este navegador.',false);
    setStatus('Falta tu clave de Gemini'); $('#settingsDialog').showModal(); return false;
  }
  cloudReady=true;
  if(!$('#welcome').hidden){
    $('#welcome').hidden=true;
    addMessage('assistant','Hola, Ángel. Ya estoy lista. ¿En qué trabajamos?',true);
    speak('Hola, Ángel. Ya estoy lista. ¿En qué trabajamos?');
  }
  setStatus(PROVIDERS[state.provider].ready);
  return true;
}
async function startLocal(){
  if(engine) return true;
  if(location.protocol==='file:'){ addMessage('system','Lola se ha abierto como un archivo. Para activar su inteligencia debes abrirla desde la dirección web publicada (GitHub Pages).',false); setStatus('Falta publicar Lola en Internet'); return false; }
  if(!navigator.gpu){ addMessage('system','Este navegador no ofrece WebGPU. Prueba Chrome actualizado en el Mac. En iPhone, la disponibilidad depende de Safari y del modelo del dispositivo.',false); setStatus('Inteligencia no compatible aquí'); return false; }
  isLoading=true; $('#startModel').disabled=true; setStatus('Descargando inteligencia local…');
  try{
    const webllm=await import('https://esm.run/@mlc-ai/web-llm');
    engine=await webllm.CreateMLCEngine(MODEL,{initProgressCallback:(r)=>{ setStatus(r.text||'Preparando inteligencia local…'); }});
    $('#welcome').hidden=true; setStatus(PROVIDERS.local.ready);
    addMessage('assistant','Hola, Ángel. Ya estoy lista. ¿En qué trabajamos?',true);
    speak('Hola, Ángel. Ya estoy lista. ¿En qué trabajamos?'); return true;
  }catch(error){ console.error(error); addMessage('system','No se pudo preparar la inteligencia local. Comprueba que tienes internet para la descarga inicial, espacio libre y un navegador compatible con WebGPU.',false); setStatus('No se pudo cargar'); return false; }
  finally{ isLoading=false; $('#startModel').disabled=false; }
}
function geminiContents(){
  const turns=state.messages.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({role:m.role==='assistant'?'model':'user', text:m.content}));
  while(turns.length && turns[0].role!=='user') turns.shift();
  const merged=[];
  for(const t of turns){ const last=merged[merged.length-1]; if(last && last.role===t.role) last.text+='\n\n'+t.text; else merged.push({...t}); }
  return merged.map(t=>({role:t.role, parts:[{text:t.text}]}));
}
function finishAnswer(bubble, answer, readyText){
  const {clean,saved}=extractMemory(answer);
  bubble.textContent=clean||'No he podido preparar una respuesta.';
  state.messages.push({role:'assistant',content:clean}); save();
  if(saved) addMessage('system','Anotado en la memoria de Lola. Puedes verla y editarla en Ajustes (⚙).',false);
  speak(clean); setStatus(readyText);
}
async function localSend(bubble){
  const c=await engine.chat.completions.create({messages:[{role:'system',content:systemPrompt()},...state.messages.filter(m=>m.role==='user'||m.role==='assistant')],temperature:.7,max_tokens:420});
  finishAnswer(bubble, c.choices[0]?.message?.content?.trim()||'No he podido preparar una respuesta.', PROVIDERS.local.ready);
}
async function cloudSend(bubble){
  lastCloudRequest=Date.now();
  const resp=await fetch(CLOUD_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:CLOUD_MODEL,messages:[{role:'system',content:systemPrompt()},...state.messages.filter(m=>m.role==='user'||m.role==='assistant')],temperature:.7,max_tokens:600}),
    signal:AbortSignal.timeout(90000)});
  if(resp.status===402||resp.status===429){
    const secs=parseInt(resp.headers.get('Retry-After')||'30',10)||30;
    bubble.closest('.msg-wrap').remove();
    addMessage('system',`El servicio gratuito está ocupado. Inténtalo de nuevo en unos ${secs} segundos.`,false);
    setStatus('Servicio ocupado, espera un poco'); return;
  }
  if(!resp.ok) throw new Error('nube '+resp.status);
  const data=await resp.json();
  finishAnswer(bubble, data.choices?.[0]?.message?.content?.trim()||'No he podido preparar una respuesta.', PROVIDERS.cloud.ready);
}
async function geminiSend(bubble){
  const resp=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':state.geminiKey},
    body:JSON.stringify({system_instruction:{parts:[{text:systemPrompt()}]},contents:geminiContents(),generationConfig:{temperature:.7,maxOutputTokens:600}}),
    signal:AbortSignal.timeout(60000)});
  if(resp.status===400||resp.status===403){ bubble.closest('.msg-wrap').remove(); addMessage('system','Google no acepta tu clave de Gemini. Revísala en Ajustes (⚙).',false); setStatus('Clave de Gemini no válida'); return; }
  if(resp.status===429){ bubble.closest('.msg-wrap').remove(); addMessage('system','Has llegado al límite gratuito de Gemini. Prueba más tarde o cambia de inteligencia en Ajustes (⚙).',false); setStatus('Límite de Gemini alcanzado'); return; }
  if(!resp.ok) throw new Error('gemini '+resp.status);
  const data=await resp.json();
  const answer=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim()||'No he podido preparar una respuesta.';
  finishAnswer(bubble, answer, PROVIDERS.gemini.ready);
}
async function sendMessage(text){
  text=text.trim(); if(!text||isLoading) return;
  if(state.provider==='cloud'){
    const wait=CLOUD_MIN_MS-(Date.now()-lastCloudRequest);
    if(wait>0){ addMessage('system',`Modo gratis: una pregunta cada 30 segundos. Espera ${Math.ceil(wait/1000)} segundos y envíala otra vez.`,false); setStatus('Espera unos segundos'); return; }
  }
  addMessage('user',text); input.value=''; resize(); send.disabled=true;
  const ready=state.provider==='local'?!!engine:cloudReady;
  if(!ready){ const ok=await activate(); if(!ok){ send.disabled=false; return; } }
  const bubble=addMessage('assistant','Escribiendo…',false); setStatus('Lola está respondiendo…');
  try{
    if(state.provider==='local') await localSend(bubble);
    else if(state.provider==='gemini') await geminiSend(bubble);
    else await cloudSend(bubble);
  }catch(error){
    console.error(error);
    const wrap=bubble.closest('.msg-wrap'); if(wrap&&wrap.isConnected) wrap.remove();
    addMessage('system','La respuesta no se pudo completar. Comprueba tu conexión e inténtalo de nuevo.',false);
    setStatus('Lista para continuar');
  }finally{ send.disabled=false; }
}
function buildSalesPrompt(){
  const kind=$('#salesKind').value, producto=$('#salesProduct').value, target=$('#salesTarget').value, tono=$('#salesTone').value;
  const base=`dirigido a ${target}, con un tono ${tono}`;
  const rules='Reglas: no inventes precios, tarifas, descuentos ni comisiones; no prometas cifras de ahorro concretas; termina con una llamada a la acción clara; listo para copiar y enviar.';
  if(kind==='seguimiento') return `Redacta un mensaje comercial de seguimiento sobre ${producto} ${base}. Es el segundo contacto: ya hablamos una vez y no ha decidido. ${rules} Máximo 100 palabras.`;
  if(kind==='me lo pienso') return `Redacta una respuesta comercial para cuando un cliente dice "me lo pienso" sobre ${producto} ${base}. Sin presionar: respeta su decisión, resuelve la duda típica y deja la puerta abierta. ${rules} Máximo 100 palabras.`;
  if(kind==='guion') return `Prepara un guion de llamada comercial de ${producto} ${base}: apertura, dos preguntas para conocer su situación, cómo presentar la propuesta sin cifras y cierre para conseguir una cita. ${rules}`;
  if(kind==='propuesta') return `Redacta una propuesta comercial breve por escrito de ${producto} ${base}: qué se ofrece, por qué con Grupo Sinergys y próximos pasos, sin cifras. ${rules} Máximo 150 palabras.`;
  return `Redacta un mensaje comercial de primer contacto de ${producto} ${base}. El objetivo es despertar interés y conseguir una conversación o visita. ${rules} Máximo 120 palabras.`;
}

/* ---- Secciones ---- */
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));
  document.querySelectorAll('.view').forEach(v=>v.hidden=true);
  $('#'+b.dataset.view).hidden=false;
}));

function fmtDate(d){ if(!d) return ''; const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y}`; }
function prioTag(p){ return p==='alta'?'🔴':p==='baja'?'⚪':'🟡'; }

function renderTasks(){
  const list=$('#taskList'); list.innerHTML='';
  const pend=state.tasks.filter(t=>!t.done).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'').localeCompare(b.time||''));
  const done=state.tasks.filter(t=>t.done);
  if(!state.tasks.length){ list.innerHTML='<p class="hint">Sin tareas todavía.</p>'; return; }
  for(const t of pend){
    const row=document.createElement('div'); row.className='card item';
    row.innerHTML=`<button class="check" title="Marcar hecha">○</button><div class="item-body"><strong>${esc(t.text)}</strong><small>${prioTag(t.prio)} ${t.date?fmtDate(t.date):'sin fecha'}${t.time?' · '+t.time:''}</small></div><button class="del" title="Eliminar">×</button>`;
    row.querySelector('.check').addEventListener('click',()=>{ t.done=true; save(); renderTasks(); });
    row.querySelector('.del').addEventListener('click',()=>{ state.tasks=state.tasks.filter(x=>x!==t); save(); renderTasks(); });
    list.append(row);
  }
  if(done.length){
    const h=document.createElement('p'); h.className='hint'; h.textContent=`Hechas (${done.length})`; list.append(h);
    for(const t of done.slice(-5)){
      const row=document.createElement('div'); row.className='card item done';
      row.innerHTML=`<button class="check" title="Reabrir">●</button><div class="item-body"><strong>${esc(t.text)}</strong></div><button class="del" title="Eliminar">×</button>`;
      row.querySelector('.check').addEventListener('click',()=>{ t.done=false; save(); renderTasks(); });
      row.querySelector('.del').addEventListener('click',()=>{ state.tasks=state.tasks.filter(x=>x!==t); save(); renderTasks(); });
      list.append(row);
    }
  }
}
$('#taskForm').addEventListener('submit',e=>{
  e.preventDefault();
  const text=$('#taskText').value.trim(); if(!text) return;
  state.tasks.push({id:uid(),text,date:$('#taskDate').value||'',time:$('#taskTime').value||'',prio:$('#taskPrio').value,done:false});
  save(); renderTasks(); e.target.reset(); setStatus('Tarea añadida');
});

function renderNotes(){
  const list=$('#noteList'); list.innerHTML='';
  if(!state.notes.length){ list.innerHTML='<p class="hint">Sin notas todavía.</p>'; return; }
  for(const n of [...state.notes].reverse()){
    const row=document.createElement('div'); row.className='card item';
    row.innerHTML=`<div class="item-body"><span class="note-text">${esc(n.text)}</span><small>${new Date(n.ts).toLocaleString('es-ES')}</small></div><button class="del" title="Eliminar">×</button>`;
    row.querySelector('.del').addEventListener('click',()=>{ state.notes=state.notes.filter(x=>x!==n); save(); renderNotes(); });
    list.append(row);
  }
}
$('#noteForm').addEventListener('submit',e=>{
  e.preventDefault();
  const text=$('#noteText').value.trim(); if(!text) return;
  state.notes.push({id:uid(),text,ts:Date.now()});
  save(); renderNotes(); e.target.reset(); setStatus('Nota guardada');
});

function icsEscape(s){ return (s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n'); }
function eventIcs(ev){
  const dt=ev.date.replace(/-/g,'');
  const start=ev.time?dt+'T'+ev.time.replace(':','')+'00':dt;
  const prop=ev.time?`DTSTART:${start}`:`DTSTART;VALUE=DATE:${dt}`;
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Lola//ES','BEGIN:VEVENT',`UID:${ev.id}@lola`,prop,`SUMMARY:${icsEscape(ev.title)}`,ev.note?`DESCRIPTION:${icsEscape(ev.note)}`:'','END:VEVENT','END:VCALENDAR'].filter(Boolean).join('\r\n');
}
function downloadFile(name, content, type){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
function renderEvents(){
  const list=$('#eventList'); list.innerHTML='';
  if(!state.events.length){ list.innerHTML='<p class="hint">Agenda vacía.</p>'; return; }
  for(const ev of [...state.events].sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')))){
    const row=document.createElement('div'); row.className='card item';
    row.innerHTML=`<div class="item-body"><strong>${esc(ev.title)}</strong><small>${fmtDate(ev.date)}${ev.time?' · '+ev.time:''}${ev.note?' · '+esc(ev.note):''}</small></div><button class="ics" title="Exportar (.ics)">📅</button><button class="del" title="Eliminar">×</button>`;
    row.querySelector('.ics').addEventListener('click',()=>downloadFile('lola-evento.ics',eventIcs(ev),'text/calendar'));
    row.querySelector('.del').addEventListener('click',()=>{ state.events=state.events.filter(x=>x!==ev); save(); renderEvents(); });
    list.append(row);
  }
}
$('#eventForm').addEventListener('submit',e=>{
  e.preventDefault();
  const title=$('#eventTitle').value.trim(), date=$('#eventDate').value;
  if(!title||!date) return;
  state.events.push({id:uid(),title,date,time:$('#eventTime').value||'',note:$('#eventNote').value.trim()});
  save(); renderEvents(); e.target.reset(); setStatus('Evento añadido');
});
$('#exportAllIcs').addEventListener('click',()=>{
  if(!state.events.length){ setStatus('Agenda vacía'); return; }
  const body=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Lola//ES',...state.events.map(ev=>eventIcs(ev).split('\r\n').slice(3,-1).join('\r\n')),'END:VCALENDAR'].join('\r\n');
  downloadFile('lola-agenda.ics',body,'text/calendar');
});

function contactName(id){ const c=state.contacts.find(x=>x.id===id); return c?c.name:'Sin contacto'; }
function renderContacts(){
  const list=$('#contactList'); list.innerHTML='';
  if(!state.contacts.length){ list.innerHTML='<p class="hint">Sin contactos todavía.</p>'; }
  for(const c of state.contacts){
    const row=document.createElement('div'); row.className='card item';
    row.innerHTML=`<div class="item-body"><strong>${esc(c.name)}</strong><small>${[c.company,c.phone,c.interest].filter(Boolean).map(esc).join(' · ')||'—'}${c.note?'<br>'+esc(c.note):''}</small></div><button class="del" title="Eliminar">×</button>`;
    row.querySelector('.del').addEventListener('click',()=>{ state.contacts=state.contacts.filter(x=>x!==c); state.opps=state.opps.filter(o=>o.contactId!==c.id); save(); renderContacts(); renderOpps(); fillOppContacts(); });
    list.append(row);
  }
}
$('#contactForm').addEventListener('submit',e=>{
  e.preventDefault();
  const name=$('#contactName').value.trim(); if(!name) return;
  state.contacts.push({id:uid(),name,company:$('#contactCompany').value.trim(),phone:$('#contactPhone').value.trim(),interest:$('#contactInterest').value,note:$('#contactNote').value.trim()});
  save(); renderContacts(); fillOppContacts(); e.target.reset(); setStatus('Contacto guardado');
});
function fillOppContacts(){
  const sel=$('#oppContact'); sel.innerHTML='';
  if(!state.contacts.length){ sel.innerHTML='<option value="">Primero guarda un contacto</option>'; return; }
  state.contacts.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.append(o); });
}
function renderOpps(){
  const list=$('#oppList'); list.innerHTML='';
  if(!state.opps.length){ list.innerHTML='<p class="hint">Sin oportunidades registradas.</p>'; return; }
  const today=todayStr();
  for(const o of state.opps){
    const due=o.followUp && o.followUp<=today && o.status!=='ganada' && o.status!=='perdida';
    const row=document.createElement('div'); row.className='card item'+(due?' due':'');
    row.innerHTML=`<div class="item-body"><strong>${esc(contactName(o.contactId))} · ${esc(o.product)}</strong><small><select class="opp-status">
      <option ${o.status==='nueva'?'selected':''}>nueva</option><option ${o.status==='en curso'?'selected':''}>en curso</option><option ${o.status==='ganada'?'selected':''}>ganada</option><option ${o.status==='perdida'?'selected':''}>perdida</option></select>
      ${o.followUp?' · seguimiento '+fmtDate(o.followUp)+(due?' · TOCA HOY':''):''}${o.note?'<br>'+esc(o.note):''}</small></div><button class="del" title="Eliminar">×</button>`;
    row.querySelector('.opp-status').addEventListener('change',e=>{ o.status=e.target.value; save(); renderOpps(); });
    row.querySelector('.del').addEventListener('click',()=>{ state.opps=state.opps.filter(x=>x!==o); save(); renderOpps(); });
    list.append(row);
  }
}
$('#oppForm').addEventListener('submit',e=>{
  e.preventDefault();
  const contactId=$('#oppContact').value; if(!contactId) return;
  state.opps.push({id:uid(),contactId,product:$('#oppProduct').value,status:$('#oppStatus').value,followUp:$('#oppFollowUp').value||'',note:$('#oppNote').value.trim()});
  save(); renderOpps(); e.target.reset(); setStatus('Oportunidad registrada');
});
$('#activitySummary').addEventListener('click',()=>{
  const today=todayStr();
  const pend=state.tasks.filter(t=>!t.done);
  const due=pend.filter(t=>t.date&&t.date<=today);
  const evs=state.events.filter(e=>e.date===today);
  const fu=state.opps.filter(o=>o.followUp&&o.followUp<=today&&o.status!=='ganada'&&o.status!=='perdida');
  const open=state.opps.filter(o=>o.status==='nueva'||o.status==='en curso');
  const lines=['RESUMEN DE ACTIVIDAD · '+fmtDate(today),''];
  lines.push(`Tareas pendientes: ${pend.length}`+(due.length?` — tocan hoy: ${due.map(t=>t.text).join('; ')}`:''));
  lines.push(`Citas de hoy: ${evs.length}`+(evs.length?` — ${evs.map(e=>e.title+(e.time?' '+e.time:'')).join('; ')}`:''));
  lines.push(`Oportunidades abiertas: ${open.length} (ganadas: ${state.opps.filter(o=>o.status==='ganada').length}, perdidas: ${state.opps.filter(o=>o.status==='perdida').length})`);
  lines.push(fu.length?`Seguimientos que tocan: ${fu.map(o=>contactName(o.contactId)+' ('+o.product+')').join('; ')}`:'Sin seguimientos que toquen hoy.');
  const out=$('#activityOut'); out.hidden=false; out.textContent=lines.join('\n');
});

/* ---- Recordatorios locales (con Lola abierta) ---- */
function checkReminders(){
  const now=new Date(); const today=todayStr();
  const hm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const due=[];
  for(const t of state.tasks) if(!t.done&&t.date===today&&t.time&&t.time<=hm&&!state.reminded.includes(t.id)){ due.push('Tarea: '+t.text); state.reminded.push(t.id); }
  for(const e of state.events) if(e.date===today&&e.time&&e.time<=hm&&!state.reminded.includes(e.id)){ due.push('Cita: '+e.title); state.reminded.push(e.id); }
  if(!due.length) return;
  save();
  const text= due.join(' · ');
  addMessage('system','⏰ '+text,false);
  setStatus('Tienes un aviso');
  if('Notification' in window && Notification.permission==='granted') new Notification('Lola',{body:text});
}
setInterval(checkReminders,30000);
$('#notifPermission').addEventListener('click',async()=>{
  if(!('Notification' in window)){ setStatus('Este navegador no tiene avisos'); return; }
  const p=await Notification.requestPermission();
  setStatus(p==='granted'?'Avisos permitidos':'Avisos no permitidos');
});

/* ---- Exportar / importar ---- */
$('#exportData').addEventListener('click',()=>{ downloadFile('lola-datos.json', JSON.stringify(state,null,2), 'application/json'); setStatus('Datos exportados'); });
$('#importData').addEventListener('click',()=>$('#importFile').click());
$('#importFile').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{
    const data=JSON.parse(r.result);
    state=Object.assign({},defaults,data);
    if(!PROVIDERS[state.provider]) state.provider='cloud';
    save(); renderAll(); syncProviderUI();
    addMessage('system','Datos importados en este navegador.',false); setStatus('Datos importados');
  }catch(err){ addMessage('system','Ese archivo no vale. Usa el que descarga "Exportar datos".',false); } };
  r.readAsText(f); e.target.value='';
});

/* ---- Ajustes, reconocimiento y arranque ---- */
function setupRecognition(){
  const R=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!R){ $('#micButton').disabled=true; $('#micButton').title='El reconocimiento de voz no está disponible en este navegador'; return; }
  recognition=new R(); recognition.lang='es-ES'; recognition.interimResults=false; recognition.maxAlternatives=1;
  recognition.onstart=()=>{$('#micButton').classList.add('listening'); $('#avatar').classList.add('listening');};
  recognition.onend=()=>{$('#micButton').classList.remove('listening'); $('#avatar').classList.remove('listening');};
  recognition.onresult=(e)=>{ input.value=e.results[0][0].transcript; resize(); input.focus(); };
  recognition.onerror=()=>addMessage('system','No se ha podido usar el micrófono. Revisa el permiso del navegador.',false);
}
$('#startModel').addEventListener('click',activate);
$('#chatForm').addEventListener('submit',e=>{e.preventDefault();sendMessage(input.value);});
input.addEventListener('input',resize);
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(input.value);}});
$('#micButton').addEventListener('click',()=>recognition&&recognition.start());
$('#settingsButton').addEventListener('click',()=>{ syncProviderUI(); $('#settingsDialog').showModal(); });
$('#salesButton').addEventListener('click',()=>$('#salesDialog').showModal());
$('#salesChip').addEventListener('click',()=>$('#salesDialog').showModal());
$('#salesGenerate').addEventListener('click',()=>{ $('#salesDialog').close(); document.querySelector('[data-view="view-chat"]').click(); sendMessage(buildSalesPrompt()); });
$('#voiceToggle').checked=state.voice;
$('#voiceToggle').addEventListener('change',e=>{state.voice=e.target.checked;save();});
$('#voiceSelect').addEventListener('change',e=>{state.voiceName=e.target.value;save();});
$('#voiceRate').value=state.voiceRate; rateLabel();
$('#voiceRate').addEventListener('input',e=>{state.voiceRate=parseFloat(e.target.value);save();rateLabel();});
$('#providerSelect').addEventListener('change',e=>{ state.provider=e.target.value; save(); cloudReady=false; $('#welcome').hidden=false; syncProviderUI(); setStatus('Toca el botón para empezar'); });
$('#geminiKey').addEventListener('change',e=>{ state.geminiKey=e.target.value.trim(); save(); });
$('#memoryText').value=state.memory;
$('#memoryText').addEventListener('change',e=>{ state.memory=e.target.value.slice(0,MEMORY_MAX); save(); });
$('#clearMemory').addEventListener('click',()=>{ state.memory=''; save(); $('#memoryText').value=''; addMessage('system','Memoria de Lola vaciada. La conversación sigue guardada.',false); });
$('#clearConversation').addEventListener('click',()=>{ state.messages=[]; save(); messages.innerHTML=''; $('#settingsDialog').close(); addMessage('system','Conversación eliminada de este navegador.',false); });
document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>sendMessage(b.dataset.prompt)));
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
$('#geminiKey').value=state.geminiKey;
function renderAll(){ messages.innerHTML=''; renderStored(); renderTasks(); renderNotes(); renderEvents(); renderContacts(); renderOpps(); fillOppContacts(); }
renderAll(); populateVoices();
if('speechSynthesis' in window) speechSynthesis.onvoiceschanged=populateVoices;
setupRecognition(); syncProviderUI(); checkReminders();
setStatus('Lista para empezar');
