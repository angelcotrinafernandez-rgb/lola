const $ = (selector) => document.querySelector(selector);
const STORE = 'lola-v1';
const MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
const systemPrompt = `Eres Lola, una asistente personal y comercial para Ángel. Hablas español de España, con cercanía y claridad. Ayudas a organizar, redactar y preparar tareas comerciales. Da respuestas prácticas. No inventes datos ni afirmes haber hecho acciones fuera de esta conversación.`;
let engine;
let isLoading = false;
let recognition;
let state = JSON.parse(localStorage.getItem(STORE) || '{"messages":[],"voice":true,"voiceName":""}');
const messages = $('#messages'), status = $('#status'), input = $('#messageInput'), send = $('.send');

function save(){ localStorage.setItem(STORE, JSON.stringify(state)); }
function addMessage(role, text, persist = true){
  const el = document.createElement('article'); el.className = `message ${role}`; el.textContent = text; messages.append(el); messages.scrollTop = messages.scrollHeight;
  if(persist && role !== 'system'){ state.messages.push({role, content:text}); state.messages = state.messages.slice(-24); save(); }
  return el;
}
function setStatus(text){ status.textContent = text; }
function renderStored(){ state.messages.forEach(({role,content}) => addMessage(role,content,false)); }
function resize(){ input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight,120)+'px'; }

function populateVoices(){
  if(!('speechSynthesis' in window)) return;
  const select = $('#voiceSelect'); const current = state.voiceName;
  const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('es'));
  select.innerHTML = '<option value="">Automática (español)</option>';
  voices.forEach(v => { const o=document.createElement('option'); o.value=v.name; o.textContent=`${v.name} — ${v.lang}`; if(v.name===current)o.selected=true; select.append(o); });
}
function speak(text){
  if(!state.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang='es-ES';
  const voices=speechSynthesis.getVoices(); u.voice=voices.find(v=>v.name===state.voiceName)||voices.find(v=>v.lang.toLowerCase().startsWith('es-es'))||voices.find(v=>v.lang.toLowerCase().startsWith('es'))||null;
  u.rate=.98; speechSynthesis.speak(u);
}

async function startModel(){
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
    $('#welcome').hidden=true; setStatus('Inteligencia local lista'); addMessage('assistant','Hola, Ángel. Ya estoy lista. ¿En qué trabajamos?',true); speak('Hola, Ángel. Ya estoy lista. ¿En qué trabajamos?'); return true;
  }catch(error){ console.error(error); addMessage('system','No se pudo preparar la inteligencia local. Comprueba que tienes internet para la descarga inicial, espacio libre y un navegador compatible con WebGPU.',false); setStatus('No se pudo cargar'); return false;
  }finally{ isLoading=false; $('#startModel').disabled=false; }
}
async function sendMessage(text){
  text=text.trim(); if(!text || isLoading) return;
  addMessage('user',text); input.value=''; resize(); send.disabled=true;
  if(!engine){ const ready=await startModel(); if(!ready){send.disabled=false;return;} }
  const bubble=addMessage('assistant','Escribiendo…',false); setStatus('Lola está respondiendo…');
  try{
    const completion=await engine.chat.completions.create({messages:[{role:'system',content:systemPrompt},...state.messages.filter(m=>m.role==='user'||m.role==='assistant')],temperature:.7,max_tokens:420});
    const answer=completion.choices[0]?.message?.content?.trim() || 'No he podido preparar una respuesta.';
    bubble.textContent=answer; state.messages.push({role:'assistant',content:answer}); save(); speak(answer); setStatus('Inteligencia local lista');
  }catch(error){ console.error(error); bubble.remove(); addMessage('system','La respuesta no se pudo completar. Puedes intentarlo de nuevo.',false); setStatus('Lista para continuar');
  }finally{send.disabled=false;}
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

$('#startModel').addEventListener('click',startModel);
$('#chatForm').addEventListener('submit',(e)=>{e.preventDefault();sendMessage(input.value);});
input.addEventListener('input',resize); input.addEventListener('keydown',(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(input.value);}});
$('#micButton').addEventListener('click',()=>recognition && recognition.start());
$('#settingsButton').addEventListener('click',()=>$('#settingsDialog').showModal());
$('#voiceToggle').checked=state.voice; $('#voiceToggle').addEventListener('change',(e)=>{state.voice=e.target.checked;save();});
$('#voiceSelect').addEventListener('change',(e)=>{state.voiceName=e.target.value;save();});
$('#clearConversation').addEventListener('click',()=>{state.messages=[];save();messages.innerHTML='';$('#settingsDialog').close();addMessage('system','Conversación eliminada de este navegador.',false);});
document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>sendMessage(b.dataset.prompt)));
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
renderStored(); populateVoices(); if('speechSynthesis' in window) speechSynthesis.onvoiceschanged=populateVoices; setupRecognition();
