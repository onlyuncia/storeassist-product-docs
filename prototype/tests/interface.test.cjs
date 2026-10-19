const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const dist=process.env.STOREASSIST_TEST_DIST||path.resolve(__dirname,'../dist');
const E=require(path.join(dist,'engine.js'));
const fixtures=require(path.join(dist,'fixtures.js'));
const source=fs.readFileSync(path.join(dist,'app.js'),'utf8');

// Minimal event/scroll doubles: these check navigation and data isolation,
// not browser layout, painting or the behaviour of a real mobile keyboard.
function mount(initial=E.initial(),stress=false,view=''){
  let saved=JSON.stringify(initial),reads=0,writes=0,resize,tick;
  class Clock extends Date {static now(){return Clock.time;}}Clock.time=Date.now();
  const elements=new Map(),listeners={},windowListeners={},queries={};
  const el=id=>{
    if(!elements.has(id)){
      const values={};
      elements.set(id,{id,innerHTML:'',textContent:'',scrollTop:0,offsetTop:0,offsetHeight:0,rect:{top:0,bottom:0,height:0},getClientRects(){return this.visible?[this.rect]:[];},getBoundingClientRect(){return this.rect;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},dataset:{},listeners:{},attrs:{},setAttribute(key,value){this.attrs[key]=value;},style:{setProperty:(key,value)=>values[key]=value,removeProperty:key=>delete values[key],getPropertyValue:key=>values[key]},classList:{toggle(){}},addEventListener(name,fn){this.listeners[name]=fn;},focus(options){this.focused=options;},querySelector:selector=>el(id+selector),contains:item=>item?.owner===id});
    }
    return elements.get(id);
  };
  function formFor(command,id,values={}){
    const role=command==='cancel-request'||command.endsWith('-service')?'seller':'warehouse';
    const form=el('operation-form-'+role);
    if(form.dataset.command!==command||form.dataset.id!==id||form.dataset.actor!==el('demo-'+role).value)form.fields={};
    form.dataset={command,id,actor:el('demo-'+role).value};form.fields||={};form.elements={namedItem:name=>form.fields[name]||null};
    for(const [name,value] of Object.entries(values)){
      const field=form.fields[name]||={name,form,owner:role==='seller'?'seller-app':'warehouse-app',tagName:['toId','outcome'].includes(name)?'SELECT':typeof value==='boolean'?'INPUT':'TEXTAREA',focus(options){this.focused=options;context.document.activeElement=this;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}};
      field.value=typeof value==='boolean'?'':value;field.checked=value===true;
    }
    return form;
  }
  const viewport={height:360,addEventListener:(name,fn)=>{if(name==='resize')resize=fn;}};
  const context={
    window:{StoreAssist:E,StoreAssistFixtures:fixtures,addEventListener:(name,fn)=>windowListeners[name]=fn},
    Date:Clock,location:{search:'?'+new URLSearchParams({...(stress?{demo:'stress'}:{}),...(view?{view}:{})}).toString()},URLSearchParams,
    visualViewport:viewport,matchMedia:()=>({matches:true}),requestAnimationFrame:fn=>fn(),
    document:{body:{dataset:{}},getElementById:el,querySelector:el,querySelectorAll:selector=>queries[selector]||[],addEventListener:(name,fn)=>listeners[name]=fn},
    localStorage:{getItem(){reads++;return saved;},setItem(key,value){writes++;saved=value;}},
    setInterval(fn){tick=fn;},console
  };
  vm.runInNewContext(source,context);
  return {el,context,queries,Clock,tick:()=>tick(),listeners,windowListeners,viewport,resize:()=>resize(),saved:()=>JSON.parse(saved),replaceSaved:value=>saved=JSON.stringify(value),reads:()=>reads,writes:()=>writes,
    click(action,extra={}){listeners.click({target:{closest:()=>({dataset:{action,...extra},disabled:false})},detail:1,preventDefault(){}});},
    search(value){const input=el('queue-search');input.value=value;input.owner='warehouse-app';context.document.activeElement=input;listeners.input({target:input});},
    setting(name,value){listeners.change({target:{id:'demo-'+name,value}});},
    agree(value){listeners.change({target:{id:'alternative-agreed',checked:value}});},
    actor(role,value){listeners.change({target:{id:'demo-'+role,value}});},
    submit(command,id,values={},decision='',role=''){listeners.submit({target:{dataset:{command,id,...(role?{role}:{})},elements:{namedItem:name=>name in values?{value:typeof values[name]==='boolean'?'':values[name],checked:values[name]===true}:null}},submitter:{value:decision},preventDefault(){}});},
    edit(command,id,values){const form=formFor(command,id,values);for(const name of Object.keys(values)){context.document.activeElement=form.fields[name];listeners.input({target:form.fields[name]});}return form;},
    order(value){listeners.change({target:{id:'queue-order',value}});},
    change(place){listeners.change({target:{id:'handoff-place',value:place}});}
  };
}

test('Проверочный набор содержит 20 запросов и не меняет исходный каталог',()=>{
  const catalog=JSON.stringify(E.catalog);
  const state=fixtures.makeStress(E);
  assert.equal(state.requests.length,20);
  assert.deepEqual(['created','work','ready'].map(status=>state.requests.filter(r=>r.status===status).length),[7,7,6]);
  assert.equal(new Set(state.requests.map(r=>r.id)).size,20);
  assert.equal(JSON.stringify(E.catalog),catalog);
  assert.ok(state.requests.some(r=>r.variant.name.length>80));
});

test('Проверочный режим не читает и не перезаписывает сохранённую обычную демонстрацию',()=>{
  const original=E.apply(E.initial(),E.actors.seller,{id:'saved',type:'create',variantId:'cotton-shirt~0~M',place:E.places[0],serviceId:null}).state;
  const ui=mount(original,true);
  assert.equal(ui.context.document.body.dataset.demo,'stress');
  const rendered=ui.el('warehouse-app').innerHTML;
  assert.equal((rendered.match(/data-request-row=/g)||[]).length,20);
  assert.ok(!/undefined|NaN|Invalid Date/.test(rendered));
  const request=fixtures.makeStress(E).requests[0];
  ui.click('warehouse-request',{id:request.id});ui.click('accept',{id:request.id});
  ui.el('reset-dialog').listeners.close({target:{returnValue:'confirm'}});
  ui.windowListeners.storage({key:'storeassist-main-flow-v1'});
  assert.equal(ui.reads(),0);assert.equal(ui.writes(),0);assert.deepEqual(ui.saved(),original);
  assert.ok(ui.el('warehouse-app').innerHTML.includes('Новых запросов пока нет'));
});

test('Обычный запуск не подмешивает 20 проверочных записей',()=>{
  const ui=mount(E.initial(),false,'warehouse');
  assert.equal(ui.el('workspaces').dataset.view,'warehouse');
  assert.ok(!ui.el('warehouse-app').innerHTML.includes('data-request-row='));
  assert.equal(ui.context.document.body.dataset.demo,undefined);
});

test('Возврат из запроса восстанавливает положение очереди',()=>{
  const state=fixtures.makeStress(E),ui=mount(state);
  const scroll=ui.el('warehouse-app').querySelector('.queue-scroll');
  scroll.scrollTop=380;
  ui.click('warehouse-request',{id:state.requests[0].id});assert.equal(scroll.scrollTop,380);assert.equal(ui.el('warehouse-app').querySelector('.detail-scroll').scrollTop,0);
  const row={dataset:{id:state.requests[0].id},focus:options=>row.restored=options.preventScroll};
  ui.queries['[data-action=warehouse-request]']=[row];
  ui.el('warehouse-app').querySelector('.detail-scroll').scrollTop=160;ui.click('queue');assert.equal(scroll.scrollTop,380);assert.equal(row.restored,true);
  assert.ok(ui.el('warehouse-app').innerHTML.includes('data-tab="active" aria-pressed="true"'));
});

test('Вкладки активных и принятых запросов сохраняют независимые позиции',()=>{
  const ui=mount(fixtures.makeStress(E));
  const scroll=ui.el('warehouse-app').querySelector('.queue-scroll');
  scroll.scrollTop=120;ui.click('queue-tab',{tab:'work'});assert.equal(scroll.scrollTop,0);
  scroll.scrollTop=240;ui.click('queue-tab',{tab:'active'});assert.equal(scroll.scrollTop,120);
  ui.click('queue-tab',{tab:'work'});assert.equal(scroll.scrollTop,240);
});

test('Если завершённая карточка ушла из фильтра, фокус возвращается на выбранную вкладку',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),request=state.requests.find(r=>r.status==='ready');
  ui.click('queue-tab',{tab:'work'});ui.click('warehouse-request',{id:request.id});ui.click('handoff',{id:request.id});
  const tab={dataset:{tab:'work'},focus:options=>tab.restored=options.preventScroll};
  ui.queries['[data-action=queue-tab]']=[tab];ui.click('queue');
  assert.equal(tab.restored,true);
  assert.ok(!ui.el('warehouse-app').innerHTML.includes(`data-request-row="${request.id}"`));
});

test('Высота окон продавца и склада учитывает видимую область при вводе и возвращается после потери фокуса',()=>{
  const ui=mount(),phone=ui.el('seller-app');
  ui.context.document.activeElement={owner:'seller-app',tagName:'INPUT'};
  ui.listeners.focusin();assert.equal(phone.dataset.keyboard,'true');assert.equal(phone.style.getPropertyValue('--phone-available-height'),'312px');
  ui.viewport.height=280;ui.resize();assert.equal(phone.style.getPropertyValue('--phone-available-height'),'232px');
  ui.context.document.activeElement={tagName:'BODY'};ui.listeners.focusout();
  assert.equal(phone.dataset.keyboard,'false');assert.equal(phone.style.getPropertyValue('--phone-available-height'),undefined);
  const warehouse=ui.el('warehouse-app');
  ui.context.document.activeElement={owner:'warehouse-app',id:'queue-search',tagName:'INPUT'};ui.listeners.focusin();
  assert.equal(warehouse.dataset.keyboard,'true');assert.equal(warehouse.style.getPropertyValue('--terminal-available-height'),'248px');
  ui.context.document.activeElement={tagName:'BODY'};ui.listeners.focusout();assert.equal(warehouse.dataset.keyboard,'false');
});

test('После изменений интерфейса запрос сохраняет точные размер, цвет и место; передача и завершение доступны по порядку',()=>{
  const ui=mount();ui.click('start');ui.click('product',{id:'cotton-shirt'});ui.click('size',{size:'L'});ui.click('color',{index:'1'});ui.click('prepare');ui.change(E.places[1]);ui.click('send');
  let request=ui.saved().requests[0];assert.equal(request.variant.id,'cotton-shirt~1~L');assert.equal(request.place,E.places[1]);
  ui.click('warehouse-request',{id:request.id});
  for(const action of ['accept','ready','handoff'])ui.click(action,{id:request.id});
  ui.click('seller-request',{id:request.id});assert.ok(ui.el('seller-app').innerHTML.includes('delivery-summary'));ui.click('service');ui.click('finish');
  assert.equal(ui.saved().requests[0].status,'transferred');assert.equal(ui.saved().services[0].status,'closed');
});

test('Выбранная карточка сохраняет очередь и отмечается в ней; смена фильтра сохраняет только подходящий запрос',()=>{
  const state=fixtures.makeStress(E),request=state.requests.find(r=>r.status==='work'),ui=mount(state);
  ui.click('warehouse-request',{id:request.id});
  let html=ui.el('warehouse-app').innerHTML;
  assert.ok(html.includes('warehouse-list')&&html.includes('warehouse-detail'));
  assert.equal((html.match(/id="warehouse-detail"/g)||[]).length,1);
  assert.equal((html.match(/aria-current="true"/g)||[]).length,1);
  assert.ok(html.includes('data-screen="request"'));
  ui.click('queue-tab',{tab:'work'});assert.ok(ui.el('warehouse-app').innerHTML.includes('data-screen="request"'));
  ui.click('queue-tab',{tab:'complete'});html=ui.el('warehouse-app').innerHTML;
  assert.ok(html.includes('data-screen="queue"'));assert.ok(!html.includes('aria-current="true"'));
});

test('После фактической передачи показан итог; следующий запрос открывается без принятия и изменения данных',()=>{
  const state=fixtures.makeStress(E),request=state.requests.find(r=>r.status==='ready'),ui=mount(state);
  ui.click('warehouse-request',{id:request.id});assert.ok(!ui.el('warehouse-app').innerHTML.includes('delivery-summary'));
  ui.click('handoff',{id:request.id});
  const html=ui.el('warehouse-app').innerHTML;
  for(const text of ['delivery-summary','Товар передан','Получил','Передал','Время выполнения','delivery-history','data-action="next-request"'])assert.ok(html.includes(text),text);
  const before=ui.saved(),expected=before.requests.filter(r=>r.id!==request.id&&r.store===E.actors.warehouse.store&&!E.finalStates.includes(r.status)&&(r.status==='created'||r.workerId===E.actors.warehouse.id)).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt))[0];
  ui.click('next-request');
  assert.deepEqual(ui.saved(),before);
  assert.ok(ui.el('warehouse-app').innerHTML.includes(`>Запрос ${expected.id}</h2>`));
  assert.ok(ui.el('warehouse-app').innerHTML.includes('data-tab="active" aria-pressed="true"'));
  assert.equal(ui.el('warehouse-app').querySelector('.detail-scroll').scrollTop,0);
});

function finishedWithCandidate(){
  const first=E.apply(E.initial(),E.actors.seller,{id:'first',type:'create',variantId:'cotton-shirt~0~M',place:E.places[0],serviceId:null});
  let state=E.apply(first.state,E.actors.seller,{id:'second',type:'create',variantId:'wool-jumper~0~L',place:E.places[1],serviceId:null}).state;
  for(const type of ['accept','ready','handoff'])state=E.apply(state,E.actors.warehouse,{id:'first-'+type,type,requestId:first.result.id}).state;
  return {state,id:first.result.id,candidate:state.requests[1].id};
}

test('Следующий запрос исключает другой магазин и работу другого складского исполнителя',()=>{
  let {state,id,candidate}=finishedWithCandidate();
  state=E.apply(state,{...E.actors.warehouse,id:'other-worker',name:'Другой сотрудник'},{id:'other-accept',type:'accept',requestId:candidate}).state;
  state.requests.push({...state.requests[1],id:'foreign',store:'other-store',status:'created',workerId:null});
  const ui=mount(state);ui.click('warehouse-request',{id});
  assert.ok(ui.el('warehouse-app').innerHTML.includes('delivery-summary'));
  assert.ok(!ui.el('warehouse-app').innerHTML.includes('data-action="next-request"'));
  assert.ok(!ui.el('warehouse-app').innerHTML.includes('data-request-row="foreign"'));
});

test('Устаревшая кнопка следующего запроса перечитывает состояние и не открывает уже завершённую работу',()=>{
  const seeded=finishedWithCandidate(),ui=mount(seeded.state);
  ui.click('warehouse-request',{id:seeded.id});assert.ok(ui.el('warehouse-app').innerHTML.includes('data-action="next-request"'));
  let state=seeded.state;
  for(const type of ['accept','ready','handoff'])state=E.apply(state,E.actors.warehouse,{id:'second-'+type,type,requestId:seeded.candidate}).state;
  ui.replaceSaved(state);ui.click('next-request');
  assert.deepEqual(ui.saved(),state);
  assert.ok(ui.el('warehouse-app').innerHTML.includes('data-screen="queue"'));
});

test('Переход к следующему запросу недоступен до подтверждения текущей передачи',()=>{
  const state=fixtures.makeStress(E),request=state.requests.find(r=>r.status==='ready'),ui=mount(state);
  ui.click('warehouse-request',{id:request.id});const before=ui.saved();ui.click('next-request');
  assert.deepEqual(ui.saved(),before);
  assert.ok(!ui.el('warehouse-app').innerHTML.includes('delivery-summary'));
  assert.ok(ui.el('warehouse-app').innerHTML.includes(`>Запрос ${request.id}</h2>`));
});

function resultIds(html){return Array.from(html.matchAll(/data-request-row="([^"]+)"/g),match=>match[1]);}

test('Альтернативы открываются без записи; согласованный вариант создаёт отдельный запрос в том же обслуживании',()=>{
  const state=fixtures.makeStress(E),ui=mount(state);ui.click('warehouse-request',{id:'R-002'});ui.submit('not-found','R-002');ui.click('seller-request',{id:'R-002'});
  assert.match(ui.el('seller-app').innerHTML,/Подобрать альтернативу/);const before=ui.saved();ui.click('alternatives',{id:'R-002'});assert.deepEqual(ui.saved(),before);
  const original=before.requests[1],variant=E.alternatives(before,original,original.store).variants[0];ui.click('choose-alternative',{variant:variant.id});ui.change(E.places[0]);ui.agree(true);ui.click('send');
  const after=ui.saved(),request=after.requests.at(-1);assert.equal(request.originRequestId,'R-002');assert.equal(request.serviceId,original.serviceId);assert.equal(request.variant.id,variant.id);assert.deepEqual(after.requests[1],original);
});
test('Ноль блокируется, неизвестное наличие открывает отдельное подтверждение без создания запроса',()=>{
  const ui=mount();ui.setting('stock','zero');ui.click('start');ui.click('product',{id:'cotton-shirt'});ui.click('prepare');ui.change(E.places[0]);ui.click('send');assert.equal(ui.saved().requests.length,0);
  ui.setting('stock','stale-zero');ui.click('send');let html=ui.el('seller-app').innerHTML;assert.match(html,/Наличие не подтверждено/);assert.match(html,/Устаревшее наличие: 0/);assert.equal(ui.saved().requests.length,0);
  const attempt=ui.saved().stockAttempts.at(-1),count=ui.saved().stockAttempts.length;ui.submit('stock-warning',attempt.id,{stockConfirmed:true});assert.equal(ui.saved().requests.length,1);assert.equal(ui.saved().stockAttempts.length,count);
});
test('Возврат готовности в работу сохраняет ожидающую отмену и отдельный экран с причиной',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[2];ui.click('warehouse-request',{id:r.id});ui.submit('cancel-request',r.id,{reason:'Ушёл'});ui.click('operation-open',{type:'return-work',id:r.id});
  assert.match(ui.el('warehouse-app').innerHTML,/Прич|Почему требуется/);ui.submit('return-work',r.id,{reason:'Ошибка размера'});assert.equal(ui.saved().requests[2].status,'work');assert.equal(ui.saved().requests[2].cancel.status,'pending');
});
test('Старший принимает и закрывает отдельную проверку, сохраняя исход ненахождения и раздельные данные адреса',()=>{
  const state=fixtures.makeStress(E),ui=mount(state);ui.click('warehouse-request',{id:'R-002'});ui.submit('not-found','R-002');ui.click('operation-open',{type:'report-issue',id:'R-002'});ui.submit('report-issue','R-002',{issueType:'not-found'});
  const c=ui.saved().cases[0];ui.actor('warehouse','senior-daria');assert.match(ui.el('warehouse-app').innerHTML,/Проверки расхождений/);ui.click('case-open',{id:c.id});ui.click('case-claim',{id:c.id});
  ui.click('operation-open',{type:'close-case',id:c.id});ui.submit('close-case',c.id,{result:'found-source',comment:'Проверили, вещь найдена'});
  assert.equal(ui.saved().cases[0].status,'closed');assert.equal(ui.saved().requests[1].status,'not-found');assert.match(ui.el('warehouse-app').innerHTML,/Найден по указанному адресу/);
});
test('Руководитель видит обзор без кнопок выдачи и предлагает передачу текущего владельца',()=>{
  const state=fixtures.makeStress(E),ui=mount(state);ui.actor('warehouse','manager-irina');assert.match(ui.el('warehouse-app').innerHTML,/Обзор смены/);ui.click('review-request',{id:'R-002'});
  assert.ok(!ui.el('warehouse-app').innerHTML.includes('data-action="handoff"'));ui.click('operation-open',{type:'offer-search',id:'R-002',role:'warehouse'});ui.submit('offer-search','R-002',{toId:'warehouse-pavel'},'','warehouse');
  const p=ui.saved().requests[1].transfers[0];assert.equal(p.fromId,'warehouse-mikhail');assert.equal(p.initiatorId,'manager-irina');assert.equal(ui.saved().requests[1].workerId,'warehouse-mikhail');
});
test('Потерянный ответ после сохранения уточняется без повторной выдачи и создания дубля',()=>{
  const ui=mount();ui.click('start');ui.click('product',{id:'cotton-shirt'});ui.click('prepare');ui.change(E.places[0]);ui.setting('connection','lost-after');ui.click('send');
  assert.equal(ui.saved().requests.length,1);assert.ok(ui.saved().pendingAction);assert.match(ui.el('seller-app').innerHTML,/Результат действия неизвестен/);
  ui.click('send');assert.equal(ui.saved().requests.length,1);ui.click('reconcile-pending');assert.equal(ui.saved().requests.length,1);assert.equal(ui.saved().pendingAction,undefined);assert.match(ui.el('seller-app').innerHTML,/Запрос отправлен/);
});
test('Потеря до сохранения требует сверки и повторяет исходную команду с тем же идентификатором',()=>{
  const ui=mount();ui.click('start');ui.click('product',{id:'cotton-shirt'});ui.click('prepare');ui.change(E.places[0]);ui.setting('connection','lost-before');ui.click('send');assert.equal(ui.saved().requests.length,0);
  const commandId=ui.saved().pendingAction.command.id;ui.click('reconcile-pending');assert.match(ui.el('seller-app').innerHTML,/Действие не найдено при сверке/);ui.click('retry-pending');
  assert.equal(ui.saved().requests.length,1);assert.ok(ui.saved().actions[commandId]);assert.equal(ui.saved().pendingAction,undefined);
});
test('Журнал неизвестного результата переживает загрузку без автоматического повторения',()=>{
  const ui=mount();ui.click('start');ui.click('product',{id:'cotton-shirt'});ui.click('prepare');ui.change(E.places[0]);ui.setting('connection','lost-after');ui.click('send');
  const saved=ui.saved(),restored=mount(saved);assert.equal(restored.writes(),0);assert.match(restored.el('seller-app').innerHTML,/Результат действия неизвестен/);restored.click('reconcile-pending');assert.equal(restored.saved().requests.length,1);
});
test('Сбой размещения показывает последнее значение с предупреждением; отсутствие адреса показано отдельно',()=>{
  const ui=mount(fixtures.makeStress(E));ui.click('warehouse-request',{id:'R-002'});ui.setting('placement','failed');ui.click('queue');ui.click('warehouse-request',{id:'R-002'});assert.match(ui.el('warehouse-app').innerHTML,/Не удалось обновить размещение/);assert.match(ui.el('warehouse-app').innerHTML,/C-02/);
  ui.setting('placement','missing');ui.click('queue');ui.click('warehouse-request',{id:'R-002'});assert.match(ui.el('warehouse-app').innerHTML,/адрес не задан/);assert.ok(!ui.el('warehouse-app').innerHTML.includes('Не удалось обновить размещение'));
});

test('Запрошенная отмена отмечена непосредственно в очереди, оставаясь активной; главное действие ведёт к сверке',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[1];ui.click('warehouse-request',{id:r.id});ui.submit('cancel-request',r.id,{reason:'Ушёл'});
  const html=ui.el('warehouse-app').innerHTML;
  assert.match(html,/data-cancel-pending="true"/);assert.match(html,/queue-cancel-hint">Запрошена отмена/);
  assert.match(html,/data-type="resolve-cancel"/);assert.ok(!html.includes('data-action="ready"'));
  assert.equal(ui.saved().requests[1].status,'work');
});

test('Дополнительные складские действия сгруппированы; отдельный экран формы возвращает к карточке и её прокрутке без записи',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[1];ui.click('warehouse-request',{id:r.id});
  let html=ui.el('warehouse-app').innerHTML;assert.match(html,/request-more/);assert.match(html,/Другие действия/);assert.ok(!html.includes('data-command="not-found"'));
  const warehouse=ui.el('warehouse-app');warehouse.querySelector('.detail-scroll').scrollTop=193;warehouse.querySelector('.queue-scroll').scrollTop=87;
  ui.click('operation-open',{type:'not-found',id:r.id});html=warehouse.innerHTML;
  assert.match(html,/id="operation-form-warehouse"/);assert.match(html,/form="operation-form-warehouse"/);
  assert.ok(!html.includes('class="source-address"'));assert.equal(warehouse.querySelector('.detail-scroll').scrollTop,0);assert.equal(warehouse.querySelector('.queue-scroll').scrollTop,87);
  assert.equal(ui.el('operation-title-warehouse').focused.preventScroll,true);
  ui.click('operation-back',{role:'warehouse'});assert.match(warehouse.innerHTML,/class="source-address"/);assert.equal(warehouse.querySelector('.detail-scroll').scrollTop,193);
  assert.deepEqual(ui.saved(),state);assert.equal(ui.writes(),0);
});

test('Черновик сохраняется при возврате и внешнем обновлении; фокус и выделение текста восстанавливаются',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[1];ui.click('warehouse-request',{id:r.id});ui.click('operation-open',{type:'not-found',id:r.id});
  const form=ui.edit('not-found',r.id,{comment:'Проверили <соседнюю> секцию'}),field=form.fields.comment;field.selectionStart=3;field.selectionEnd=8;
  ui.windowListeners.storage({key:'storeassist-main-flow-v1'});
  assert.match(ui.el('warehouse-app').innerHTML,/Проверили &lt;соседнюю&gt; секцию/);assert.equal(field.focused.preventScroll,true);assert.equal(field.selectionStart,3);assert.equal(field.selectionEnd,8);
  ui.click('operation-back',{role:'warehouse'});ui.click('operation-open',{type:'not-found',id:r.id});
  assert.match(ui.el('warehouse-app').innerHTML,/Проверили &lt;соседнюю&gt; секцию/);assert.deepEqual(ui.saved(),state);assert.equal(ui.writes(),0);
});

test('Ошибка формы показана рядом с актуальным исполнителем; черновик сохранён и недоступное действие заблокировано',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[1];ui.click('warehouse-request',{id:r.id});ui.click('operation-open',{type:'not-found',id:r.id});
  ui.edit('not-found',r.id,{comment:'Проверили адрес'});
  const latest=JSON.parse(JSON.stringify(state));latest.requests[1].workerId='warehouse-pavel';latest.requests[1].workerName='Павел';ui.replaceSaved(latest);
  ui.submit('not-found',r.id,{comment:'Проверили адрес'});
  const html=ui.el('warehouse-app').innerHTML;assert.match(html,/id="operation-error-warehouse" role="alert"/);assert.match(html,/Павел/);assert.match(html,/Проверили адрес/);
  assert.match(html,/form="operation-form-warehouse" disabled/);assert.equal(ui.el('operation-error-warehouse').focused.preventScroll,true);
  assert.deepEqual(ui.saved(),latest);assert.equal(ui.writes(),0);
});

test('Черновики разделены по запросам и участникам и не попадают в поля другого сотрудника',()=>{
  const state=fixtures.makeStress(E),ui=mount(state);ui.click('warehouse-request',{id:'R-002'});ui.click('operation-open',{type:'not-found',id:'R-002'});ui.edit('not-found','R-002',{comment:'Заметка Михаила'});
  ui.click('operation-back',{role:'warehouse'});ui.click('warehouse-request',{id:'R-005'});ui.click('operation-open',{type:'not-found',id:'R-005'});
  assert.ok(!ui.el('warehouse-app').innerHTML.includes('Заметка Михаила'));
  ui.actor('warehouse','warehouse-pavel');ui.click('warehouse-request',{id:'R-002'});ui.click('operation-open',{type:'not-found',id:'R-002'});
  assert.ok(!ui.el('warehouse-app').innerHTML.includes('Заметка Михаила'));
  assert.equal(ui.writes(),0);
});

test('Исправление формы после ошибки сохраняет исход и удаляет черновик; повторное открытие не предлагает завершить финальный запрос',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[0];ui.click('seller-request',{id:r.id});ui.click('operation-open',{type:'cancel-request',id:r.id});
  ui.submit('cancel-request',r.id,{reason:''});assert.match(ui.el('seller-app').innerHTML,/operation-error-seller/);
  ui.submit('cancel-request',r.id,{reason:'Покупатель ушёл'});assert.equal(ui.saved().requests[0].status,'cancelled');assert.ok(!ui.el('seller-app').innerHTML.includes('operation-error-seller'));
  ui.click('operation-open',{type:'cancel-request',id:r.id});const html=ui.el('seller-app').innerHTML;
  assert.match(html,/<textarea name="reason"[^>]*><\/textarea>/);assert.match(html,/form="operation-form-seller" disabled/);
});

test('Предложение показывает отправителя, получателя и текущую ответственность; принятие подтверждает нового ответственного',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[1];ui.click('warehouse-request',{id:r.id});ui.click('operation-open',{type:'offer-search',id:r.id});
  ui.submit('offer-search',r.id,{toId:'warehouse-pavel',comment:'Проверили секцию 2'});let html=ui.el('warehouse-app').innerHTML;
  assert.match(html,/Михаил → Павел/);assert.match(html,/До принятия отвечает Михаил/);assert.match(html,/Проверили секцию 2/);
  const offerId=ui.saved().requests[1].transfers[0].id;ui.actor('warehouse','warehouse-pavel');ui.click('warehouse-request',{id:r.id});ui.submit('reply-search',r.id,{offerId},'accept');
  html=ui.el('warehouse-app').innerHTML;assert.match(html,/Передача принята/);assert.match(html,/Сейчас отвечает Павел/);
});

test('При финальном исходе, сохранённом до действия из старой карточки, ошибка остаётся рядом с актуальным итогом',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[1];ui.click('warehouse-request',{id:r.id});
  const latest=E.apply(state,E.actors.warehouse,{id:'external-miss',type:'not-found',requestId:r.id}).state;ui.replaceSaved(latest);
  ui.click('ready',{id:r.id});const html=ui.el('warehouse-app').innerHTML;
  assert.match(html,/Товар не найден/);assert.match(html,/operation-error-warehouse/);assert.match(html,/Действие не выполнено/);
  assert.deepEqual(ui.saved(),latest);assert.equal(ui.writes(),0);
});

test('Отмена с iPod закрывает непринятый запрос, показывает причину и разрешает завершить обслуживание',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[0];ui.click('seller-request',{id:r.id});
  ui.click('operation-open',{type:'cancel-request',id:r.id});assert.match(ui.el('seller-app').innerHTML,/data-command="cancel-request"/);
  ui.submit('cancel-request',r.id,{reason:'Покупатель ушёл'});
  assert.equal(ui.saved().requests[0].status,'cancelled');
  const html=ui.el('seller-app').innerHTML;assert.match(html,/Запрос отменён/);assert.match(html,/Покупатель ушёл/);assert.ok(!html.includes('Товар передан'));
  ui.click('service');ui.click('finish');assert.equal(ui.saved().services[0].status,'closed');
});
test('Начатая отмена видна обоим рабочим местам и не даёт выполнить обычную выдачу до сверки',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[1];ui.click('seller-request',{id:r.id});ui.click('warehouse-request',{id:r.id});
  ui.submit('cancel-request',r.id,{reason:'Больше не нужен'});
  assert.equal(ui.saved().requests[1].status,'work');assert.match(ui.el('seller-app').innerHTML,/Отмена запрошена/);
  assert.match(ui.el('warehouse-app').innerHTML,/Разрешить отмену/);ui.click('operation-open',{type:'resolve-cancel',id:r.id});assert.match(ui.el('warehouse-app').innerHTML,/data-command="resolve-cancel"/);assert.ok(!ui.el('warehouse-app').innerHTML.includes('data-action="ready"'));
  const warehouseHtml=ui.el('warehouse-app').innerHTML;
  assert.ok(warehouseHtml.indexOf('data-command="resolve-cancel"')<warehouseHtml.indexOf('<section class="terminal-action'),'Длинная форма сверки должна находиться в прокручиваемой карточке');
  ui.submit('resolve-cancel',r.id,{outcome:'cancelled',comment:'Не передан, возвращён в секцию',factsConfirmed:true});
  assert.equal(ui.saved().requests[1].status,'cancelled');assert.match(ui.el('warehouse-app').innerHTML,/Запрос отменён/);
});
test('Ненахождение с пустым и заполненным комментарием видно продавцу; введённый HTML экранируется',()=>{
  for(const comment of ['', '<img src=x onerror="bad">']){
    const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[1];ui.click('seller-request',{id:r.id});ui.click('warehouse-request',{id:r.id});
    ui.submit('not-found',r.id,{comment});
    assert.equal(ui.saved().requests[1].status,'not-found');
    for(const id of ['seller-app','warehouse-app']){
      const html=ui.el(id).innerHTML;assert.match(html,/Товар не найден/);assert.ok(!html.includes('<img src=x'));
      if(comment)assert.ok(html.includes('&lt;img'));
    }
    ui.click('next-request');assert.ok(ui.el('warehouse-app').innerHTML.includes('data-screen="request"'));
  }
});
test('Передача поиска показана получателю; после принятия команды использует новый исполнитель',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[1];ui.click('warehouse-request',{id:r.id});
  ui.submit('offer-search',r.id,{toId:'warehouse-pavel',comment:'Уже проверили B-04'});
  let saved=ui.saved();assert.equal(saved.requests[1].workerId,'warehouse-mikhail');const offerId=saved.requests[1].transfers[0].id;
  ui.actor('warehouse','warehouse-pavel');assert.match(ui.el('warehouse-app').innerHTML,/Вам предложен поиск/);ui.click('warehouse-request',{id:r.id});assert.match(ui.el('warehouse-app').innerHTML,/Принять поиск/);
  ui.submit('reply-search',r.id,{offerId},'accept');assert.equal(ui.saved().requests[1].workerId,'warehouse-pavel');
  ui.click('ready',{id:r.id});assert.equal(ui.saved().requests[1].status,'ready');
  ui.actor('warehouse','warehouse-mikhail');ui.click('warehouse-request',{id:r.id});assert.match(ui.el('warehouse-app').innerHTML,/Поиск ведёт Павел/);
});
test('Передача обслуживания даёт получателю контекст без управления до принятия и скрывает управление прежнего продавца после',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[1];ui.click('open-service',{id:r.serviceId});
  ui.submit('offer-service',r.serviceId,{toId:'seller-elena',comment:'Передаю перед перерывом'});
  const offerId=ui.saved().services[1].pendingTransfers[0].id;
  ui.actor('seller','seller-elena');assert.match(ui.el('seller-app').innerHTML,/Предложена передача/);
  ui.click('open-service',{id:r.serviceId});let html=ui.el('seller-app').innerHTML;
  assert.match(html,/Принять обслуживание/);assert.ok(!html.includes('data-action="add-item"'));assert.ok(!html.includes('data-action="finish"'));
  ui.submit('reply-service',r.serviceId,{offerId},'accept');html=ui.el('seller-app').innerHTML;assert.ok(html.includes('data-action="add-item"'));
  ui.click('seller-request',{id:r.id});ui.click('operation-open',{type:'cancel-request',id:r.id});assert.match(ui.el('seller-app').innerHTML,/data-command="cancel-request"/);
  ui.actor('seller','seller-anna');ui.click('open-service',{id:r.serviceId});assert.ok(!ui.el('seller-app').innerHTML.includes('data-command="offer-service"'));
});
test('Получатель может отказаться от обслуживания, отправитель отозвать предложение; назначение сохраняется',()=>{
  for(const decision of ['decline','revoke']){
    const state=fixtures.makeStress(E),ui=mount(state),r=state.requests[0];ui.click('open-service',{id:r.serviceId});ui.submit('offer-service',r.serviceId,{toId:'seller-elena'});
    const offerId=ui.saved().services[0].pendingTransfers[0].id;
    if(decision==='decline'){ui.actor('seller','seller-elena');ui.submit('reply-service',r.serviceId,{offerId},'decline');}
    else ui.submit('revoke-service',r.serviceId,{offerId});
    assert.equal(ui.saved().services[0].sellerId,'seller-anna');assert.equal(ui.saved().services[0].pendingTransfers[0].status,decision==='decline'?'declined':'revoked');
  }
});
test('Новые исходы в проверочном режиме не записываются в обычное хранилище',()=>{
  const original=E.initial(),ui=mount(original,true);ui.click('warehouse-request',{id:'R-002'});ui.submit('not-found','R-002',{comment:'Не нашли'});
  assert.match(ui.el('warehouse-app').innerHTML,/Товар не найден/);assert.equal(ui.reads(),0);assert.equal(ui.writes(),0);assert.deepEqual(ui.saved(),original);
});
test('Текстовое поле складского комментария использует доступную высоту при экранной клавиатуре',()=>{
  const ui=mount();ui.context.document.activeElement={owner:'warehouse-app',tagName:'TEXTAREA'};ui.listeners.focusin();
  assert.equal(ui.el('warehouse-app').dataset.keyboard,'true');assert.equal(ui.el('warehouse-app').style.getPropertyValue('--terminal-available-height'),'328px');
  ui.context.document.activeElement={tagName:'BODY'};ui.listeners.focusout();assert.equal(ui.el('warehouse-app').dataset.keyboard,'false');
});

test('Свежий ненайденный вариант предупреждает перед отправкой и принятием нового запроса без блокировки',()=>{
  let state=E.apply(E.initial(),E.actors.seller,{id:'warn-create',type:'create',variantId:'cotton-shirt~0~M',place:E.places[0]}).state;
  state=E.apply(state,E.actors.warehouse,{id:'warn-accept',type:'accept',requestId:'R-001'}).state;
  state=E.apply(state,E.actors.warehouse,{id:'warn-miss',type:'not-found',requestId:'R-001'}).state;
  const ui=mount(state);ui.click('start');ui.click('product',{id:'cotton-shirt'});ui.click('prepare');
  assert.match(ui.el('seller-app').innerHTML,/Этот вариант недавно не нашли/);
  ui.change(E.places[0]);ui.click('send');assert.equal(ui.saved().requests.length,2);
  ui.click('warehouse-request',{id:'R-002'});assert.match(ui.el('warehouse-app').innerHTML,/Этот вариант недавно не нашли/);
  ui.click('accept',{id:'R-002'});assert.equal(ui.saved().requests[1].status,'work');
});

test('Сводка обслуживания различает ожидание, готовность и передачу, не выдавая другой финальный исход за передачу',()=>{
  const state=fixtures.makeStress(E);state.requests=state.requests.slice(0,4);state.services=state.services.slice(0,1);
  for(const r of state.requests)r.serviceId=state.services[0].id;
  state.requests[3].status='cancelled';
  const ui=mount(state);ui.click('open-service',{id:state.services[0].id});
  const html=ui.el('seller-app').innerHTML;
  for(const [status,value] of [['waiting',2],['ready',1],['transferred',0],['other',1]])assert.match(html,new RegExp(`class="${status}"><span class="progress-label">[^<]+</span><strong>${value}</strong>`));
  assert.deepEqual(ui.saved(),state);assert.equal(ui.writes(),0);
  const ready=state.requests.find(r=>r.status==='ready');ui.click('warehouse-request',{id:ready.id});ui.click('handoff',{id:ready.id});
  const after=ui.el('seller-app').innerHTML;
  assert.match(after,/class="ready"><span class="progress-label">Готовы<\/span><strong>0<\/strong>/);
  assert.match(after,/class="transferred"><span class="progress-label">Переданы<\/span><strong>1<\/strong>/);
});

test('Подтверждение действия показано возле складской кнопки после успеха, прокрутка сохраняется, повторное открытие очищает сообщение',()=>{
  const state=fixtures.makeStress(E),ui=mount(state);ui.click('warehouse-request',{id:'R-001'});
  const warehouse=ui.el('warehouse-app');warehouse.querySelector('.queue-scroll').scrollTop=87;warehouse.querySelector('.detail-scroll').scrollTop=143;
  ui.click('accept',{id:'R-001'});
  let html=warehouse.innerHTML;assert.match(html,/<p class="action-confirmation" role="status">[\s\S]*?Запрос принят/);
  assert.equal(warehouse.querySelector('.queue-scroll').scrollTop,87);assert.equal(warehouse.querySelector('.detail-scroll').scrollTop,143);
  ui.click('ready',{id:'R-001'});assert.match(warehouse.innerHTML,/Готовность сохранена/);
  ui.click('handoff',{id:'R-001'});assert.match(warehouse.innerHTML,/Фактическая передача сохранена/);
  ui.click('warehouse-request',{id:'R-001'});assert.ok(!warehouse.innerHTML.includes('action-confirmation'));
  assert.equal(ui.saved().requests[0].status,'transferred');
});

test('Отклонённое действие другого исполнителя не показывает успешное подтверждение и не меняет данные',()=>{
  const state=fixtures.makeStress(E);state.requests[1].workerId='other-worker';
  const ui=mount(state);ui.click('warehouse-request',{id:state.requests[1].id});ui.click('ready',{id:state.requests[1].id});
  assert.ok(ui.el('feedback').textContent.length>0);assert.ok(!ui.el('warehouse-app').innerHTML.includes('action-confirmation'));
  assert.deepEqual(ui.saved(),state);assert.equal(ui.writes(),0);
});

test('Порядок создания переключается без записи данных; при равных датах порядок устойчив',()=>{
  const state=fixtures.makeStress(E);state.requests[1].createdAt=state.requests[0].createdAt;
  const ui=mount(state),expected=state.requests.slice().sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)).map(r=>r.id);
  assert.deepEqual(resultIds(ui.el('warehouse-app').innerHTML),expected);
  ui.order('newest');
  const newest=state.requests.slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).map(r=>r.id);
  assert.deepEqual(resultIds(ui.el('queue-results').innerHTML),newest);
  ui.order('invalid');assert.deepEqual(resultIds(ui.el('queue-results').innerHTML),newest);
  ui.order('oldest');assert.deepEqual(resultIds(ui.el('queue-results').innerHTML),expected);
  assert.equal(ui.el('warehouse-app').querySelector('.queue-scroll').scrollTop,0);
  assert.deepEqual(ui.saved(),state);assert.equal(ui.writes(),0);
});

test('Фильтр ожидания учитывает магазин, активность и поиск; очистка поиска сохраняет фильтр',()=>{
  const state=fixtures.makeStress(E),now=Date.now();
  state.requests.push({...state.requests[0],id:'foreign-late',store:'other-store',createdAt:new Date(now-900000).toISOString()});
  state.requests.push({...state.requests[0],id:'finished-late',status:'transferred',createdAt:new Date(now-900000).toISOString()});
  const ui=mount(state);ui.Clock.time=now;ui.click('queue-late');
  const expected=state.requests.filter(r=>r.store===E.actors.warehouse.store&&!E.finalStates.includes(r.status)&&now-Date.parse(r.createdAt)>=300000).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
  assert.deepEqual(resultIds(ui.el('queue-results').innerHTML),expected.map(r=>r.id));
  assert.equal(ui.el('queue-late-toggle').attrs['aria-pressed'],'true');
  ui.search(expected[0].id);assert.deepEqual(resultIds(ui.el('queue-results').innerHTML),[expected[0].id]);
  ui.click('queue-clear');assert.deepEqual(resultIds(ui.el('queue-results').innerHTML),expected.map(r=>r.id));
  ui.click('queue-tab',{tab:'work'});
  assert.deepEqual(resultIds(ui.el('warehouse-app').innerHTML),expected.filter(r=>['work','ready'].includes(r.status)).map(r=>r.id));
  ui.click('queue-tab',{tab:'complete'});const html=ui.el('warehouse-app').innerHTML;
  assert.match(html,/id="queue-late-toggle"[^>]+aria-pressed="false" disabled/);
  assert.deepEqual(resultIds(html),['finished-late']);
  ui.click('queue-late');assert.deepEqual(ui.saved(),state);assert.equal(ui.writes(),0);
});

test('Пустой фильтр ожидания объясняет отсутствие строк и снимается без потери запроса',()=>{
  const state=fixtures.makeStress(E),now=Date.now();state.requests.forEach(r=>r.createdAt=new Date(now-60000).toISOString());
  const ui=mount(state);ui.Clock.time=now;ui.click('queue-late');
  assert.match(ui.el('queue-results').innerHTML,/Нет ожидания от 5 минут/);
  ui.search('R-001');assert.match(ui.el('queue-results').innerHTML,/Снять фильтр 5\+ минут/);
  ui.click('queue-late');assert.deepEqual(resultIds(ui.el('queue-results').innerHTML),['R-001']);
  assert.equal(ui.el('queue-search').value,'R-001');assert.deepEqual(ui.saved(),state);
});

test('Ровно через пять минут запрос появляется в фильтре без сброса поиска, карточки или прокрутки',()=>{
  const state=fixtures.makeStress(E),now=Date.now();state.requests.forEach(r=>r.createdAt=new Date(now).toISOString());
  state.requests[0].createdAt=new Date(now-299999).toISOString();
  const ui=mount(state);ui.Clock.time=now;ui.click('warehouse-request',{id:'R-001'});ui.click('queue-late');ui.search('R-001');
  const before=ui.el('warehouse-app').innerHTML,input=ui.el('queue-search'),scroll=ui.el('warehouse-app').querySelector('.queue-scroll');
  input.selectionStart=2;input.selectionEnd=3;scroll.scrollTop=137;
  assert.deepEqual(resultIds(ui.el('queue-results').innerHTML),[]);
  ui.Clock.time++;ui.tick();assert.deepEqual(resultIds(ui.el('queue-results').innerHTML),['R-001']);
  assert.equal(ui.el('warehouse-app').innerHTML,before);assert.equal(ui.context.document.activeElement,input);
  assert.equal(input.value,'R-001');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,3);assert.equal(scroll.scrollTop,137);
  assert.equal(ui.el('queue-late-count').textContent,1);assert.deepEqual(ui.saved(),state);assert.equal(ui.writes(),0);
});

test('Показ выбранной строки снимает фильтр ожидания и сохраняет сортировку',()=>{
  const state=fixtures.makeStress(E),ui=mount(state);ui.click('warehouse-request',{id:'R-001'});ui.click('queue-late');ui.order('newest');ui.search('нет-совпадений');
  ui.click('queue-locate');const html=ui.el('warehouse-app').innerHTML;
  assert.match(html,/id="queue-late-toggle"[^>]+aria-pressed="false"/);
  assert.match(html,/<option value="newest" selected>/);
  assert.equal(resultIds(html).length,20);assert.ok(html.includes('>Запрос R-001</h2>'));assert.deepEqual(ui.saved(),state);
});

test('Следующий запрос снимает фильтр ожидания; сортировка не меняет выбор самой ранней задачи',()=>{
  const seeded=finishedWithCandidate(),ui=mount(seeded.state);ui.click('warehouse-request',{id:seeded.id});ui.click('queue-late');ui.order('newest');
  ui.click('next-request');const html=ui.el('warehouse-app').innerHTML;
  assert.match(html,/id="queue-late-toggle"[^>]+aria-pressed="false"/);
  assert.ok(html.includes(`data-request-row="${seeded.candidate}"`));
  assert.ok(html.includes(`>Запрос ${seeded.candidate}</h2>`));assert.deepEqual(ui.saved(),seeded.state);assert.equal(ui.writes(),0);
});

test('Поиск находит номер, артикул, название и продавца с нормализацией регистра, пробелов и тире',()=>{
  const state=fixtures.makeStress(E),ui=mount(state);
  ui.search('  r—001  ');assert.deepEqual(resultIds(ui.el('queue-results').innerHTML),['R-001']);
  ui.search('st 0418');assert.equal(resultIds(ui.el('queue-results').innerHTML).length,7);
  ui.search('мОДЕЛЬбезПРОБЕЛОВ');assert.deepEqual(resultIds(ui.el('queue-results').innerHTML),['R-004']);
  ui.search('  аЛеКсАнДрОвНа   РУБАШКА  ');assert.equal(resultIds(ui.el('queue-results').innerHTML).length,4);
  assert.equal(ui.writes(),0);assert.deepEqual(ui.saved(),state);
  ui.click('warehouse-request',{id:'R-001'});assert.equal(ui.el('warehouse-app').querySelector('[data-request-title]').focused.preventScroll,true);assert.equal(ui.el('queue-search').focused,undefined);
});

test('Поиск ограничен текущим магазином и выбранной вкладкой; смена вкладки сохраняет запрос',()=>{
  const state=fixtures.makeStress(E);state.requests.push({...state.requests[0],id:'FOREIGN-999',store:'other-store'});
  const ui=mount(state);ui.search('R-002');ui.click('queue-tab',{tab:'work'});
  assert.deepEqual(resultIds(ui.el('warehouse-app').innerHTML),['R-002']);
  ui.click('queue-tab',{tab:'complete'});assert.deepEqual(resultIds(ui.el('warehouse-app').innerHTML),[]);
  assert.ok(ui.el('warehouse-app').innerHTML.includes('value="R-002"'));
  ui.search('FOREIGN-999');ui.click('queue-tab',{tab:'active'});assert.deepEqual(resultIds(ui.el('warehouse-app').innerHTML),[]);
});

test('Пустой результат экранирует текст; очистка восстанавливает записи и фокус без изменения данных',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),before=ui.el('warehouse-app').innerHTML;
  ui.search('<img src=x onerror="bad">');
  assert.ok(ui.el('queue-results').innerHTML.includes('&lt;img'));assert.ok(!ui.el('queue-results').innerHTML.includes('<img src=x'));
  assert.equal(ui.el('queue-result-count').textContent,'Найдено: 0 из 20');
  assert.equal(ui.el('warehouse-app').innerHTML,before);
  ui.click('queue-clear');assert.equal(resultIds(ui.el('queue-results').innerHTML).length,20);
  assert.equal(ui.el('queue-search').value,'');assert.equal(ui.el('queue-search').focused.preventScroll,true);
  assert.equal(ui.el('queue-search-clear').hidden,true);assert.deepEqual(ui.saved(),state);
});

test('Поиск сохраняет открытую карточку, даже когда её строка исключена результатами',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),request=state.requests[0];
  ui.click('warehouse-request',{id:request.id});ui.search('нет-совпадений');
  assert.equal(resultIds(ui.el('queue-results').innerHTML).length,0);
  assert.ok(ui.el('warehouse-app').innerHTML.includes(`>Запрос ${request.id}</h2>`));
  ui.click('queue-tab',{tab:'active'});
  assert.ok(ui.el('warehouse-app').innerHTML.includes('data-screen="request"'));
  assert.deepEqual(ui.saved(),state);
});

test('Кнопка показа выбранной строки учитывает её видимость и прокручивает под панель управления',()=>{
  const state=fixtures.makeStress(E),ui=mount(state),request=state.requests[0];
  ui.click('warehouse-request',{id:request.id});
  const warehouse=ui.el('warehouse-app'),scroll=warehouse.querySelector('.queue-scroll'),list=warehouse.querySelector('.warehouse-list');
  list.visible=true;scroll.rect={top:100,bottom:600};ui.viewport.height=800;
  const controls=ui.el('queue-controls');controls.rect={top:100,bottom:230};controls.offsetHeight=130;
  const row={dataset:{id:request.id},rect:{top:300,bottom:420},getBoundingClientRect(){return this.rect;},focus:options=>row.focused=options.preventScroll};
  ui.queries['[data-action=warehouse-request]']=[row];scroll.listeners.scroll();assert.equal(ui.el('queue-locate').hidden,true);
  ui.viewport.height=350;scroll.listeners.scroll();assert.equal(ui.el('queue-locate').hidden,false);ui.viewport.height=800;
  row.rect={top:650,bottom:770};scroll.listeners.scroll();assert.equal(ui.el('queue-locate').hidden,false);
  ui.click('queue-locate');assert.equal(scroll.scrollTop,408);assert.equal(row.focused,true);assert.deepEqual(ui.saved(),state);
});

test('Показ завершённого запроса выбирает историю и очищает поиск, сохраняя итог выдачи',()=>{
  const state=fixtures.makeStress(E),request=state.requests.find(r=>r.status==='ready'),ui=mount(state);
  ui.click('warehouse-request',{id:request.id});ui.click('handoff',{id:request.id});ui.search('не-подходит');const before=ui.saved();
  ui.click('queue-locate');const html=ui.el('warehouse-app').innerHTML;
  assert.ok(html.includes('data-tab="complete" aria-pressed="true"'));
  assert.ok(html.includes(`data-request-row="${request.id}"`));assert.ok(html.includes('value=""'));
  assert.ok(html.includes('delivery-summary'));assert.deepEqual(ui.saved(),before);
});

test('Следующий запрос сбрасывает поиск и показывает новую выбранную строку без принятия в работу',()=>{
  const seeded=finishedWithCandidate(),ui=mount(seeded.state);
  ui.click('warehouse-request',{id:seeded.id});ui.search('нет-совпадений');const before=ui.saved();ui.click('next-request');
  const html=ui.el('warehouse-app').innerHTML;
  assert.ok(html.includes('value=""'));assert.ok(html.includes(`data-request-row="${seeded.candidate}"`));
  assert.ok(html.includes(`>Запрос ${seeded.candidate}</h2>`));assert.deepEqual(ui.saved(),before);
});


test('Таймер безопасен на экранах старшего и руководителя без элементов складской очереди',()=>{
  const ui=mount(fixtures.makeStress(E)),get=ui.context.document.getElementById;
  for(const id of ['senior-daria','manager-irina']){
    ui.actor('warehouse',id);ui.context.document.getElementById=name=>['queue-results','queue-late-count'].includes(name)?null:get(name);
    assert.doesNotThrow(()=>ui.tick());ui.context.document.getElementById=get;
  }
  assert.equal(ui.el('warehouse-title').textContent,'Руководитель смены');
});

test('Сверка потерянного ответа работает в памяти при недоступном хранилище',()=>{
  const ui=mount();ui.context.localStorage.getItem=()=>{throw Error('storage unavailable');};ui.context.localStorage.setItem=()=>{throw Error('storage unavailable');};
  ui.click('start');ui.click('product',{id:'cotton-shirt'});ui.click('prepare');ui.change(E.places[0]);ui.setting('connection','lost-after');ui.click('send');
  assert.match(ui.el('seller-app').innerHTML,/Результат действия неизвестен/);ui.click('reconcile-pending');assert.match(ui.el('seller-app').innerHTML,/Запрос отправлен/);assert.ok(!ui.el('seller-app').innerHTML.includes('Результат действия неизвестен'));
  assert.match(ui.el('feedback').textContent,/Сохранённый результат подтверждён/);
});

test('Подтверждённый отказ повторного действия снимает неизвестность и сохраняет актуальный исход',()=>{
  const ui=mount(fixtures.makeStress(E));ui.click('warehouse-request',{id:'R-001'});ui.setting('connection','lost-before');ui.click('accept',{id:'R-001'});ui.click('reconcile-pending');
  let latest=ui.saved();latest=E.apply(latest,E.actors.seller,{id:'external-cancel',type:'cancel-request',requestId:'R-001',reason:'Покупатель ушёл'}).state;ui.replaceSaved(latest);ui.click('retry-pending');
  assert.equal(ui.saved().pendingAction,undefined);assert.equal(ui.saved().requests[0].status,'cancelled');assert.ok(!ui.el('warehouse-app').innerHTML.includes('Результат действия неизвестен'));
});

test('Руководитель предлагает обслуживание, а выбранный продавец принимает его лично',()=>{
  const ui=mount(fixtures.makeStress(E));ui.actor('warehouse','manager-irina');ui.click('review-request',{id:'R-002'});const service=ui.saved().services.find(s=>s.id===ui.saved().requests[1].serviceId);
  ui.click('operation-open',{type:'offer-service',id:service.id,role:'warehouse'});ui.submit('offer-service',service.id,{toId:'seller-elena'},'','warehouse');
  let next=ui.saved().services.find(s=>s.id===service.id);assert.equal(next.sellerId,'seller-anna');assert.equal(next.pendingTransfers[0].initiatorId,'manager-irina');
  ui.actor('seller','seller-elena');ui.click('service-open',{id:service.id});ui.submit('reply-service',service.id,{offerId:next.pendingTransfers[0].id},'accept');
  next=ui.saved().services.find(s=>s.id===service.id);assert.equal(next.sellerId,'seller-elena');assert.equal(ui.saved().requests[1].workerId,'warehouse-mikhail');
});

test('Новые настройки, обращения и сверка сбоя изолированы в проверочном режиме',()=>{
  const original=E.initial(),ui=mount(original,true);ui.setting('stock','unknown');ui.setting('placement','failed');ui.click('warehouse-request',{id:'R-002'});ui.setting('connection','lost-after');ui.submit('not-found','R-002',{comment:'Проверено'});ui.click('reconcile-pending');
  ui.submit('report-issue','R-002',{issueType:'not-found'});ui.actor('warehouse','senior-daria');assert.match(ui.el('warehouse-app').innerHTML,/C-001/);assert.equal(ui.reads(),0);assert.equal(ui.writes(),0);assert.deepEqual(ui.saved(),original);
});


test('Известный сбой связи не отправляет действие и сохраняет черновик отдельной формы',()=>{
  const ui=mount(fixtures.makeStress(E));ui.click('warehouse-request',{id:'R-002'});ui.click('operation-open',{type:'not-found',id:'R-002'});ui.edit('not-found','R-002',{comment:'Проверили соседнюю секцию'});ui.setting('connection','offline');ui.submit('not-found','R-002',{comment:'Проверили соседнюю секцию'});
  assert.equal(ui.saved().requests[1].status,'work');assert.match(ui.el('warehouse-app').innerHTML,/Действие не отправлено/);assert.match(ui.el('warehouse-app').innerHTML,/Проверили соседнюю секцию/);assert.equal(ui.saved().pendingAction,undefined);
  ui.setting('connection','online');ui.submit('not-found','R-002',{comment:'Проверили соседнюю секцию'});assert.equal(ui.saved().requests[1].status,'not-found');
});


test('Потеря ответа на выдачу скрывает успешный итог до сверки, в том числе после загрузки и переходов',()=>{
 const ui=mount(fixtures.makeStress(E));ui.click('warehouse-request',{id:'R-003'});ui.setting('connection','lost-after');ui.click('handoff',{id:'R-003'});
 assert.equal(ui.saved().requests[2].status,'transferred');assert.match(ui.el('warehouse-app').innerHTML,/Результат действия неизвестен/);assert.ok(!ui.el('warehouse-app').innerHTML.includes('Выдача завершена'));
 ui.click('queue');ui.click('warehouse-request',{id:'R-003'});assert.ok(!ui.el('warehouse-app').innerHTML.includes('Выдача завершена'));
 const restored=mount(ui.saved());restored.click('warehouse-request',{id:'R-003'});assert.ok(!restored.el('warehouse-app').innerHTML.includes('Выдача завершена'));restored.click('reconcile-pending');assert.match(restored.el('warehouse-app').innerHTML,/Выдача завершена/);
 assert.equal(restored.saved().requests[2].history.filter(e=>e.label==='Фактическая передача подтверждена').length,1);
});

test('Потеря ответа не раскрывает новое назначение до сверки принятия обслуживания',()=>{
 const ui=mount(fixtures.makeStress(E));ui.submit('offer-service','S-002',{toId:'seller-elena'});const offerId=ui.saved().services[1].pendingTransfers[0].id;
 ui.actor('seller','seller-elena');ui.click('open-service',{id:'S-002'});ui.setting('connection','lost-after');ui.submit('reply-service','S-002',{offerId},'accept');
 assert.equal(ui.saved().services[1].sellerId,'seller-elena');assert.ok(!ui.el('seller-app').innerHTML.includes('data-action="add-item"'));assert.match(ui.el('seller-app').innerHTML,/Результат действия неизвестен/);
 ui.click('reconcile-pending');assert.match(ui.el('seller-app').innerHTML,/data-action="add-item"/);
});

test('Старый журнал без снимка не объявляет успех до сверки',()=>{
 const ui=mount(fixtures.makeStress(E));ui.click('warehouse-request',{id:'R-003'});ui.setting('connection','lost-after');ui.click('handoff',{id:'R-003'});
 const saved=ui.saved();delete saved.pendingAction.before;const restored=mount(saved);restored.click('warehouse-request',{id:'R-003'});assert.ok(!restored.el('warehouse-app').innerHTML.includes('Выдача завершена'));assert.match(restored.el('warehouse-app').innerHTML,/Результат действия неизвестен/);
 restored.click('reconcile-pending');assert.equal(restored.saved().pendingAction,undefined);
});

test('Обращение сохраняет показанный снимок адреса, даже если источник изменился после открытия формы',()=>{
 const ui=mount(fixtures.makeStress(E));ui.setting('placement','updated');ui.click('warehouse-request',{id:'R-002'});assert.match(ui.el('warehouse-app').innerHTML,/D-01/);ui.click('operation-open',{type:'report-issue',id:'R-002'});
 ui.setting('placement','current');ui.submit('report-issue','R-002',{issueType:'placement',actualShelf:'E-01',actualSection:'3',comment:'Наблюдение'});
 const episode=ui.saved().cases[0].episodes[0];assert.equal(episode.source.shelf,'D-01');assert.equal(episode.source.variantId,ui.saved().requests[1].variant.id);assert.equal(episode.observed.shelf,'E-01');
});


test('Очередь показывает новый адрес, последнее значение при сбое и отсутствие адреса отдельно',()=>{
 const ui=mount(fixtures.makeStress(E));ui.setting('placement','updated');assert.match(ui.el('warehouse-app').innerHTML,/queue-location">D-01/);ui.setting('placement','failed');assert.match(ui.el('warehouse-app').innerHTML,/D-01.*обновление не удалось/);
 ui.setting('placement','missing');assert.match(ui.el('warehouse-app').innerHTML,/Адрес не задан/);assert.ok(!ui.el('warehouse-app').innerHTML.includes('queue-location">D-01'));
});

test('Лента группирует новые события одного запроса; открытие результата помечает прочтение без подтверждения выдачи',()=>{
 const ui=mount();ui.click('start');ui.click('product',{id:'cotton-shirt'});ui.click('prepare');ui.change(E.places[0]);ui.click('send');ui.click('warehouse-request',{id:'R-001'});ui.click('accept',{id:'R-001'});ui.click('ready',{id:'R-001'});ui.click('home');
 let html=ui.el('seller-app').innerHTML;assert.match(html,/Непросмотренные результаты/);assert.equal((html.match(/data-action="read-result"/g)||[]).length,1);assert.match(html,/Товар готов к передаче/);
 const before=JSON.stringify(ui.saved().requests);ui.click('read-result',{id:'R-001'});assert.equal(JSON.stringify(ui.saved().requests),before);assert.equal(ui.saved().requests[0].status,'ready');ui.click('home');assert.ok(!ui.el('seller-app').innerHTML.includes('Непросмотренные результаты'));
});

test('Переданные результаты видны новому продавцу после принятия; прежнему управление чтением недоступно',()=>{
 const ui=mount(fixtures.makeStress(E));ui.submit('offer-service','S-002',{toId:'seller-elena'});const offerId=ui.saved().services[1].pendingTransfers[0].id;ui.actor('seller','seller-elena');assert.ok(!ui.el('seller-app').innerHTML.includes('data-action="read-result"'));
 ui.submit('reply-service','S-002',{offerId},'accept');ui.click('home');assert.match(ui.el('seller-app').innerHTML,/data-action="read-result" data-id="R-002"/);ui.click('read-result',{id:'R-002'});assert.equal(ui.saved().requests[1].status,'work');
 ui.actor('seller','seller-anna');assert.ok(!ui.el('seller-app').innerHTML.includes('data-action="read-result" data-id="R-002"'));
});

test('Отметка поиска открывается отдельно, переносится коллеге и экранирует пояснение',()=>{
 const ui=mount(fixtures.makeStress(E));ui.click('warehouse-request',{id:'R-002'});ui.click('operation-open',{type:'record-search',id:'R-002'});assert.match(ui.el('warehouse-app').innerHTML,/name="actualShelf"/);ui.submit('record-search','R-002',{actualShelf:'Z-08',actualSection:'4',comment:'Проверили <ряд>'});
 assert.match(ui.el('warehouse-app').innerHTML,/Проверенные места/);assert.match(ui.el('warehouse-app').innerHTML,/Проверили &lt;ряд&gt;/);ui.submit('offer-search','R-002',{toId:'warehouse-pavel'});const offerId=ui.saved().requests[1].transfers[0].id;ui.actor('warehouse','warehouse-pavel');ui.click('warehouse-request',{id:'R-002'});assert.match(ui.el('warehouse-app').innerHTML,/Z-08/);ui.submit('reply-search','R-002',{offerId},'accept');assert.equal(ui.saved().requests[1].searchAttempts[0].author,'Михаил');
});

test('Предыдущий поиск остаётся доступен как истёкшая сводка без активного предупреждения',()=>{
 const ui=mount(fixtures.makeStress(E));ui.click('warehouse-request',{id:'R-002'});ui.submit('record-search','R-002',{actualShelf:'Z-08',actualSection:'4'});ui.submit('not-found','R-002');const r=ui.saved().requests[1];
 ui.click('start');ui.click('product',{id:r.variant.productId});ui.click('color',{index:r.variant.id.split('~')[1]});ui.click('size',{size:r.variant.size});ui.Clock.time=Date.parse(r.notFoundAt)+100;ui.click('prepare');assert.match(ui.el('seller-app').innerHTML,/Этот вариант недавно не нашли/);assert.match(ui.el('seller-app').innerHTML,/Z-08/);
 ui.Clock.time=Date.parse(r.notFoundAt)+7200000;ui.click('prepare');assert.match(ui.el('seller-app').innerHTML,/срок предупреждения истёк/);assert.ok(!ui.el('seller-app').innerHTML.includes('Этот вариант недавно не нашли'));
});

test('Руководитель видит ожидающую передачу обслуживания даже после финала всех запросов',()=>{
 const ui=mount(fixtures.makeStress(E));ui.submit('offer-service','S-003',{toId:'seller-elena'});const offerId=ui.saved().services[2].pendingTransfers[0].id;ui.click('warehouse-request',{id:'R-003'});ui.click('handoff',{id:'R-003'});ui.actor('warehouse','manager-irina');
 assert.match(ui.el('warehouse-app').innerHTML,/Ожидают передачи обслуживания · 1/);assert.match(ui.el('warehouse-app').innerHTML,/data-action="review-service" data-id="S-003"/);ui.click('review-service',{id:'S-003'});assert.match(ui.el('warehouse-app').innerHTML,/Товар|Передан/);ui.submit('revoke-service','S-003',{offerId},'','warehouse');ui.click('review-back');assert.match(ui.el('warehouse-app').innerHTML,/Ожидают передачи обслуживания · 0/);
});

test('Списки продавца исключают обслуживание другого магазина даже при совпадающем ID продавца',()=>{
 const state=fixtures.makeStress(E);state.services[0].store='other-store';state.requests[0].store='other-store';const ui=mount(state);assert.ok(!ui.el('seller-app').innerHTML.includes('data-id="S-001"'));
});


test('[AC-10] Порог 4:59 / 5:00 виден продавцу и руководителю во всех активных состояниях и при отмене',()=>{
 for(const status of ['created','work','ready'])for(const pending of status==='created'?[false]:[false,true]){
  const state=fixtures.makeStress(E),r=state.requests.find(r=>r.status===status);r.createdAt=new Date(Date.now()-299000).toISOString();if(pending)r.cancel={status:'pending',reason:'Проверка',requestedAt:r.createdAt};const ui=mount(state),before=JSON.stringify(state.requests);ui.Clock.time=Date.parse(r.createdAt)+299000;
  ui.click('seller-request',{id:r.id});assert.match(ui.el('seller-app').innerHTML,new RegExp('data-delay="'+r.id+'" hidden'));ui.actor('warehouse','manager-irina');ui.click('review-request',{id:r.id});assert.match(ui.el('warehouse-app').innerHTML,new RegExp('data-delay="'+r.id+'" hidden'));
  ui.Clock.time=Date.parse(r.createdAt)+300000;ui.click('seller-request',{id:r.id});ui.click('review-request',{id:r.id});assert.ok(!ui.el('seller-app').innerHTML.includes('data-delay="'+r.id+'" hidden'));assert.ok(!ui.el('warehouse-app').innerHTML.includes('data-delay="'+r.id+'" hidden'));assert.equal(JSON.stringify(ui.saved().requests),before);
 }
});

test('[AC-48] Все финальные исходы убирают активную пометку ожидания у продавца и из обзора смены',()=>{
 for(const outcome of ['transferred','not-found','cancelled']){
  const state=fixtures.makeStress(E),r=state.requests[1];r.createdAt=new Date(Date.now()-600000).toISOString();const ui=mount(state);ui.click('warehouse-request',{id:r.id});
  if(outcome==='transferred'){ui.click('ready',{id:r.id});ui.click('handoff',{id:r.id});}else if(outcome==='not-found')ui.submit('not-found',r.id);else{ui.submit('cancel-request',r.id,{reason:'Ушёл'});ui.submit('resolve-cancel',r.id,{outcome:'cancelled',comment:'Не передан, вещь возвращена',factsConfirmed:true});}
  ui.click('seller-request',{id:r.id});assert.ok(!ui.el('seller-app').innerHTML.includes('data-delay="'+r.id+'"'));ui.actor('warehouse','manager-irina');assert.ok(!ui.el('warehouse-app').innerHTML.includes('data-action="review-request" data-id="'+r.id+'"'));assert.equal(ui.saved().requests[1].status,outcome);
 }
});

test('[AC-50] Текущее обновление заменяет просмотренное наличие, ноль можно явно обновить, новая отправка читает заново',()=>{
 const ui=mount();ui.click('start');ui.click('product',{id:'cotton-shirt'});ui.click('prepare');ui.change(E.places[0]);ui.replaceSaved(E.configureSources(ui.saved(),{stock:'zero'}));ui.click('send');assert.equal(ui.saved().requests.length,0);
 assert.match(ui.el('seller-app').innerHTML,/data-action="refresh-stock"/);ui.replaceSaved(E.configureSources(ui.saved(),{stock:'positive'}));ui.click('refresh-stock');assert.ok(!/data-action="send" disabled/.test(ui.el('seller-app').innerHTML));ui.click('send');assert.equal(ui.saved().requests.length,1);const count=ui.saved().stockAttempts.length;
 ui.click('service');ui.click('add-item');ui.click('product',{id:'cotton-shirt'});ui.click('prepare');ui.change(E.places[0]);ui.click('send');assert.equal(ui.saved().requests.length,2);assert.equal(ui.saved().stockAttempts.length,count+1);
});

test('[AC-51] Подтверждение неизвестного наличия и потерянный ответ альтернативы используют одну попытку',()=>{
 for(const mode of ['lost-before','lost-after']){
  const ui=mount(fixtures.makeStress(E));ui.click('warehouse-request',{id:'R-002'});ui.submit('not-found','R-002');ui.click('seller-request',{id:'R-002'});ui.click('alternatives',{id:'R-002'});const origin=ui.saved().requests[1],variant=E.alternatives(ui.saved(),origin,origin.store).variants[0];ui.click('choose-alternative',{variant:variant.id});ui.agree(true);ui.change(E.places[0]);ui.setting('stock','unknown');ui.setting('connection',mode);ui.click('send');const attempt=ui.saved().stockAttempts.at(-1),count=ui.saved().stockAttempts.length;
  ui.submit('stock-warning',attempt.id,{stockConfirmed:true});assert.match(ui.el('seller-app').innerHTML,/Результат действия неизвестен/);ui.click('reconcile-pending');if(mode==='lost-before')ui.click('retry-pending');assert.equal(ui.saved().requests.length,21);assert.equal(ui.saved().stockAttempts.length,count);assert.equal(ui.saved().requests.at(-1).originRequestId,origin.id);
 }
});

test('[AC-56] При неизвестном отзыве обслуживания новая попытка ждёт сверки',()=>{
 for(const mode of ['lost-before','lost-after']){
  const ui=mount(fixtures.makeStress(E));ui.submit('offer-service','S-002',{toId:'seller-elena'});const offerId=ui.saved().services[1].pendingTransfers[0].id;ui.setting('connection',mode);ui.submit('revoke-service','S-002',{offerId});ui.submit('offer-service','S-002',{toId:'seller-elena'});assert.equal(ui.saved().services[1].pendingTransfers.length,1);
  ui.click('reconcile-pending');if(mode==='lost-before')ui.click('retry-pending');ui.submit('offer-service','S-002',{toId:'seller-elena'});assert.equal(ui.saved().services[1].pendingTransfers.length,2);assert.equal(ui.saved().services[1].pendingTransfers[0].status,'revoked');
 }
});

test('[AC-62] Фактическая передача при отмене сохраняет помощь руководителя и видна продавцу',()=>{
 const ui=mount(fixtures.makeStress(E));ui.submit('cancel-request','R-002',{reason:'Спор'});ui.submit('resolve-cancel','R-002',{outcome:'transferred',factsConfirmed:true,managerAssisted:true,comment:'Факт установлен вместе с руководителем'});ui.click('seller-request',{id:'R-002'});assert.match(ui.el('seller-app').innerHTML,/Выдача завершена/);assert.match(ui.el('seller-app').innerHTML,/При сверке помог руководитель/);assert.equal(ui.saved().requests[1].history.at(-1).author,'Михаил');
});

test('[AC-66, AC-67] Закрытие проверки и следующее открытие читают источник, наблюдение не заменяет старый ответ',()=>{
 const ui=mount(fixtures.makeStress(E));ui.click('warehouse-request',{id:'R-002'});ui.submit('report-issue','R-002',{issueType:'placement',actualShelf:'D-01',actualSection:'Секция 4',comment:'Наблюдение'});const c=ui.saved().cases[0];ui.actor('warehouse','senior-daria');ui.click('case-open',{id:c.id});ui.click('case-claim',{id:c.id});ui.submit('close-case',c.id,{result:'found-other',comment:'Проверено'});
 const placement=ui.saved().placements[c.variantId];assert.equal(placement.store,'store-01');assert.equal(placement.variantId,c.variantId);assert.equal(placement.shelf,'C-02');assert.ok(placement.receivedAt&&placement.sourceUpdatedAt);assert.equal(ui.saved().cases[0].episodes[0].observed.shelf,'D-01');
 ui.actor('warehouse','warehouse-mikhail');ui.click('warehouse-request',{id:'R-002'});assert.match(ui.el('warehouse-app').innerHTML,/C-02/);ui.setting('placement','updated');ui.click('queue');ui.click('warehouse-request',{id:'R-002'});assert.match(ui.el('warehouse-app').innerHTML,/D-01/);assert.equal(ui.saved().requests[1].status,'work');
});

test('[AC-68] При сбое без прошлого значения адрес неизвестен; итог проверки и назначение сохраняются',()=>{
 const state=E.configureSources(fixtures.makeStress(E),{placement:'failed'}),ui=mount(state);ui.click('warehouse-request',{id:'R-002'});assert.match(ui.el('warehouse-app').innerHTML,/Размещение неизвестно/);ui.submit('report-issue','R-002',{issueType:'placement',actualShelf:'D-01',actualSection:'4',comment:'Наблюдение'});const c=ui.saved().cases[0];ui.actor('warehouse','senior-daria');ui.click('case-open',{id:c.id});ui.click('case-claim',{id:c.id});ui.submit('close-case',c.id,{result:'found-other',comment:'Проверили'});
 assert.equal(ui.saved().cases[0].status,'closed');assert.equal(ui.saved().placements[c.variantId].status,'unknown');assert.equal(ui.saved().placements[c.variantId].error,true);assert.equal(ui.saved().requests[1].workerId,state.requests[1].workerId);assert.equal(ui.saved().requests[1].createdAt,state.requests[1].createdAt);
});


test('[AC-32, AC-41] Потерянное принятие поиска или обслуживания не раскрывает владельца до сверки',()=>{
 for(const scope of ['search','service'])for(const mode of ['lost-before','lost-after']){
  const ui=mount(fixtures.makeStress(E)),id=scope==='search'?'R-002':'S-002';ui.submit('offer-'+scope,id,{toId:scope==='search'?'warehouse-pavel':'seller-elena'});const offerId=scope==='search'?ui.saved().requests[1].transfers[0].id:ui.saved().services[1].pendingTransfers[0].id;
  ui.actor(scope==='search'?'warehouse':'seller',scope==='search'?'warehouse-pavel':'seller-elena');if(scope==='search')ui.click('warehouse-request',{id:'R-002'});else ui.click('open-service',{id:'S-002'});ui.setting('connection',mode);ui.submit('reply-'+scope,id,{offerId},'accept');
  const pane=scope==='search'?'warehouse-app':'seller-app';assert.match(ui.el(pane).innerHTML,/Результат действия неизвестен/);assert.ok(!ui.el(pane).innerHTML.includes(scope==='search'?'Поиск ведёт Павел':'data-action="add-item"'));ui.click('reconcile-pending');if(mode==='lost-before')ui.click('retry-pending');assert.equal(scope==='search'?ui.saved().requests[1].workerId:ui.saved().services[1].sellerId,scope==='search'?'warehouse-pavel':'seller-elena');
 }
});

test('[AC-65] Неизвестный исход спорной отмены скрыт до сверки и сохраняется единственным событием',()=>{
 for(const outcome of ['cancelled','transferred']){
  const ui=mount(fixtures.makeStress(E));ui.click('warehouse-request',{id:'R-002'});ui.submit('cancel-request','R-002',{reason:'Спор'});ui.setting('connection','lost-after');ui.submit('resolve-cancel','R-002',{outcome,factsConfirmed:true,comment:'Факт установлен',managerAssisted:true});assert.match(ui.el('warehouse-app').innerHTML,/Результат действия неизвестен/);assert.ok(!ui.el('warehouse-app').innerHTML.includes('Выдача завершена'));assert.equal(ui.saved().requests[1].status,outcome);
  const count=ui.saved().requests[1].history.length;ui.click('reconcile-pending');assert.equal(ui.saved().requests[1].history.length,count);assert.equal(ui.saved().pendingAction,undefined);
 }
});

test('[AC-19, AC-20] Сводка показывает результат и время проверки; подтверждённое нахождение уточняет историю',()=>{
 const ui=mount(fixtures.makeStress(E));ui.click('warehouse-request',{id:'R-002'});ui.submit('not-found','R-002');ui.submit('report-issue','R-002',{issueType:'not-found'});const c=ui.saved().cases[0];ui.actor('warehouse','senior-daria');ui.click('case-open',{id:c.id});ui.click('case-claim',{id:c.id});ui.submit('close-case',c.id,{result:'found-source',comment:'Нашли'});
 const r=ui.saved().requests[1];ui.Clock.time=Date.parse(ui.saved().cases[0].closedAt)+1000;ui.click('start');ui.click('product',{id:r.variant.productId});ui.click('color',{index:r.variant.id.split('~')[1]});ui.click('size',{size:r.variant.size});ui.click('prepare');assert.match(ui.el('seller-app').innerHTML,/сведения уточнены/);assert.match(ui.el('seller-app').innerHTML,/Найден по указанному адресу/);assert.match(ui.el('seller-app').innerHTML,/Проверка C-001/);assert.ok(!ui.el('seller-app').innerHTML.includes('Этот вариант недавно не нашли'));
});

test('[AC-53] Очередь и карточка старшего не раскрывают обращение другого магазина',()=>{
 const ui=mount(fixtures.makeStress(E));ui.click('warehouse-request',{id:'R-002'});ui.submit('not-found','R-002');ui.submit('report-issue','R-002',{issueType:'not-found'});const saved=ui.saved();saved.cases[0].store='other-store';ui.replaceSaved(saved);ui.windowListeners.storage({key:'storeassist-main-flow-v1'});ui.actor('warehouse','senior-daria');assert.ok(!ui.el('warehouse-app').innerHTML.includes('data-id="C-001"'));ui.click('case-open',{id:'C-001'});assert.ok(!ui.el('warehouse-app').innerHTML.includes('Проверка C-001'));
});
