import { apiFetch, apiJson, getSession, setSession, clearSession } from './api-client.js';

const page = document.querySelector('#page');
const home = document.querySelector('#home');
const navigation = document.querySelector('#nav');
const menu = document.querySelector('.menu-btn');
const money = new Intl.NumberFormat('it-IT', {style:'currency', currency:'EUR'});
const number = new Intl.NumberFormat('it-IT', {maximumFractionDigits:3});
const titles = {home:'Il valore reale in un click', metodo:'Metodo', zone:'Zone servite', contatti:'Contatti', valutazione:'Valuta il tuo immobile', ordine:'Riepilogo e pagamento'};
let zones = [], comuni = [], zonesByCity = new Map(), allZonesLoaded = false, listino = null, comuniPending;
let questions = [], answers = {}, step = 0, wizard = false, quote = null, orderInputs = null, price = 49, checking = false;
let place = {comune:'', zona:'', destinazione:''};
let recapiti = {name:'', email:''};
let renderId = 0;
titles.indirizzo = 'Cerca per indirizzo';
titles.comune = 'Inserisci il comune';
let cancelSearch;

const EXAMPLE_PLACE = {comune:'Brescia', zona:'Centro storico', destinazione:'Direzionale'};
const EXAMPLE_ANSWERS = {surface:'65', floor:'rialzato', year:'1900'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => '<svg class="ico" aria-hidden="true"><use href="#'+name+'"/></svg>';
const normalized = text => String(text || '').trim().toLocaleLowerCase('it');
const zoneKey = text => normalized(text) === 'cenro storico' ? 'centro storico' : normalized(text);
const same = (a,b) => normalized(a) === normalized(b);
const sameZone = (a,b) => zoneKey(a) === zoneKey(b);
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
function fillCities() {
  const list = document.querySelector('#cities');
  if (list) list.innerHTML = options(comuni, '', '');
}
function rememberCity(rows) {
  if (!rows.length) return;
  const key = normalized(rows[0].comune);
  zonesByCity.set(key, rows);
  if (!comuni.some(name => same(name, rows[0].comune))) {
    comuni = distinct([...comuni, rows[0].comune]);
    fillCities();
  }
}
async function loadZones() {
  if (comuni.length || allZonesLoaded) return zones;
  if (!comuniPending) {
    comuniPending = (async () => {
      const data = await request('/api/zones');
      listino = data.listino || listino;
      if (Array.isArray(data.zones) && data.zones.some(row => row.zona)) {
        allZonesLoaded = true;
        zones = data.zones;
        comuni = distinct(zones.map(item => item.comune));
      } else if (Array.isArray(data.comuni) && data.comuni.length) {
        comuni = data.comuni;
        zones = [];
      } else if (Array.isArray(data.zones)) {
        allZonesLoaded = true;
        zones = data.zones;
        comuni = distinct(zones.map(item => item.comune));
      } else throw Error('Non è stato possibile leggere il listino.');
      fillCities();
      return zones;
    })().finally(() => { comuniPending = null; });
  }
  return comuniPending;
}
async function zonesFor(city) {
  if (!city) return [];
  if (allZonesLoaded) return zones.filter(row => same(row.comune, city));
  const key = normalized(city);
  if (zonesByCity.has(key)) return zonesByCity.get(key);
  const data = await request('/api/zones?comune=' + encodeURIComponent(city));
  const rows = Array.isArray(data.zones) ? data.zones : [];
  if (rows.length) rememberCity(rows);
  else zonesByCity.set(key, []);
  return rows;
}
function go(name) {
  if(route()===name) render();
  else location.hash=name;
}
function focusPage(){document.querySelector('#main').focus({preventScroll:true});window.scrollTo(0,0)}
function resetEstimate(city=''){
  place={comune:city,zona:'',destinazione:''}; recapiti={name:'',email:''}; answers={}; wizard=false; step=0; quote=null; orderInputs=null; checking=false;
}
function startExcelExample(){
  resetEstimate(EXAMPLE_PLACE.comune);
  place.zona=EXAMPLE_PLACE.zona;
  place.destinazione=EXAMPLE_PLACE.destinazione;
  answers={...EXAMPLE_ANSWERS};
  checking=true;
  go('valutazione');
}
function syncCity(value){
  const canonical=comuni.find(name=>same(name,value)) || zones.find(item=>same(item.comune,value))?.comune || value.trim();
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
document.querySelector('.nav-start').addEventListener('click',()=>{if(route()==='ordine')resetEstimate()});
function contactForm(manual=false) {
  return '<form id="contact-form" class="panel"><h2>'+(manual?'Richiedi una valutazione manuale':'Scrivici')+'</h2><p class="muted">'+(manual?'Indica dove si trova l’immobile e come possiamo ricontattarti.':'Lascia i tuoi recapiti e descrivi la tua richiesta.')+'</p><div class="form-grid">'+
    (manual?field('c-city','Comune','<input id="c-city" class="input" name="comune" required maxlength="120" value="'+esc(place.comune)+'">')+field('c-zone','Zona o quartiere','<input id="c-zone" class="input" name="zona" maxlength="120" value="'+esc(place.zona)+'">')+field('c-use','Destinazione d’uso','<input id="c-use" class="input" name="destinazione" maxlength="120" value="'+esc(place.destinazione)+'" placeholder="Es. abitazione, ufficio">',true):'')+
    field('c-name','Nome','<input id="c-name" class="input" name="name" autocomplete="name" required maxlength="120">')+
    field('c-mail','Email','<input id="c-mail" class="input" type="email" name="email" autocomplete="email" required maxlength="254">')+
    field('c-msg','Messaggio','<textarea id="c-msg" name="message" maxlength="2000" required>'+ (manual?'Vorrei una valutazione manuale del mio immobile.':'')+'</textarea>',true)+
    '<input type="hidden" name="kind" value="'+(manual?'coverage':'contact')+'">'+
    '</div><p class="muted small">Useremo questi recapiti per ricontattarti. Ti invieremo anche una conferma all’email indicata.</p>'+errorBox()+'<div class="form-actions"><button class="btn" type="submit">Invia richiesta</button></div></form>';
}
function bindContact(){
  const form=document.querySelector('#contact-form');
  form?.addEventListener('submit',async e=>{
    e.preventDefault();const btn=form.querySelector('button');btn.disabled=true;
    const data=Object.fromEntries(new FormData(form));
    try{
      await request('/api/contact',{comune:'',zona:'',destinazione:'',...data});
      form.innerHTML='<div role="status" tabindex="-1"><h2>Richiesta ricevuta</h2><p>Ti abbiamo inviato una conferma all’indirizzo indicato. Ti ricontatteremo.</p></div><a class="text-link" href="#home">Torna alla home</a>';form.querySelector('[role=status]').focus();
    }catch(err){form.querySelector('.error').textContent=err.message;btn.disabled=false}
  });
}
function methodPage(){
  const stages=[
    ['pin','La quotazione della zona','Ogni quotazione è associata a comune, zona e destinazione d’uso. La relazione riporta il prezzo di riferimento e la sua provenienza.'],
    ['building','Le caratteristiche della proprietà','La superficie commerciale viene moltiplicata per la quotazione OMI della zona (€/m²). Ogni risposta del questionario è un plus o minus percentuale su quella base.'],
    ['report','Il valore e il minimo indicativo','Il risultato comprende il valore centrale e un minimo pari al 90% di quel valore. Il PDF raccoglie i dati dichiarati e il dettaglio del calcolo.']
  ];
  page.innerHTML=caption('Il metodo')+'<h1>Come valutiamo il tuo immobile</h1><p class="page-description">Dalla quotazione locale al valore finale, ogni passaggio si basa su dati che puoi ritrovare nella relazione.</p><div class="method-list">'+stages.map(([i,title,body])=>'<article class="method-item"><span class="icon-tile">'+icon(i)+'</span><div><h2>'+title+'</h2><p>'+body+'</p></div></article>').join('')+'</div><p class="muted">La stima è indicativa e dipende dalla correttezza dei dati inseriti. Per una perizia formale occorre una verifica professionale.</p><a class="btn" href="#valutazione">Inizia una valutazione</a>';
}
function zonesPage(){
  const covered = allZonesLoaded ? zones.length : (listino?.quotes || comuni.length);
  page.innerHTML=caption('Quotazioni locali')+'<h1>Zone servite</h1><p class="page-description">Verifica quali comuni, zone e destinazioni d’uso hanno una quotazione disponibile.</p>';
  if(!covered){
    page.insertAdjacentHTML('beforeend','<p class="notice">Il primo listino è in preparazione. Nel frattempo puoi richiedere una valutazione manuale.</p>'+contactForm(true));bindContact();return;
  }
  const source = listino?.omi
    ? '<p class="muted">Listino territoriale da '+esc(listino.fonte)+' ('+esc(listino.license)+'), con l’esempio Excel di Brescia conservato. ondata redistribuisce i CSV; il download ufficiale è Forniture OMI dell’Agenzia delle Entrate.</p>'
    : '';
  page.insertAdjacentHTML('beforeend',source+'<section class="panel">'+field('filter','Cerca comune o zona','<input class="input" id="filter" type="search" placeholder="Comune o quartiere">')+'<ul id="zone-list" class="zone-list"></ul><p id="zone-status" aria-live="polite"></p></section><a class="text-link" href="#valutazione">Verifica il tuo immobile</a>');
  const filter=document.querySelector('#filter'),list=document.querySelector('#zone-list'),status=document.querySelector('#zone-status');
  let timer, revision=0;
  async function show(){
    const query=filter.value.trim();
    const current=++revision;
    if(query.length<2){
      list.replaceChildren();
      status.textContent=(listino?.comuni||comuni.length)+' comuni in listino. Scrivi almeno due caratteri per vedere le zone.';
      return;
    }
    status.textContent='Ricerca in corso…';
    try{
      const rows = allZonesLoaded
        ? zones.filter(z=>normalized([z.comune,z.zona,z.destinazione].join(' ')).includes(normalized(query))).slice(0,250)
        : (await request('/api/zones?q='+encodeURIComponent(query))).zones || [];
      if(current!==revision) return;
      list.innerHTML=rows.map(z=>'<li><strong>'+esc(z.comune)+'</strong> · '+esc(z.zona)+' · '+esc(z.destinazione)+(z.fonte?' <span class="muted">('+esc(z.fonte)+')</span>':'')+'</li>').join('');
      status.textContent=rows.length?'':'Nessuna zona corrispondente alla ricerca.';
    }catch(err){if(current===revision) status.textContent=err.message}
  }
  filter.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(show,280)});
  show();
}
function addressPage(){
  page.innerHTML = caption('Localizzazione') + '<h1>Trova il tuo immobile</h1><div class="panel" id="address-form"></div>';
  mountAddressSearch(page.querySelector('#address-form'));
}
function mountAddressSearch(container){
  const fieldId = container.id + '-query';
  container.innerHTML = '<label for="'+fieldId+'">Via, numero civico e comune</label><input class="input" id="'+fieldId+'" maxlength="220" autocomplete="off" placeholder="Es. Piazza della Loggia 1, Brescia"><div class="address-results" aria-live="polite"></div><p class="small muted">Suggerimenti automatici di Google Maps. <a href="https://policies.google.com/privacy?hl=it">Privacy</a> · <a href="https://maps.google.com/help/terms_maps/">Termini</a></p><a href="#comune" class="text-link">Inserisci il comune a mano</a>';
  const input = container.querySelector('input');
  const output = container.querySelector('.address-results');
  let timer, revision = 0;
  cancelSearch = () => { clearTimeout(timer); revision++; };
  input.addEventListener('input', () => {
    cancelSearch();
    output.replaceChildren();
    const address = input.value.trim();
    if (address.length < 5) return;
    const current = revision;
    timer = setTimeout(() => search(address, current), 650);
  });
  async function search(address, current) {
    output.textContent = 'Ricerca in corso…';
    try {
      const {addresses} = await request('/api/address', {address});
      if (current !== revision) return;
      output.replaceChildren();
      if (!addresses.length) {
        output.textContent = 'Nessun indirizzo trovato. Aggiungi il comune o correggi il numero civico.';
        return;
      }
      const box = document.createElement('section');
      box.className = 'panel address-options';
      const heading = document.createElement('h2');
      heading.textContent = 'Conferma l’indirizzo';
      box.append(heading);
      for (const candidate of addresses) {
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'btn secondary';
        choose.textContent = candidate.label;
        choose.addEventListener('click', async () => {
          try {
            await loadZones();
            if (current !== revision) return;
            const local = await zonesFor(candidate.comune);
            if (current !== revision) return;
            resetEstimate(local[0]?.comune || candidate.comune);
            place.address = candidate.label;
            zones = allZonesLoaded ? zones : local;
            const matches = distinct(local.map(row => row.zona).filter(zone => candidate.districts.some(d => sameZone(d, zone))));
            if (matches.length === 1) place.zona = matches[0];
            checking = true;
            go('valutazione');
          } catch (error) { output.textContent = error.message; }
        });
        box.append(choose);
      }
      const attribution = document.createElement('span');
      attribution.className = 'maps-attribution';
      attribution.textContent = 'Google Maps';
      box.append(attribution);
      output.append(box);
    } catch (error) { if (current === revision) output.textContent = error.message; }
  }
}
function locationPage(){
  const matches=zones.filter(z=>same(z.comune,place.comune));
  const known=matches.length>0;
  const covered=allZonesLoaded ? zones.length : comuni.length;
  const unavailable=checking && place.comune && !known;
  page.innerHTML=caption('Valutazione immobiliare')+'<h1>Dove si trova l’immobile?</h1><p class="page-description">Individua la quotazione per comune, zona e destinazione d’uso. Esempio già in listino: Brescia · Centro storico · Direzionale (65 m²).</p>';
  page.insertAdjacentHTML('beforeend','<p><a class="text-link" href="#indirizzo">Trova comune e zona dall’indirizzo</a> · <button type="button" class="text-link" id="use-brescia">Usa l’esempio Brescia</button></p>');
  document.querySelector('#use-brescia')?.addEventListener('click', startExcelExample);
  if(unavailable || !covered){
    page.insertAdjacentHTML('beforeend','<p class="notice">'+(!covered?'Il primo listino è in preparazione.':'Per '+esc(place.comune)+' il listino non contiene ancora una quotazione.')+' Puoi richiedere una valutazione manuale.</p>'+contactForm(true)+(covered?'<button id="another" class="btn secondary">Cerca un altro comune</button>':''));
    bindContact();document.querySelector('#another')?.addEventListener('click',()=>{resetEstimate();locationPage()});return;
  }
  const districtNames=distinct(matches.map(z=>z.zona));
  const uses=distinct(matches.filter(z=>sameZone(z.zona,place.zona)).map(z=>z.destinazione));
  page.insertAdjacentHTML('beforeend','<form id="locate" class="panel"><div class="form-grid">'+
    field('w-city','Comune','<input id="w-city" class="input" list="cities" autocomplete="address-level2" required maxlength="120" value="'+esc(place.comune)+'" placeholder="Inserisci il comune">',true)+
    (known?field('w-zone','Zona','<select id="w-zone" required>'+options(districtNames,place.zona,'Seleziona la zona')+'</select>')+field('w-use','Destinazione d’uso','<select id="w-use" required '+(!place.zona?'disabled':'')+'>'+options(uses,place.destinazione)+'</select>'):'')+'</div>'+errorBox()+'<div class="form-actions"><button class="btn">'+(known?'Descrivi l’immobile':'Verifica copertura')+'</button></div></form>'+(known?'<button id="manual" class="btn secondary">La mia zona o tipologia manca</button>':''));
  const city=document.querySelector('#w-city'),zone=document.querySelector('#w-zone'),use=document.querySelector('#w-use');
  city.addEventListener('change',()=>{
    if(same(city.value,place.comune)||!city.value.trim())return;
    syncCity(city.value);checking=false;
    if(known||comuni.some(name=>same(name,place.comune))||zones.some(z=>same(z.comune,place.comune))){
      go('valutazione');
    }
  });
  zone?.addEventListener('change',()=>{place.zona=zone.value;place.destinazione='';locationPage();document.querySelector('#w-use')?.focus()});
  use?.addEventListener('change',()=>{place.destinazione=use.value});
  document.querySelector('#manual')?.addEventListener('click',()=>{page.innerHTML=caption('Valutazione immobiliare')+'<h1>Valutazione manuale</h1>'+contactForm(true);bindContact();focusPage()});
  document.querySelector('#locate').addEventListener('submit',async e=>{
    e.preventDefault();syncCity(city.value);checking=true;
    const id=renderId,submit=e.currentTarget.querySelector('button');submit.disabled=true;
    try{
      const local=await zonesFor(place.comune);
      if(id!==renderId)return;
      zones=allZonesLoaded?zones:local;
      const found=local.filter(z=>same(z.comune,place.comune));
      const ready=found.some(z=>sameZone(z.zona,place.zona)&&same(z.destinazione,place.destinazione));
      if(!found.length || (place.zona && place.destinazione && !ready) || !place.zona || !place.destinazione){
        locationPage();focusPage();return;
      }
      if(!questions.length){const data=await request('/api/questions');if(!data.questions?.length)throw Error('Il questionario non è disponibile.');questions=data.questions;price=data.price||price}
      if(id!==renderId)return;wizard=true;step=0;questionPage();focusPage();
    }catch(err){if(id===renderId)document.querySelector('#locate .error').textContent=err.message;submit.disabled=false}
  });
}
function visible(q){return !q.when || q.when.values.some(v=>same(v,answers[q.when.id]))}
function questionPage(){
  const groups=[...new Set(questions.map(q=>q.group))].filter(g=>questions.some(q=>q.group===g&&visible(q)));
  step=Math.min(step,groups.length-1);const group=groups[step];
  page.innerHTML=caption('Valutazione immobiliare')+'<h1>'+esc(group)+'</h1><p class="muted">'+esc([place.comune,place.zona,place.destinazione].join(' · '))+'</p><form id="question-form" class="panel"><div class="progress-wrap"><p>Passaggio '+(step+1)+' di '+groups.length+'</p><progress max="'+groups.length+'" value="'+(step+1)+'" aria-label="Avanzamento del questionario"></progress></div><div class="form-grid" id="question-fields"></div>'+errorBox()+'<div class="form-actions"><button type="button" class="btn secondary" id="back">Indietro</button><button type="submit" class="btn">'+(step===groups.length-1?'Vai al riepilogo':'Continua')+'</button></div></form>';
  const form=document.querySelector('#question-form'),container=document.querySelector('#question-fields');
  for(const q of questions.filter(q=>q.group===group)){
    const id='q-'+q.id,value=answers[q.id]??'';
    let control;
    if(q.type==='number') control='<input class="input" type="number" value="'+esc(value)+'">';
    else if(q.type==='yesno') control='<div class="choice-row" role="radiogroup" aria-label="'+esc(q.label)+'">'+(q.options||[]).map(opt=>'<label class="choice"><input type="radio" name="'+esc(q.id)+'" value="'+esc(opt)+'"'+(same(opt,value)?' checked':'')+'> '+esc(opt)+'</label>').join('')+'</div>';
    else control='<select>'+options(q.options,value)+'</select>';
    container.insertAdjacentHTML('beforeend',field(id,q.label,control));const row=container.lastElementChild;
    const controls=[...row.querySelectorAll('input,select')];
    const input=controls[0];
    if(input && q.type!=='yesno'){input.id=id;input.name=q.id}
    if(q.type==='number'){input.step=q.step??'any';if(q.min!==undefined)input.min=q.min;if(q.max!==undefined)input.max=q.max}
    row.hidden=!visible(q);
    controls.forEach(item=>{item.required=Boolean(q.required);item.disabled=row.hidden});
    const read=()=>{if(q.type==='yesno'){const checked=row.querySelector('input:checked');return checked?checked.value:''}return input.value};
    controls.forEach(item=>item.addEventListener(q.type==='number'?'input':'change',()=>{
      answers[q.id]=read();
      for(const dependent of questions.filter(item=>item.when)){
        if(!visible(dependent))delete answers[dependent.id];
        const box=form.querySelector('#q-'+dependent.id)?.closest('.field') || form.querySelector('[name="'+dependent.id+'"]')?.closest('.field');
        if(!box)continue;
        const show=visible(dependent);
        box.hidden=!show;
        box.querySelectorAll('input,select').forEach(dep=>{dep.disabled=!show;if(!show){if(dep.type==='radio')dep.checked=false;else dep.value=''}});
      }
    }));
  }
  document.querySelector('#back').addEventListener('click',()=>{
    if(step){step--;questionPage()}else{wizard=false;locationPage()}focusPage()
  });
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(step<groups.length-1){step++;questionPage();focusPage();return}
    const id=renderId,status=form.querySelector('.error'),buttons=form.querySelectorAll('button');
    status.textContent='';buttons.forEach(b=>b.disabled=true);
    const inputs=Object.fromEntries(questions.filter(q=>visible(q)&&answers[q.id]!==undefined&&answers[q.id]!=='').map(q=>[q.id,answers[q.id]]));
    try{const next=await request('/api/quote',{...place,inputs});if(id===renderId){quote=next;orderInputs=inputs;go('ordine')}}
    catch(err){status.textContent=err.message}finally{buttons.forEach(b=>b.disabled=false)}
  });
}
function answerRows(){
  return questions.filter(q=>visible(q)&&orderInputs?.[q.id]!==undefined).map(q=>'<div><dt>'+esc(q.label)+'</dt><dd>'+esc(orderInputs[q.id])+(q.id==='surface'?' m²':'')+'</dd></div>').join('');
}
function orderPage(){
  if(!quote||!orderInputs){page.innerHTML='<h1>Riepilogo</h1><p>Inizia dal comune per preparare la valutazione.</p><a class="btn" href="#valutazione">Inizia la valutazione</a>';return}
  const session=getSession(),warnings=quote.warnings||[];
  page.innerHTML=caption('Riepilogo e pagamento')+'<h1>La tua valutazione è pronta</h1><p class="page-description">'+esc([place.address,[quote.comune,quote.zona,quote.destinazione].join(' · ')].filter(Boolean).join(' — '))+'</p>'+
    '<article class="panel"><details><summary><strong>Dati dichiarati</strong> ('+Object.keys(orderInputs).length+' risposte)</summary><dl class="metrics">'+answerRows()+'</dl></details>'+
    (warnings.length?'<div class="notice"><strong>Stima parziale</strong><p>Alcuni dati non hanno un coefficiente nel modello: la relazione lo indicherà.</p><ul>'+warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul></div>':'')+
    '<button type="button" class="btn secondary" id="edit">Modifica le risposte</button></article>'+
    '<article class="panel"><h2>Valutazione con relazione PDF</h2><p class="result-value">'+money.format(price)+'</p><p class="muted">Valore stimato, minimo indicativo, quotazione di zona, correttivi e relazione PDF scaricabile dalla tua area personale.</p></article>'+
    '<form id="checkout" class="panel"><h2>'+(session?'Account':'Accedi o crea un account')+'</h2>'+
    (session?'<p class="muted">Accesso come <strong>'+esc(session.email||'utente')+'</strong> · <button type="button" class="text-link" id="switch-user">Cambia account</button></p>'
      :'<div class="choice-row" role="radiogroup" aria-label="Accesso"><label class="choice"><input type="radio" name="mode" value="signup" checked> Nuovo cliente</label><label class="choice"><input type="radio" name="mode" value="login"> Ho già un account</label></div><div class="form-grid">'+
        field('o-mail','Email','<input id="o-mail" class="input" name="email" type="email" required maxlength="254" autocomplete="email">')+
        field('o-pass','Password (almeno 8 caratteri)','<input id="o-pass" class="input" name="password" type="password" required minlength="8" autocomplete="new-password">')+'</div>')+
    // TODO legale: testo definitivo di termini di vendita e rinuncia al recesso da far validare.
    '<label class="choice"><input type="checkbox" name="consent" required> Chiedo la consegna immediata della valutazione e prendo atto che, una volta resa disponibile, perdo il diritto di recesso.</label>'+
    errorBox()+'<div class="form-actions"><button class="btn" type="submit">Paga '+money.format(price)+'</button></div></form>';
  document.querySelector('#edit').addEventListener('click',()=>{wizard=true;step=0;go('valutazione')});
  document.querySelector('#switch-user')?.addEventListener('click',()=>{clearSession();orderPage()});
  const form=document.querySelector('#checkout');
  form.querySelectorAll('[name=mode]').forEach(r=>r.addEventListener('change',()=>{form.querySelector('#o-pass').autocomplete=r.value==='login'?'current-password':'new-password'}));
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=form.querySelector('[type=submit]'),status=form.querySelector('.error'),data=Object.fromEntries(new FormData(form));
    status.textContent='';btn.disabled=true;
    try{
      if(!getSession()){
        const auth=await apiJson('/api/account/'+(data.mode==='login'?'login':'signup'),{email:data.email,password:data.password});
        if(auth.confirm){status.textContent='Ti abbiamo inviato una email di conferma: apri il link, poi torna qui e scegli «Ho già un account».';btn.disabled=false;return}
        setSession(auth);
      }
      const {checkoutUrl}=await apiJson('/api/orders',{...place,inputs:orderInputs,consent:true},{auth:true});
      location.href=checkoutUrl||'/account/';
    }catch(err){status.textContent=err.message;btn.disabled=false;if(err.status===401)orderPage()}
  });
}
async function render(){
  cancelSearch?.();
  const id=++renderId;const name=route();const current=Object.hasOwn(titles,name)?name:'home';
  updateMenu(false);document.title=titles[current]+' · StimaImmobile.it';
  navigation.querySelectorAll('a').forEach(a=>{if(a.hash==='#'+current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  home.hidden=current!=='home';page.hidden=current==='home';focusPage();
  if(current==='home'){
    mountAddressSearch(document.querySelector('#home-search'));
    const example=document.querySelector('#home-example');
    if(example){
      example.innerHTML='<p>Valutazione completa con relazione PDF a <strong>'+money.format(price)+'</strong>. Paghi dopo il riepilogo, solo se la zona è coperta.</p><a class="btn secondary" href="/assets/esempio-relazione.pdf" target="_blank" rel="noopener">Guarda un esempio di relazione</a>';
    }
    loadZones().catch(()=>{});
    return
  }
  if(current==='metodo'){methodPage();return}
  if(current==='indirizzo'||(current==='valutazione'&&!place.comune&&!wizard)){addressPage();return}
  if(current==='contatti'){page.innerHTML=caption('Contatti')+'<h1>Come possiamo aiutarti?</h1>'+contactForm();bindContact();return}
  if(current==='ordine'){orderPage();return}
  page.innerHTML='<p role="status">Verifica delle quotazioni in corso…</p>';
  try{
    await loadZones();if(id!==renderId)return;
    if(place.comune && !wizard && current==='valutazione'){
      const local=await zonesFor(place.comune);if(id!==renderId)return;
      zones=allZonesLoaded?zones:local;
    }
    if(current==='zone')zonesPage();else if(wizard)questionPage();else locationPage();
  }catch(err){if(id!==renderId)return;page.innerHTML=caption('Valutazione immobiliare')+'<h1>Listino non disponibile</h1><p class="error" role="alert">'+esc(err.message)+'</p><button id="retry" class="btn">Riprova</button>'+contactForm(true);document.querySelector('#retry').addEventListener('click',render);bindContact()}
}
window.addEventListener('hashchange',render);
render();
