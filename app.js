const $ = (selector) => document.querySelector(selector);
const STORE = 'lola-v1';
const MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
const CLOUD_URL = 'https://text.pollinations.ai/openai';
const CLOUD_MODEL = 'openai-fast';
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const CLOUD_MIN_MS = 30000;
const MEMORY_MAX = 2000;
const basePrompt = `Eres Lola, la asistente personal y comercial de Ángel. Hablas español de España, con trato directo y llano: vas al grano, sin rodeos. Le llamas Ángel. En temas de trabajo no usas cariños ni florituras. Ayudas a organizar, redactar y preparar tareas comerciales, con respuestas prácticas y números cuando los hay. No inventes datos ni afirmes haber hecho acciones fuera de esta conversación. Nunca des ni inventes precios, tarifas, descuentos ni comisiones: eso lo decide Ángel.
Conoces su negocio: Grupo Sinergys, comercializadora de luz, gas, telefonía y alarmas, con un equipo de comerciales repartidos por territorio. También Torre Sinergys, su edificio de oficinas virtuales. Si te falta un dato concreto del negocio, pregúntalo en vez de inventarlo.
Cuando aprendas un dato duradero sobre Ángel o su trabajo (nombres, empresas, clientes, preferencias, acuerdos), añade al final de tu respuesta, en una línea aparte, una marca así: [[recuerda: el dato en una frase corta]]. No la uses para cosas pasajeras. Si Ángel te pide olvidar algo, no lo vuelvas a guardar.`;
const PROVIDERS = {
  cloud: { ready: 'Nube gratis lista' },
  gemini: { ready: 'Nube Gemini lista' },
  local: { ready: 'Inteligencia local lista' }
};
let engine;
let isLoading = false;
let cloudReady = false;
let lastCloudRequest = 0;
let recognition;
let state = JSON.parse(localStorage.getItem(STORE) || '{"messages":[],"voice":true,"voiceName":"","voiceRate":1,"memory":""}');
if(!PROVIDERS[state.provider]) state.provider = 'cloud';
if(typeof state.geminiKey !== 'string') state.geminiKey = '';
if(typeof state.memory !== 'string') state.memory = '';
if(typeof state.voiceRate !== 'number' || !(state.voiceRate >= 0.7 && state.voiceRate <= 1.3)) state.voiceRate = 1;
const messages = $('#messages'), status = $('#status'), input = $('#messageInput'), send = $('.send');

function save(){ localStorage.setItem(STORE, JSON.stringify(state)); }
function systemPrompt(){
  const memory = state.memory.trim();
  return basePrompt + (memory ? `\n\nLo que recuerdas de Ángel (memoria guardada):\n${memory}` : '');
}
function setStatus(text){ status.textContent = text; }
function resize(){ input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight,120)+'px'; }

function addMessage(role, text, persist = true){
  const wrap = document.createElement('div'); wrap.className = `msg-wrap ${role}`;
  const el = document.createElement('article'); el.className = `message ${role}`; el.textContent = text;
  wrap.append(el);
  messages.append(wrap); messages.scrollTop = messages.scrollHeight;
  if(persist && role !== 'system'){ state.messages.push({role, content:text}); state.messages = state.messages.slice(-24); save(); }
  return el;
}
function renderStored(){ state.messages.forEach(({role,content}) => addMessage(role,content,false)); }

function rememberFact(fact){
  fact = fact.trim().replace(/\s+/g,' ');
  if(!fact) return false;
  if(state.memory.toLowerCase().includes(fact.toLowerCase())) return false;
  state.memory = (state.memory ? state.memory.trim() + '\n' : '') + fact;
  if(state.memory.length > MEMORY_MAX) state.memory = state.memory.slice(-MEMORY_MAX);
  save();
  $('#memoryText').value = state.memory;
  return true;
}
function extractMemory(answer){
  const marks = [...answer.matchAll(/\[\[recuerda:\s*([^\]]+)\]\]/gi)];
  const clean = answer.replace(/\n?\s*\[\[recuerda:[^\]]*\]\]/gi,'').trim();
  const saved = marks.map(m => rememberFact(m[1])).some(Boolean);
  return { clean, saved };
}

function bestSpanishVoice(){
  const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('es'));
  if(!voices.length) return null;
  const score = (v) => {
    const n = v.name.toLowerCase(); let s = 0;
    if(n.includes('natural') || n.includes('neural')) s += 4;
    if(n.includes('google')) s += 3;
    if(n.includes('premium') || n.includes('enhanced')) s += 3;
    if(/(elvira|alvaro|monica|mónica|jorge|paulina|marisol)/.test(n)) s += 2;
    if(v.lang.toLowerCase().startsWith('es-es')) s += 2;
    if(v.localService) s += 1;
    return s;
  };
  return voices.reduce((a,b) => score(b) > score(a) ? b : a);
}
function populateVoices(){
  if(!('speechSynthesis' in window)) return;
  const select = $('#voiceSelect'); const current = state.voiceName;
  const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('es'));
  select.innerHTML = '<option value="">Automática (la mejor voz en español)</option>';
  voices.forEach(v => { const o=document.createElement('option'); o.value=v.name; o.textContent=`${v.name} — ${v.lang}`; if(v.name===current)o.selected=true; select.append(o); });
}
function rateLabel(){
  const r = state.voiceRate;
  $('#voiceRateLabel').textContent = r < 0.9 ? 'Lenta' : r > 1.1 ? 'Rápida' : 'Normal';
}
function speak(text){
  if(!state.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const chosen = state.voiceName ? speechSynthesis.getVoices().find(v=>v.name===state.voiceName) : bestSpanishVoice();
  const sentences = text.match(/[^.!?\n]+[.!?]?\s*/g) || [text];
  for(const part of sentences){
    const clean = part.trim(); if(!clean) continue;
    const u = new SpeechSynthesisUtterance(clean); u.lang='es-ES';
    if(chosen) u.voice = chosen;
    u.rate = state.voiceRate;
    speechSynthesis.speak(u);
  }
}

function updateWelcome(){
  const btn = $('#startModel'), hint = $('#welcomeHint');
  if(state.provider === 'local'){
    btn.textContent = 'Activar inteligencia local';
    hint.textContent = 'Descarga única aproximada: 1 GB. Privada: nada sale de tu dispositivo.';
  }else if(state.provider === 'gemini'){
    btn.textContent = 'Empezar a hablar con Lola';
    hint.textContent = 'Sin descarga. Tus mensajes se envían a Google Gemini: no escribas datos privados. Necesita tu clave gratuita en Ajustes (⚙).';
  }else{
    btn.textContent = 'Empezar a hablar con Lola';
    hint.textContent = 'Sin descarga ni clave. Tus mensajes se envían a un servicio externo gratuito (Pollinations): no escribas datos privados.';
  }
  $('#cloudNote').hidden = state.provider === 'local';
}
function syncProviderUI(){
  $('#providerSelect').value = state.provider;
  $('#geminiKeyBlock').hidden = state.provider !== 'gemini';
  updateWelcome();
}

async function activate(){
  if(state.provider === 'local') return startLocal();
  if(state.provider === 'gemini' && !state.geminiKey){
    addMessage('system','Para usar Gemini pega tu clave gratuita en Ajustes (⚙). Se guarda solo en este navegador.',false);
    setStatus('Falta tu clave de Gemini');
    $('#settingsDialog').showModal();
    return false;
  }
  cloudReady = true;
  if(!$('#welcome').hidden){
    $('#welcome').hidden = true;
    addMessage('assistant','Hola, Ángel. Ya estoy lista. ¿En qué trabajamos?',true);
    speak('Hola, Ángel. Ya estoy lista. ¿En qué trabajamos?');
  }
  setStatus(PROVIDERS[state.provider].ready);
  return true;
}

async function startLocal(){
  if(engine) return true;
  if(location.protocol === 'file:'){
    const text='Lola se ha abierto como un archivo. Para activar su inteligencia debes abrirla desde la dirección web publicada (GitHub Pages). Consulta PUBLICAR-GRATIS.md.';
    addMessage('system',text,false); setStatus('Falta publicar Lola en Internet');
    alert('Para activar a Lola, publícala gratis primero. Abre PUBLICAR-GRATIS.md y sigue los seis pasos.');
    return false;
  }
  if(!navigator.gpu){ addMessage('system','Este navegador no ofrece WebGPU. Prueba Chrome actualizado en el Mac. En iPhone, la disponibilidad depende de Safari y del modelo del dispositivo.',false); setStatus('Inteligencia no compatible aquí'); return false; }
  isLoading=true; $('#startModel').disabled=true; setStatus('Descargando inteligencia local…');
  try{
    const webllm = await import('https://esm.run/@mlc-ai/web-llm');
    engine = await webllm.CreateMLCEngine(MODEL,{initProgressCallback:(report)=>{ setStatus(report.text || 'Preparando inteligencia local…'); }});
    $('#welcome').hidden=true; setStatus(PROVIDERS.local.ready); addMessage('assistant','Hola, Ángel. Ya estoy lista. ¿En qué trabajamos?',true); speak('Hola, Ángel. Ya estoy lista. ¿En qué trabajamos?'); return true;
  }catch(error){ console.error(error); addMessage('system','No se pudo preparar la inteligencia local. Comprueba que tienes internet para la descarga inicial, espacio libre y un navegador compatible con WebGPU.',false); setStatus('No se pudo cargar'); return false;
  }finally{ isLoading=false; $('#startModel').disabled=false; }
}

function geminiContents(){
  const turns = state.messages.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({role:m.role==='assistant'?'model':'user', text:m.content}));
  while(turns.length && turns[0].role !== 'user') turns.shift();
  const merged = [];
  for(const t of turns){
    const last = merged[merged.length-1];
    if(last && last.role === t.role) last.text += '\n\n' + t.text; else merged.push({...t});
  }
  return merged.map(t=>({role:t.role, parts:[{text:t.text}]}));
}

function finishAnswer(bubble, answer, readyText){
  const { clean, saved } = extractMemory(answer);
  bubble.textContent = clean || 'No he podido preparar una respuesta.';
  state.messages.push({role:'assistant',content:clean}); save();
  if(saved) addMessage('system','Anotado en la memoria de Lola. Puedes verla y editarla en Ajustes (⚙).',false);
  speak(clean); setStatus(readyText);
}

async function localSend(bubble){
  const completion=await engine.chat.completions.create({messages:[{role:'system',content:systemPrompt()},...state.messages.filter(m=>m.role==='user'||m.role==='assistant')],temperature:.7,max_tokens:420});
  const answer=completion.choices[0]?.message?.content?.trim() || 'No he podido preparar una respuesta.';
  finishAnswer(bubble, answer, PROVIDERS.local.ready);
}

async function cloudSend(bubble){
  lastCloudRequest = Date.now();
  const resp = await fetch(CLOUD_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:CLOUD_MODEL, messages:[{role:'system',content:systemPrompt()},...state.messages.filter(m=>m.role==='user'||m.role==='assistant')], temperature:.7, max_tokens:600}),
    signal:AbortSignal.timeout(90000)
  });
  if(resp.status === 402 || resp.status === 429){
    const secs = parseInt(resp.headers.get('Retry-After') || '30', 10) || 30;
    bubble.closest('.msg-wrap').remove();
    addMessage('system',`El servicio gratuito está ocupado. Inténtalo de nuevo en unos ${secs} segundos.`,false);
    setStatus('Servicio ocupado, espera un poco');
    return;
  }
  if(!resp.ok) throw new Error('nube ' + resp.status);
  const data = await resp.json();
  const answer = data.choices?.[0]?.message?.content?.trim() || 'No he podido preparar una respuesta.';
  finishAnswer(bubble, answer, PROVIDERS.cloud.ready);
}

async function geminiSend(bubble){
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,{
    method:'POST',
    headers:{'Content-Type':'application/json','x-goog-api-key':state.geminiKey},
    body:JSON.stringify({system_instruction:{parts:[{text:systemPrompt()}]}, contents:geminiContents(), generationConfig:{temperature:.7, maxOutputTokens:600}}),
    signal:AbortSignal.timeout(60000)
  });
  if(resp.status === 400 || resp.status === 403){
    bubble.closest('.msg-wrap').remove();
    addMessage('system','Google no acepta tu clave de Gemini. Revísala en Ajustes (⚙).',false);
    setStatus('Clave de Gemini no válida');
    return;
  }
  if(resp.status === 429){
    bubble.closest('.msg-wrap').remove();
    addMessage('system','Has llegado al límite gratuito de Gemini. Prueba más tarde o cambia de inteligencia en Ajustes (⚙).',false);
    setStatus('Límite de Gemini alcanzado');
    return;
  }
  if(!resp.ok) throw new Error('gemini ' + resp.status);
  const data = await resp.json();
  const answer = (data.candidates?.[0]?.content?.parts || []).map(p=>p.text||'').join('').trim() || 'No he podido preparar una respuesta.';
  finishAnswer(bubble, answer, PROVIDERS.gemini.ready);
}

async function sendMessage(text){
  text=text.trim(); if(!text || isLoading) return;
  if(state.provider === 'cloud'){
    const wait = CLOUD_MIN_MS - (Date.now() - lastCloudRequest);
    if(wait > 0){
      addMessage('system',`Modo gratis: una pregunta cada 30 segundos. Espera ${Math.ceil(wait/1000)} segundos y envíala otra vez.`,false);
      setStatus('Espera unos segundos');
      return;
    }
  }
  addMessage('user',text); input.value=''; resize(); send.disabled=true;
  const ready = state.provider === 'local' ? !!engine : cloudReady;
  if(!ready){ const ok = await activate(); if(!ok){ send.disabled=false; return; } }
  const bubble=addMessage('assistant','Escribiendo…',false); setStatus('Lola está respondiendo…');
  try{
    if(state.provider === 'local') await localSend(bubble);
    else if(state.provider === 'gemini') await geminiSend(bubble);
    else await cloudSend(bubble);
  }catch(error){
    console.error(error);
    const wrap = bubble.closest('.msg-wrap'); if(wrap && wrap.isConnected) wrap.remove();
    addMessage('system','La respuesta no se pudo completar. Comprueba tu conexión e inténtalo de nuevo.',false);
    setStatus('Lista para continuar');
  }finally{ send.disabled=false; }
}

function buildSalesPrompt(){
  const producto = $('#salesProduct').value;
  const target = $('#salesTarget').value;
  const tono = $('#salesTone').value;
  return `Redacta un mensaje comercial de venta de ${producto} dirigido a ${target}, con un tono ${tono}. Reglas: no inventes precios, tarifas, descuentos ni comisiones; no prometas cifras de ahorro concretas; el objetivo es despertar interés y conseguir una conversación o visita; termina con una llamada a la acción clara; máximo 120 palabras; listo para copiar y enviar.`;
}

function setupRecognition(){
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){ $('#micButton').disabled=true; $('#micButton').title='El reconocimiento de voz no está disponible en este navegador'; return; }
  recognition=new Recognition(); recognition.lang='es-ES'; recognition.interimResults=false; recognition.maxAlternatives=1;
  recognition.onstart=()=>$('#micButton').classList.add('listening');
  recognition.onend=()=>$('#micButton').classList.remove('listening');
  recognition.onresult=(e)=>{ input.value=e.results[0][0].transcript; resize(); input.focus(); };
  recognition.onerror=()=>addMessage('system','No se ha podido usar el micrófono. Revisa el permiso del navegador.',false);
}

$('#startModel').addEventListener('click',activate);
$('#chatForm').addEventListener('submit',(e)=>{e.preventDefault();sendMessage(input.value);});
input.addEventListener('input',resize); input.addEventListener('keydown',(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(input.value);}});
$('#micButton').addEventListener('click',()=>recognition && recognition.start());
$('#settingsButton').addEventListener('click',()=>{ syncProviderUI(); $('#settingsDialog').showModal(); });
$('#salesButton').addEventListener('click',()=>{ $('#salesDialog').showModal(); });
$('#salesChip').addEventListener('click',()=>{ $('#salesDialog').showModal(); });
$('#salesGenerate').addEventListener('click',()=>{ $('#salesDialog').close(); sendMessage(buildSalesPrompt()); });
$('#voiceToggle').checked=state.voice; $('#voiceToggle').addEventListener('change',(e)=>{state.voice=e.target.checked;save();});
$('#voiceSelect').addEventListener('change',(e)=>{state.voiceName=e.target.value;save();});
$('#voiceRate').value = state.voiceRate; rateLabel();
$('#voiceRate').addEventListener('input',(e)=>{state.voiceRate=parseFloat(e.target.value);save();rateLabel();});
$('#providerSelect').addEventListener('change',(e)=>{
  state.provider=e.target.value; save(); cloudReady=false;
  $('#welcome').hidden=false;
  syncProviderUI();
  setStatus('Toca el botón para empezar');
});
$('#geminiKey').addEventListener('change',(e)=>{ state.geminiKey=e.target.value.trim(); save(); });
$('#memoryText').value = state.memory;
$('#memoryText').addEventListener('change',(e)=>{ state.memory=e.target.value.slice(0,MEMORY_MAX); save(); });
$('#clearMemory').addEventListener('click',()=>{ state.memory=''; save(); $('#memoryText').value=''; addMessage('system','Memoria de Lola vaciada. La conversación sigue guardada.',false); });
$('#clearConversation').addEventListener('click',()=>{state.messages=[];save();messages.innerHTML='';$('#settingsDialog').close();addMessage('system','Conversación eliminada de este navegador.',false);});
document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>sendMessage(b.dataset.prompt)));
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
$('#geminiKey').value = state.geminiKey;
renderStored(); populateVoices(); if('speechSynthesis' in window) speechSynthesis.onvoiceschanged=populateVoices; setupRecognition(); syncProviderUI();
