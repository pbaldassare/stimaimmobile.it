import { apiFetch, publicUrl } from './api-client.js';

const page = document.querySelector('#page');
const home = document.querySelector('#home');
const cityInput = document.querySelector('#home-city');
const navigation = document.querySelector('#nav');
const menu = document.querySelector('.menu-btn');
const money = new Intl.NumberFormat('it-IT', {style:'currency', currency:'EUR'});
const number = new Intl.NumberFormat('it-IT', {maximumFractionDigits:3});
const titles = {home:'Valutazione immobiliare online', metodo:'Metodo', zone:'Zone servite', contatti:'Contatti', valutazione:'Valuta il tuo immobile', risultato:'La tua valutazione'};
let zones = [], zonesPending, zonesLoaded = false;
let questions = [], answers = {}, step = 0, wizard = false, result, checking = false;
let place = {comune:'', zona:'', destinazione:''};
let renderId = 0;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => '<svg class="ico" aria-hidden="true"><use href="#'+name+'"/></svg>';
const normalized = text => String(text || '').trim().toLocaleLowerCase('it');
const same = (a,b) => normalized(a) === normalized(b);
const distinct = values => [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
const route = () => (location.hash.slice(1) || 'home');
const caption = text => '<p class="eyebrow"><span class="rule"></span>'+esc(text)+'</p>';
const options = (values, current, first='Seleziona') => '<option value="">'+esc(first)+'</option>'+values.map(v=>'<option value="'+esc(v)+'"'+(same(v,current)?' selected':'')+'>'+esc(v)+'</option>').join('');
const errorBox = () => '<p class="error" role="alert"></p>';
const field = (id,label,control,full=false) => '<div class="field'+(full?' full':'')+'"><label for="'+esc(id)+'">'+esc(label)+'</label>'+control+'</div>';

async function request(path,body) {
  const response = await apiFetch(path,body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {});
  const data = await response.json().catch(()=>null);
  if (!response.ok || !data) throw Error(typeof data?.error === 'string' ? data.error : 'Il servizio è temporaneamente indisponibile. Riprova tra poco.');
  return data;
}
async function loadZones() {
  if(zonesLoaded) return zones;
  if(!zonesPending) zonesPending = request('/api/zones').then(data=>{
    if(!Array.isArray(data.zones)) throw Error('Non è stato possibile leggere il listino.');
    zones=data.zones; zonesLoaded=true;
    document.querySelector('#cities').innerHTML=options(distinct(zones.map(item=>item.comune)),'','');
    return zones;
  }).finally(()=>{zonesPending=null});
  return zonesPending;
}
function go(name) {
  if(route()===name) render();
  else location.hash=name;
}
function focusPage(){document.querySelector('#main').focus({preventScroll:true});window.scrollTo(0,0)}
function resetEstimate(city=''){
  place={comune:city,zona:'',destinazione:''}; answers={}; wizard=false; step=0; result=null; checking=false;
}
function syncCity(value){
  const canonical=zones.find(item=>same(item.comune,value))?.comune || value.trim();
  if(!same(canonical,place.comune)){place.zona='';place.destinazione=''}
  place.comune=canonical;
}
function updateMenu(open) {
  menu.setAttribute('aria-expanded',String(open));
  menu.setAttribute('aria-label',open?'Chiudi il menu':'Apri il menu');
  navigation.classList.toggle('open', open);
}
menu.addEventListener('click',()=>updateMenu(menu.getAttribute('aria-expanded')!=='true'));
document.addEventListener('keydown',e=>{if(e.key==='Escape' && menu.getAttribute('aria-expanded')==='true'){updateMenu(false);menu.focus()}});
document.querySelector('.skip').addEventListener('click',e=>{e.preventDefault();document.querySelector('#main').focus()});
document.querySelector('.nav-start').addEventListener('click',()=>{if(route()==='risultato')resetEstimate()});
document.querySelector('#home-search').addEventListener('submit',e=>{
  e.preventDefault();const city=cityInput.value.trim();if(!city){cityInput.value='';cityInput.reportValidity();return}
  resetEstimate(city);checking=true;go('valutazione');
});
function contactForm(manual=false) {
  return '<form id="contact-form" class="panel"><h2>'+(manual?'Richiedi una valutazione manuale':'Scrivici')+'</h2><p class="muted">'+(manual?'Indica dove si trova l’immobile e come possiamo ricontattarti.':'Lascia i tuoi recapiti e descrivi la tua richiesta.')+'</p><div class="form-grid">'+
    (manual?field('c-city','Comune','<input id="c-city" class="input" name="comune" required maxlength="120" value="'+esc(place.comune)+'">')+field('c-zone','Zona o quartiere','<input id="c-zone" class="input" name="zona" maxlength="120" value="'+esc(place.zona)+'">')+field('c-use','Destinazione d’uso','<input id="c-use" class="input" name="destinazione" maxlength="120" value="'+esc(place.destinazione)+'" placeholder="Es. abitazione, ufficio">',true):'')+
    field('c-name','Nome','<input id="c-name" class="input" name="name" autocomplete="name" required maxlength="120">')+
    field('c-mail','Email','<input id="c-mail" class="input" type="email" name="email" autocomplete="email" required maxlength="254">')+
    field('c-msg','Messaggio','<textarea id="c-msg" name="message" maxlength="2000" required>'+ (manual?'Vorrei una valutazione manuale del mio immobile.':'')+'</textarea>',true)+
    '</div><p class="muted small">Useremo questi recapiti per rispondere alla tua richiesta.</p>'+errorBox()+'<div class="form-actions"><button class="btn" type="submit">Invia richiesta</button></div></form>';
}
function bindContact(){
  const form=document.querySelector('#contact-form');
  form?.addEventListener('submit',async e=>{
    e.preventDefault();const btn=form.querySelector('button');btn.disabled=true;
    const data=Object.fromEntries(new FormData(form));
    try{
      await request('/api/contact',{comune:'',zona:'',destinazione:'',...data});
      form.innerHTML='<div role="status" tabindex="-1"><h2>Richiesta ricevuta</h2><p>Ti risponderemo all’indirizzo email che hai indicato.</p></div><a class="text-link" href="#home">Torna alla home</a>';form.querySelector('[role=status]').focus();
    }catch(err){form.querySelector('.error').textContent=err.message;btn.disabled=false}
  });
}
function methodPage(){
  const stages=[
    ['pin','La quotazione della zona','Ogni quotazione è associata a comune, zona e destinazione d’uso. La relazione riporta il prezzo di riferimento e la sua provenienza.'],
    ['building','Le caratteristiche della proprietà','La superficie commerciale viene moltiplicata per il prezzo al metro quadro. I correttivi tengono conto delle risposte su edificio, interni, accessori e contesto.'],
    ['report','Il valore e il minimo indicativo','Il risultato comprende il valore centrale e un minimo pari al 90% di quel valore. Il PDF raccoglie i dati dichiarati e il dettaglio del calcolo.']
  ];
  page.innerHTML=caption('Il metodo')+'<h1>Come valutiamo il tuo immobile</h1><p class="page-description">Dalla quotazione locale al valore finale, ogni passaggio si basa su dati che puoi ritrovare nella relazione.</p><div class="method-list">'+stages.map(([i,title,body])=>'<article class="method-item"><span class="icon-tile">'+icon(i)+'</span><div><h2>'+title+'</h2><p>'+body+'</p></div></article>').join('')+'</div><p class="muted">La stima è indicativa e dipende dalla correttezza dei dati inseriti. Per una perizia formale occorre una verifica professionale.</p><a class="btn" href="#valutazione">Inizia una valutazione</a>';
}
function zonesPage(){
  page.innerHTML=caption('Quotazioni locali')+'<h1>Zone servite</h1><p class="page-description">Verifica quali comuni, zone e destinazioni d’uso hanno una quotazione disponibile.</p>';
  if(!zones.length){
    page.insertAdjacentHTML('beforeend','<p class="notice">Il primo listino è in preparazione. Nel frattempo puoi richiedere una valutazione manuale.</p>'+contactForm(true));bindContact();return;
  }
  page.insertAdjacentHTML('beforeend','<section class="panel">'+field('filter','Cerca comune o zona','<input class="input" id="filter" type="search" placeholder="Comune o quartiere">')+'<ul id="zone-list" class="zone-list"></ul><p id="zone-status" aria-live="polite"></p></section><a class="text-link" href="#valutazione">Verifica il tuo immobile</a>');
  const filter=document.querySelector('#filter'),list=document.querySelector('#zone-list'),status=document.querySelector('#zone-status');
  function show(){
    const query=normalized(filter.value);
    const rows=zones.filter(z=>normalized([z.comune,z.zona,z.destinazione].join(' ')).includes(query));
    list.innerHTML=rows.map(z=>'<li><strong>'+esc(z.comune)+'</strong> · '+esc(z.zona)+' · '+esc(z.destinazione)+'</li>').join('');status.textContent=rows.length?'':'Nessuna zona corrispondente alla ricerca.';
  }
  filter.addEventListener('input',show);show();
}
function locationPage(){
  const matches=zones.filter(z=>same(z.comune,place.comune));
  const known=matches.length>0;
  const unavailable=checking && place.comune && !known;
  page.innerHTML=caption('Valutazione immobiliare')+'<h1>Dove si trova l’immobile?</h1><p class="page-description">Individua la quotazione per comune, zona e destinazione d’uso.</p>';
  if(unavailable || !zones.length){
    page.insertAdjacentHTML('beforeend','<p class="notice">'+(!zones.length?'Il primo listino è in preparazione.':'Per '+esc(place.comune)+' il listino non contiene ancora una quotazione.')+' Puoi richiedere una valutazione manuale.</p>'+contactForm(true)+(zones.length?'<button id="another" class="btn secondary">Cerca un altro comune</button>':''));
    bindContact();document.querySelector('#another')?.addEventListener('click',()=>{resetEstimate();locationPage()});return;
  }
  const districtNames=distinct(matches.map(z=>z.zona));
  const uses=distinct(matches.filter(z=>same(z.zona,place.zona)).map(z=>z.destinazione));
  page.insertAdjacentHTML('beforeend','<form id="locate" class="panel"><div class="form-grid">'+
    field('w-city','Comune','<input id="w-city" class="input" list="cities" autocomplete="address-level2" required maxlength="120" value="'+esc(place.comune)+'" placeholder="Inserisci il comune">',true)+
    (known?field('w-zone','Zona','<select id="w-zone" required>'+options(districtNames,place.zona,'Seleziona la zona')+'</select>')+field('w-use','Destinazione d’uso','<select id="w-use" required '+(!place.zona?'disabled':'')+'>'+options(uses,place.destinazione)+'</select>'):'')+'</div>'+errorBox()+'<div class="form-actions"><button class="btn">'+(known?'Descrivi l’immobile':'Verifica copertura')+'</button></div></form>'+(known?'<button id="manual" class="btn secondary">La mia zona o tipologia manca</button>':''));
  const city=document.querySelector('#w-city'),zone=document.querySelector('#w-zone'),use=document.querySelector('#w-use');
  city.addEventListener('change',()=>{
    if(same(city.value,place.comune)||!city.value.trim())return;
    syncCity(city.value);checking=false;
    if(known||zones.some(z=>same(z.comune,place.comune))){
      locationPage();document.querySelector('#w-zone, #locate button')?.focus();
    }
  });
  zone?.addEventListener('change',()=>{place.zona=zone.value;place.destinazione='';locationPage();document.querySelector('#w-use')?.focus()});
  use?.addEventListener('change',()=>{place.destinazione=use.value});
  document.querySelector('#manual')?.addEventListener('click',()=>{page.innerHTML=caption('Valutazione immobiliare')+'<h1>Valutazione manuale</h1>'+contactForm(true);bindContact();focusPage()});
  document.querySelector('#locate').addEventListener('submit',async e=>{
    e.preventDefault();syncCity(city.value);checking=true;
    if(!known || !matches.some(z=>same(z.comune,place.comune)&&same(z.zona,place.zona)&&same(z.destinazione,place.destinazione))){locationPage();return}
    const id=renderId,submit=e.currentTarget.querySelector('button');submit.disabled=true;
    try{
      if(!questions.length){const data=await request('/api/questions');if(!data.questions?.length)throw Error('Il questionario non è disponibile.');questions=data.questions}
      if(id!==renderId)return;wizard=true;step=0;questionPage();focusPage();
    }catch(err){if(id===renderId)document.querySelector('#locate .error').textContent=err.message;submit.disabled=false}
  });
}
function visible(q){return !q.when || q.when.values.some(v=>same(v,answers[q.when.id]))}
function questionPage(){
  const groups=[...new Set(questions.map(q=>q.group))].filter(g=>questions.some(q=>q.group===g&&visible(q)));
  step=Math.min(step,groups.length-1);const group=groups[step];
  page.innerHTML=caption('Valutazione immobiliare')+'<h1>'+esc(group)+'</h1><p class="muted">'+esc([place.comune,place.zona,place.destinazione].join(' · '))+'</p><form id="question-form" class="panel"><div class="progress-wrap"><p>Passaggio '+(step+1)+' di '+groups.length+'</p><progress max="'+groups.length+'" value="'+(step+1)+'" aria-label="Avanzamento del questionario"></progress></div><div class="form-grid" id="question-fields"></div>'+errorBox()+'<div class="form-actions"><button type="button" class="btn secondary" id="back">Indietro</button><button type="submit" class="btn">'+(step===groups.length-1?'Calcola la stima':'Continua')+'</button></div></form>';
  const form=document.querySelector('#question-form'),container=document.querySelector('#question-fields');
  for(const q of questions.filter(q=>q.group===group)){
    const id='q-'+q.id,value=answers[q.id]??'';
    let control=q.type==='select'?'<select>'+options(q.options,value)+'</select>':'<input class="input" type="'+(q.type==='number'?'number':'text')+'" value="'+esc(value)+'">';
    container.insertAdjacentHTML('beforeend',field(id,q.label,control));const row=container.lastElementChild,input=row.querySelector('input,select');
    input.id=id;input.name=q.id;input.required=Boolean(q.required);row.hidden=!visible(q);input.disabled=row.hidden;
    if(q.type==='number'){input.step=q.step??'any';if(q.min!==undefined)input.min=q.min;if(q.max!==undefined)input.max=q.max}
    input.addEventListener(q.type==='select'?'change':'input',()=>{
      answers[q.id]=input.value;
      for(const dependent of questions.filter(item=>item.when)){
        if(!visible(dependent))delete answers[dependent.id];
        const dependentInput=form.elements.namedItem(dependent.id);
        if(dependentInput){dependentInput.disabled=!visible(dependent);dependentInput.closest('.field').hidden=dependentInput.disabled;if(dependentInput.disabled)dependentInput.value=''}
      }
    });
  }
  document.querySelector('#back').addEventListener('click',()=>{if(step){step--;questionPage()}else{wizard=false;locationPage()}focusPage()});
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(step<groups.length-1){step++;questionPage();focusPage();return}
    const id=renderId,status=form.querySelector('.error'),buttons=form.querySelectorAll('button');
    status.textContent='';buttons.forEach(b=>b.disabled=true);
    const inputs=Object.fromEntries(questions.filter(q=>visible(q)&&answers[q.id]!==undefined&&answers[q.id]!=='').map(q=>[q.id,answers[q.id]]));
    try{const next=await request('/api/estimate',{...place,inputs});if(id===renderId){result=next;go('risultato')}}
    catch(err){status.textContent=err.message}finally{buttons.forEach(b=>b.disabled=false)}
  });
}
function resultPage(){
  if(!result){page.innerHTML='<h1>La tua valutazione</h1><p>Inizia dal comune per calcolare una stima.</p><a class="btn" href="#valutazione">Inizia la stima</a>';return}
  const warnings=result.warnings||[];
  page.innerHTML=caption('Esito della valutazione')+'<h1>'+esc(warnings.length?'La tua stima parziale':'Il valore del tuo immobile')+'</h1><p class="page-description">'+esc([place.comune,place.zona,place.destinazione].join(' · '))+'</p><article class="panel"><p class="field-label">'+(warnings.length?'Valore stimato parziale':'Valore stimato')+'</p><p class="result-value">'+money.format(result.value)+'</p>'+
    (warnings.length?'<div class="notice"><strong>Limiti della stima</strong><ul>'+warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul></div>':'')+
    '<dl class="metrics"><div><dt>Minimo indicativo</dt><dd>'+money.format(result.minimum)+'</dd></div><div><dt>Prezzo al m²</dt><dd>'+money.format(result.rate)+'</dd></div><div><dt>Superficie commerciale</dt><dd>'+number.format(result.surface)+' m²</dd></div></dl>'+
    '<h3>Fattori con maggiore incidenza</h3>'+(result.factors?.length?'<ul class="factor-list">'+[...result.factors].sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,5).map(f=>'<li><span>'+esc(f.label)+'</span><strong>'+(f.value>0?'+':'')+number.format(f.value)+'%</strong></li>').join('')+'</ul>':'<p class="muted">Nessun correttivo rilevato.</p>')+
    '<div class="form-actions"><a id="pdf" class="btn">'+icon('download')+'Scarica il PDF</a><a class="btn secondary" href="#contatti">Richiedi un contatto</a></div></article><button id="new-estimate" class="btn secondary">Valuta un altro immobile</button>';
  const pdf=document.querySelector('#pdf');pdf.href=publicUrl(result.pdfUrl);pdf.rel='noopener';pdf.target='_blank';
  document.querySelector('#new-estimate').addEventListener('click',()=>{resetEstimate();go('valutazione')});
}
async function render(){
  const id=++renderId;const name=route();const current=Object.hasOwn(titles,name)?name:'home';
  updateMenu(false);document.title=titles[current]+' · StimaImmobile.it';
  navigation.querySelectorAll('a').forEach(a=>{if(a.hash==='#'+current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  home.hidden=current!=='home';page.hidden=current==='home';focusPage();
  if(current==='home'){loadZones().catch(()=>{});return}
  if(current==='metodo'){methodPage();return}
  if(current==='contatti'){page.innerHTML=caption('Contatti')+'<h1>Come possiamo aiutarti?</h1>'+contactForm();bindContact();return}
  if(current==='risultato'){resultPage();return}
  page.innerHTML='<p role="status">Verifica delle quotazioni in corso…</p>';
  try{
    await loadZones();if(id!==renderId)return;
    if(current==='zone')zonesPage();else if(wizard)questionPage();else locationPage();
  }catch(err){if(id!==renderId)return;page.innerHTML=caption('Valutazione immobiliare')+'<h1>Listino non disponibile</h1><p class="error" role="alert">'+esc(err.message)+'</p><button id="retry" class="btn">Riprova</button>'+contactForm(true);document.querySelector('#retry').addEventListener('click',render);bindContact()}
}
window.addEventListener('hashchange',render);
render();
