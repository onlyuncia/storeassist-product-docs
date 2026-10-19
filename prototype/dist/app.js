(function(){
  'use strict';
  const E=window.StoreAssist;
  const key='storeassist-main-flow-v1';let memoryOnly=false;const placementReadAt={};
  const stressMode=Boolean(globalThis.location&&new URLSearchParams(location.search).get('demo')==='stress');
  let stressState=null;
  const queuePositions={active:0,work:0,complete:0};let queueFocusId=null;let queueResultKey='';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icons={back:'<path d="m14 5-7 7 7 7"/>',arrow:'<path d="m9 5 7 7-7 7"/>',box:'<path d="m3 7 9-4 9 4v11l-9 4-9-4Z"/><path d="m3 7 9 4 9-4M12 11v11M7 5l10 4"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',plus:'<path d="M12 5v14M5 12h14"/>',check:'<path d="m5 12 4 4L19 6"/>',stack:'<path d="m3 6 9-4 9 4-9 4Z M3 12l9 4 9-4M3 18l9 4 9-4"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};
  const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.box}</svg>`;
  const labels={created:'Создан',work:'В работе',ready:'Готов к передаче',transferred:'Передан','not-found':'Не найдено',cancelled:'Отменён',closed:'Завершено'};
  const ui={seller:'home',homeTab:'active',serviceId:null,requestId:null,productId:null,color:0,size:'M',place:'',query:'',warehouse:'queue',warehouseId:null,queueTab:'active',queueQuery:'',queueLateOnly:false,queueOrder:'oldest',actionNotice:null,sellerActorId:E.actors.seller.id,warehouseActorId:E.actors.warehouse.id,view:'both',operations:{seller:null,warehouse:null},drafts:{},actionErrors:{seller:null,warehouse:null},alternativeOriginId:null,customerAgreed:false,stockAttempt:null,placements:{},caseId:null,reviewRequestId:null,reviewServiceId:null,pendingAction:null,networkMode:'online'};
  const requestedView=globalThis.location&&new URLSearchParams(location.search).get('view');
  if(['seller','warehouse','both'].includes(requestedView))ui.view=requestedView;
  let pendingSavedState=null;let state=load();adoptState(state);
  function adoptState(next){ui.pendingAction=next.pendingAction||null;if(ui.pendingAction?.before&&!valid(ui.pendingAction.before))delete ui.pendingAction.before;pendingSavedState=ui.pendingAction?next:null;state=ui.pendingAction?.before?JSON.parse(JSON.stringify(ui.pendingAction.before)):next;}
  function valid(value){return value?.version===1&&value.store==='store-01'&&Array.isArray(value.requests)&&Array.isArray(value.services)&&value.actions&&typeof value.actions==='object';}
  function load(){if(stressMode)return stressState||(stressState=window.StoreAssistFixtures.makeStress(E));try{const raw=localStorage.getItem(key);if(!raw)return E.initial();const saved=JSON.parse(raw);if(valid(saved))return saved;return E.initial();}catch{memoryOnly=true;return E.initial();}}
  function save(value){if(stressMode){stressState=value;return;}try{localStorage.setItem(key,JSON.stringify(value));}catch{memoryOnly=true;}}
  function message(text,error=false){const el=document.getElementById('feedback');el.textContent=text;el.classList.toggle('error',error);}
  function shortTime(value){if(!value||!Number.isFinite(Date.parse(value)))return '—';return new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
  function age(value,end=Date.now()){const minutes=Math.max(0,Math.floor((end-Date.parse(value))/60000));return minutes<1?'менее 1 мин':minutes<60?`${minutes} мин`:`${Math.floor(minutes/60)} ч ${minutes%60} мин`;}
  function overdue(request){return !E.finalStates.includes(request.status)&&Date.now()-Date.parse(request.createdAt)>=300000;}
  function elapsed(request){
    const final=E.finalStates.includes(request.status);
    const end=final?Date.parse(request.closedAt||request.transferredAt||request.history.at(-1)?.at):Date.now();
    return `<span class="elapsed-value"${final?'':` data-age="${esc(request.createdAt)}"`}>${age(request.createdAt,end)}</span>`;
  }
  function variantPills(item){return `<span class="variant-size">${esc(item.size)}</span><span class="variant-color"><span class="swatch" style="background:${esc(item.hex)}"></span>${esc(item.color)}</span><span class="variant-quantity">1 шт.</span>`;}
  function plural(n,one,few,many){const last=n%10;return n%100>=11&&n%100<=14?many:last===1?one:last>=2&&last<=4?few:many;}
  function badge(status){return `<span class="status ${esc(status)}">${esc(labels[status]||status)}</span>`;}
  function serviceFor(request){return state.services.find(s=>s.id===request?.serviceId);}
  function requestsFor(id){return state.requests.filter(r=>r.serviceId===id);}
  function garment(item,size='small'){
    const shapes={
      trousers:{outline:'M49 23Q80 18 111 23L121 137Q105 144 88 140L80 71 72 140Q55 144 39 137Z',seams:'M48 35Q80 31 112 35M80 22V71M56 35Q56 48 46 51M104 35Q104 48 114 51M69 70 60 136M91 70 101 136M42 129 71 132M89 132 118 129',shade:'m80 40 7 31 7 65-6 4-8-69-8 69-6-4 7-65Z'},
      jumper:{outline:'M52 31 68 25Q80 40 92 25L108 31 136 69Q132 80 118 86L107 68 106 135Q80 141 54 135L53 68 42 86Q27 81 24 69Z',seams:'M68 25Q80 48 92 25M55 126Q80 131 105 126M27 71 42 80M119 80 133 71M58 64 61 116M102 64 99 116',shade:'m53 53 10 15-4 56-5 11Zm54 0-10 15 4 56 5 11ZM68 27Q80 38 92 27L89 34Q80 43 71 34Z'},
      shirt:{outline:'m54 31 15-9 11 9 11-9 15 9 28 29Q131 71 117 79L105 67 105 132Q80 141 55 132L55 67 43 79Q29 72 26 60Z',seams:'m69 22-7 23 18-14 18 14-7-23M80 33V135M88 58H101V75Q94 80 88 75ZM55 121Q80 131 105 121M32 62 45 73M115 73 128 62M58 60 62 112M102 60 98 112',shade:'m54 48 10 20-5 52-4 12Zm52 0L96 68l5 52 4 12ZM80 33l5 5v94l-5 3Z'}
    };
    const drawing=shapes[item.kind]||shapes.shirt;
    const buttons=item.kind==='shirt'?'<g fill="#596357" opacity=".7"><circle cx="83" cy="54" r="1.2"/><circle cx="83" cy="73" r="1.2"/><circle cx="83" cy="92" r="1.2"/><circle cx="83" cy="111" r="1.2"/></g>':'';
    return `<span class="garment ${size}" aria-hidden="true"><svg viewBox="0 0 160 160" fill="none" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="80" cy="143" rx="41" ry="4" fill="#334529" opacity=".08"/><path d="${drawing.outline}" fill="${esc(item.hex||'#e2dfd4')}" stroke="#687461" stroke-opacity=".65" stroke-width="1.3"/><path d="${drawing.shade}" fill="#283324" opacity=".09"/><path d="${drawing.seams}" stroke="#56634e" stroke-opacity=".45" stroke-width="1"/>${buttons}</svg></span>`;
  }
  function nav(title,action='home'){return `<div class="phone-nav"><button class="icon-button" data-action="${action}" aria-label="Назад">${icon('back')}</button><h3 tabindex="-1" data-screen-title>${esc(title)}</h3></div>`;}
  function phoneShell(content,action=''){
    const pending=pendingBanner('seller');const error=!ui.operations.seller?localError('seller',ui.seller==='request'?ui.requestId:ui.serviceId||ui.productId):'';
    return `<header class="phone-top"><span class="phone-wordmark"><img class="app-logo" src="logo.svg?v=20261019-logo08" width="20" height="20" alt="">StoreAssist</span><span class="store-context">Магазин 01 · ${esc(sellerActor().name)}</span></header><div class="phone-scroll">${content}</div>${action||error||pending?`<footer class="phone-action" aria-label="Действия продавца">${pending||error+action}</footer>`:''}`;
  }
  function facts(rows){return `<dl class="facts">${rows.map(([label,value])=>`<div class="fact"><dt>${esc(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;}
  function history(request){return `<ol class="timeline" aria-label="События запроса">${request.history.map((event,i)=>`<li${i===request.history.length-1?' class="is-latest"':''}><span class="timeline-dot"></span><div><strong>${esc(event.label)}</strong><span>${esc(event.author)} · ${shortTime(event.at)}</span>${event.comment?`<p class="history-comment">${esc(event.comment)}</p>`:''}${event.managerAssisted?'<span>При сверке помог руководитель</span>':''}</div></li>`).join('')}</ol>`;}
  function delay(request){return `<div class="age-warning" data-delay="${esc(request.id)}" ${Date.now()-Date.parse(request.createdAt)>=300000&&!E.finalStates.includes(request.status)?'':'hidden'}>Ожидание от 5 минут · <span data-age="${esc(request.createdAt)}">${age(request.createdAt)}</span></div>`;}
  function itemLine(item){return `<div class="line-item">${garment(item)}<div class="item-copy"><strong>${esc(item.name)}</strong><div class="variant-pills">${variantPills(item)}</div><p class="item-article">Артикул ${esc(item.article)}</p></div></div>`;}
  function sellerActor(){return E.staff.find(a=>a.id===ui.sellerActorId)||E.actors.seller;}
  function warehouseActor(){return E.staff.find(a=>a.id===ui.warehouseActorId)||E.actors.warehouse;}
  function searchSummaryBody(item){
    const summary=E.searchSummary(state,sellerActor().store,item.id,Date.now());if(!summary)return '';
    const checked=summary.check?`<p>Проверка ${esc(summary.check.id)} · ${{new:'ожидает принятия',work:'в работе',closed:esc(E.caseResults[summary.check.result]||'закрыта')}[summary.check.status]} · ${shortTime(summary.check.at)}</p>`:'<p>Связанная проверка ещё не создана.</p>';
    const context=`<p>${shortTime(summary.at)} · проверено ${esc(summary.shelf||'место неизвестно')} / ${esc(summary.section||'секция неизвестна')}</p>${summary.comment?`<p>${esc(summary.comment)}</p>`:''}${checked}`;
    if(summary.status==='active')return `<aside class="miss-warning" data-miss-until="${Date.parse(summary.at)+7200000}"><strong>Этот вариант недавно не нашли</strong>${context}<p>Это результат прошлого поиска, а не подтверждение отсутствия. Новый запрос разрешён по правилу наличия.</p></aside>`;
    return `<details class="past-search"><summary>Предыдущий поиск · ${summary.status==='resolved'?'сведения уточнены':'срок предупреждения истёк'}</summary>${context}${summary.resolution?`<p>${esc(summary.resolution.label)} · ${shortTime(summary.resolution.at)}</p>`:''}<p>История сохранена; учётное наличие не изменено этой сводкой.</p></details>`;
  }
  function missWarning(item){return E.searchSummary(state,sellerActor().store,item.id,Date.now())?`<div data-search-summary="${esc(item.id)}">${searchSummaryBody(item)}</div>`:'';}
  function searchContext(r){
    const attempts=r.searchAttempts||[],legacy=(r.checkedPlaces||[]).filter(place=>!attempts.some(a=>a.shelf+' / '+a.section===place));
    if(!attempts.length&&!legacy.length)return '';
    return `<section class="search-context"><h3>Проверенные места</h3>${attempts.map(a=>`<div><strong>${esc(a.shelf)} / ${esc(a.section)}</strong><p>${esc(a.author)} · ${shortTime(a.at)}</p>${a.comment?`<p>${esc(a.comment)}</p>`:''}</div>`).join('')}${legacy.map(place=>`<p>${esc(place)}</p>`).join('')}</section>`;
  }
  function resultFeed(serviceId=null){
    const unread=E.resultsFor(state,sellerActor(),serviceId).filter(e=>!e.readBy?.includes(sellerActor().id));const seen=new Set();const events=unread.filter(e=>{if(seen.has(e.requestId))return false;seen.add(e.requestId);return true;});if(!events.length)return '';
    return `<details class="result-feed"><summary>Непросмотренные результаты <span class="count">${events.length}</span></summary>${events.map(e=>`<button class="result-row" data-action="read-result" data-id="${esc(e.requestId)}"><strong>${esc(e.label)}</strong><span>${esc(e.requestId)} · ${esc(e.author)} · ${shortTime(e.at)}</span></button>`).join('')}</details>`;
  }
  function markRequestResults(id){
    if(ui.pendingAction||ui.networkMode==='offline')return;if(!memoryOnly)adoptState(load());if(ui.pendingAction)return;
    const r=state.requests.find(r=>r.id===id),actor=sellerActor();if(!r)return;
    const events=E.resultsFor(state,actor,r.serviceId).filter(e=>e.requestId===id&&!e.readBy?.includes(actor.id));if(!events.length)return;
    const eventIds=events.map(e=>e.id).sort();try{const out=E.apply(state,actor,{id:'seen-'+actor.id+'-'+eventIds.join('_'),type:'read-results',serviceId:r.serviceId,eventIds});state=out.state;save(state);}catch{message('Статус прочтения не сохранён. Результат остаётся доступен.',true);}
  }
  function outcomeSummary(r){
    if(r.status==='transferred')return deliverySummary(r);
    return `<section class="outcome-summary ${esc(r.status)}"><p class="section-kicker">Запрос ${esc(r.id)} · поиск завершён</p><h2 data-request-title tabindex="-1">${r.status==='not-found'?'Товар не найден':'Запрос отменён'}</h2>${itemLine(r.variant)}${facts([['Исполнитель',esc(r.workerName||'Поиск не начинался')],['Завершён',shortTime(r.closedAt||r.notFoundAt)],['Длительность',elapsed(r)]])}${r.status==='not-found'?`<p>Этот поиск завершён. Учётный остаток не изменён.</p>${r.notFoundComment?`<p class="outcome-comment">Комментарий склада: ${esc(r.notFoundComment)}</p>`:''}`:`<p class="outcome-comment">Причина отмены: ${esc(r.cancel?.reason||'')}</p>`}</section><details class="delivery-history"><summary>История запроса · ${r.history.length}</summary>${history(r)}</details>`;
  }
  function transferPanel(entity,scope){
    const search=scope==='search',actor=search?warehouseActor():sellerActor(),owner=search?entity.workerId:entity.sellerId;
    if(search&&(entity.status!=='work'||entity.cancel?.status==='pending'))return '';
    if(!search&&entity.status!=='active')return '';
    const p=(search?entity.transfers:entity.pendingTransfers)?.find(p=>p.status==='pending');
    const title=search?'Передать поиск':'Передать обслуживание';
    if(p){
      const context=`<div class="transfer-context"><strong>${esc(p.fromName)} → ${esc(p.toName)}</strong><p>Ожидает принятия ${search?'поиска':'обслуживания'} · ${shortTime(p.createdAt)}</p><p>До принятия отвечает ${esc(p.fromName)}. ${search?'Поиск продолжается.':'Запросы склада продолжают выполняться.'}</p>${p.comment?`<p>${esc(p.comment)}</p>`:''}</div>`;
      if(p.toId===actor.id)return `<section class="transfer-panel">${context}<form data-command="reply-${scope}" data-id="${esc(entity.id)}"><input type="hidden" name="offerId" value="${esc(p.id)}"><div class="operation-buttons"><button type="submit" class="primary" name="decision" value="accept">Принять ${search?'поиск':'обслуживание'}</button><button type="submit" class="secondary" name="decision" value="decline">Отклонить</button></div></form></section>`;
      if(owner===actor.id)return `<section class="transfer-panel">${context}<form data-command="revoke-${scope}" data-id="${esc(entity.id)}"><input type="hidden" name="offerId" value="${esc(p.id)}"><button type="submit" class="secondary">Отозвать предложение</button></form></section>`;
      return `<section class="transfer-panel">${context}</section>`;
    }
    if(owner!==actor.id)return '';
    const accepted=(search?entity.transfers:entity.pendingTransfers)?.filter(p=>p.status==='accepted').at(-1);
    const receipt=accepted?`<aside class="transfer-receipt"><strong>Передача принята · ${shortTime(accepted.resolvedAt)}</strong><p>Сейчас отвечает ${esc(search?entity.workerName:entity.sellerName)}. Принял(а) от ${esc(accepted.fromName)}.</p></aside>`:'';
    return receipt+(search?'':operationButton('offer-service',entity.id,'Передать обслуживание коллеге'));
  }
  function sellerCancel(r){
    if(r.cancel?.status==='pending')return `<div class="cancel-banner"><strong>Отмена запрошена</strong><p>${esc(r.cancel.reason)}</p><p>Запрос остаётся активным до подтверждения фактического исхода складом.</p></div>`;
    return operationButton('cancel-request',r.id,'Отменить запрос');
  }

  function actorPane(actor){return actor.role==='seller'?'seller':'warehouse';}
  function stockText(stock){return stock.status==='current'?stock.quantity===0?'Актуальный остаток: 0 — отправка недоступна':`Учётное наличие: ${stock.quantity} шт.`:stock.status==='stale'?`Устаревшее наличие: ${stock.quantity} шт. · ${shortTime(stock.sourceUpdatedAt)}`:'Наличие не подтверждено: источник недоступен';}
  function stockCard(item){const stock=E.stockFor(state,item.id);return `<aside class="availability-note ${stock.status==='current'&&stock.quantity>0?'':'attention'}"><strong>${esc(stockText(stock))}</strong><p>${stock.sourceUpdatedAt?`Обновлено в источнике ${shortTime(stock.sourceUpdatedAt)}. `:''}Учётное наличие не резервирует вещь и не гарантирует выдачу.</p>${stock.status==='current'&&stock.quantity===0?'<button class="secondary full" data-action="refresh-stock">Обновить наличие</button>':''}</aside>`;}
  function alternativesScreen(){
    const r=state.requests.find(r=>r.id===(ui.alternativeOriginId||ui.requestId)&&r.store===sellerActor().store),service=serviceFor(r);
    if(!r||r.status!=='not-found'||(service?.sellerId!==sellerActor().id||service?.status!=='active'))return home();
    const data=E.alternatives(state,r,sellerActor().store);
    const content=data.status==='failed'?'<div class="operation-error" role="alert">Каталог недоступен. Повторите чтение позже.</div>':data.status==='empty'?'<div class="empty"><h3>В каталоге нет подходящих вариантов</h3><p>Новый запрос не создан.</p></div>':`${data.relationsFailed?'<aside class="miss-warning">Связи похожих товаров недоступны. Показаны варианты той же модели.</aside>':''}<div class="alternative-list">${data.variants.map(v=>`<section class="alternative-card">${itemLine(v)}<p>${esc(stockText(v.availability))}${v.availability.sourceUpdatedAt?` · обновлено ${shortTime(v.availability.sourceUpdatedAt)}`:''}</p><button class="secondary full" data-action="choose-alternative" data-variant="${esc(v.id)}" ${v.availability.status==='current'&&v.availability.quantity===0?'disabled':''}>Выбрать вариант</button></section>`).join('')}</div>`;
    return phoneShell(nav('Альтернативы','service')+`<div class="phone-content"><p class="screen-note">Исходный запрос ${esc(r.id)} сохранён. Выберите вариант и согласуйте его с покупателем.</p>${content}</div>`);
  }
  function placementSnapshot(r){if(!ui.placements[r.variant.id])refreshPlacement(r.variant.id);return ui.placements[r.variant.id];}
  function placementPanel(r){
    const snapshot=placementSnapshot(r);
    return `<div class="source-address"><span>Адрес хранения · из источника</span>${snapshot.status==='current'?`<div class="location-grid"><div><span>Стеллаж</span><strong>${esc(snapshot.shelf)}</strong></div><div><span>Секция</span><strong>${esc(snapshot.section?.replace(/^Секция\s*/i,''))}</strong></div></div><p>Получено ${shortTime(snapshot.receivedAt)} · обновлено в источнике ${shortTime(snapshot.sourceUpdatedAt)}</p>`:`<p>${snapshot.status==='missing'?'Источник сообщил: адрес не задан.':'Размещение неизвестно.'}</p>`}${snapshot.error?'<p class="placement-warning">Не удалось обновить размещение. Последнее значение, если оно показано, не подтверждено как актуальное.</p>':''}</div>`;
  }
  function refreshPlacement(id){
    const persisted=state.placements?.[id],cached=ui.placements[id];const previous=persisted&&(!cached||(Date.parse(persisted.receivedAt)||0)>=(Date.parse(cached.receivedAt)||0))?persisted:cached;
    ui.placements[id]=E.placementFor(state,id,previous,Date.now(),warehouseActor().store);
  }
  function refreshQueuePlacements(){for(const id of new Set(state.requests.filter(r=>r.store===warehouseActor().store).map(r=>r.variant.id)))refreshPlacement(id);}
  function queuePlacement(r){const p=placementSnapshot(r);return p.status==='current'?`${esc(p.shelf)} / ${esc(p.section)}${p.error?' · обновление не удалось':''}`:p.status==='missing'?'Адрес не задан':'Адрес неизвестен · источник недоступен';}
  function linkedCases(r){const cases=(state.cases||[]).filter(c=>c.store===r.store&&r.caseIds?.includes(c.id));return cases.length?`<section class="linked-cases"><h3>Проверки расхождений</h3>${cases.map(c=>`<div><strong>${esc(c.id)} · ${{new:'Новое',work:'В работе',closed:'Закрыто'}[c.status]}</strong><p>${esc(c.ownerName||'Ожидает принятия старшим')}${c.result?' · '+esc(E.caseResults[c.result]):''} · ${shortTime(c.closedAt||c.createdAt)}</p>${c.comment?`<p>${esc(c.comment)}</p>`:''}</div>`).join('')}</section>`:'';}
  function managerControls(entity,scope){
    const pending=(scope==='service'?entity.pendingTransfers:entity.transfers)?.find(p=>p.status==='pending');
    if(pending)return `<section class="transfer-panel"><strong>${esc(pending.fromName)} → ${esc(pending.toName)}</strong><p>Ожидает личного принятия получателем.</p><form data-command="revoke-${scope}" data-role="warehouse" data-id="${esc(entity.id)}"><input type="hidden" name="offerId" value="${esc(pending.id)}"><button class="secondary" type="submit">Отозвать предложение</button></form></section>`;
    if(scope==='search'&&(entity.status!=='work'||entity.cancel?.status==='pending'))return '';
    if(scope==='service'&&entity.status!=='active')return '';
    return operationButton('offer-'+scope,entity.id,scope==='search'?'Предложить передачу поиска':'Предложить передачу обслуживания',false,'warehouse');
  }
  function supervisoryScreen(){
    const actor=warehouseActor();
    if(actor.role==='manager'){
      const selectedService=state.services.find(v=>v.id===ui.reviewServiceId&&v.store===actor.store);
      if(selectedService)return {content:`<button class="operation-back" data-action="review-back">${icon('back')}К обзору смены</button><h2 data-request-title tabindex="-1">Обслуживание ${esc(selectedService.id)}</h2><p>Ответственный продавец · ${esc(selectedService.sellerName)}</p>${serviceProgress(requestsFor(selectedService.id))}${managerControls(selectedService,'service')}${requestsFor(selectedService.id).map(r=>`<button class="request-card" data-action="review-request" data-id="${esc(r.id)}"><strong>${esc(r.id)} · ${esc(r.variant.name)}</strong>${badge(r.status)}</button>`).join('')}${history(selectedService)}`,action:''};
      const selected=state.requests.find(r=>r.id===ui.reviewRequestId&&r.store===actor.store),service=serviceFor(selected);
      if(selected)return {content:`<button class="operation-back" data-action="review-back">${icon('back')}К обзору смены</button><h2 data-request-title tabindex="-1">Запрос ${esc(selected.id)}</h2>${itemLine(selected.variant)}${facts([['Состояние',badge(selected.status)],['Продавец',esc(service?.sellerName||'')],['Склад',esc(selected.workerName||'Ещё не назначен')],['С создания',elapsed(selected)]])}${delay(selected)}${selected.cancel?.status==='pending'?`<aside class="cancel-banner"><strong>Запрошена отмена</strong><p>${esc(selected.cancel.reason)}</p><p>Фактический исход фиксирует текущий исполнитель склада после сверки.</p></aside>`:''}${managerControls(selected,'search')}${service?managerControls(service,'service'):''}${searchContext(selected)}${history(selected)}`,action:''};
      const active=state.requests.filter(r=>r.store===actor.store&&!E.finalStates.includes(r.status)).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
      const pendingServices=state.services.filter(v=>v.store===actor.store&&v.status==='active'&&v.pendingTransfers?.some(p=>p.status==='pending'));
      const pendingSearches=active.filter(r=>r.transfers?.some(p=>p.status==='pending'));
      const serviceList=pendingServices.map(v=>{const p=v.pendingTransfers.find(p=>p.status==='pending');return `<button class="request-card" data-action="review-service" data-id="${esc(v.id)}"><strong>${esc(v.id)} · ${esc(p.fromName)} → ${esc(p.toName)}</strong><p>Ожидает личного принятия · ${shortTime(p.createdAt)}</p></button>`;}).join('')||'<p>Ожидающих предложений нет.</p>';
      return {content:`<h2 data-request-title tabindex="-1">Обзор смены</h2><section class="manager-group"><h3>Ожидают передачи обслуживания · ${pendingServices.length}</h3>${serviceList}</section><section class="manager-group"><h3>Ожидают передачи поиска · ${pendingSearches.length}</h3>${pendingSearches.map(r=>`<button class="request-card" data-action="review-request" data-id="${esc(r.id)}"><strong>${esc(r.id)} · ${esc(r.variant.name)}</strong><p>${esc(r.workerName)} → ${esc(r.transfers.find(p=>p.status==='pending').toName)}</p></button>`).join('')||'<p>Ожидающих предложений нет.</p>'}</section><h3>Активные запросы · ${active.length}</h3>${active.map(r=>`<button class="request-card" data-action="review-request" data-id="${esc(r.id)}"><strong>${esc(r.id)} · ${esc(r.variant.name)}</strong><span class="row">${badge(r.status)}<span class="queue-late" data-delay="${esc(r.id)}" ${overdue(r)?'':'hidden'}>5+ минут</span></span><p>${elapsed(r)} с создания · ${esc(r.workerName||'Не принят')} · продавец ${esc(serviceFor(r)?.sellerName||'')}${r.cancel?.status==='pending'?' · запрошена отмена':''}</p></button>`).join('')||'<p>Активных запросов нет.</p>'}`,action:''};
    }
    const cases=(state.cases||[]).filter(c=>c.store===actor.store&&(c.status==='new'||c.ownerId===actor.id)),c=cases.find(c=>c.id===ui.caseId);
    if(!c)return {content:`<h2 data-request-title tabindex="-1">Проверки расхождений</h2><p>Новые обращения и принятые вами проверки</p>${localError('warehouse',ui.caseId)}${cases.map(c=>`<button class="request-card" data-action="case-open" data-id="${esc(c.id)}"><strong>${esc(c.id)} · ${esc(E.variant(c.variantId).name)}</strong><p>${{new:'Новое',work:'В работе',closed:'Закрыто'}[c.status]} · эпизодов: ${c.episodes.length}</p></button>`).join('')||'<div class="empty"><h3>Обращений пока нет</h3></div>'}`,action:''};
    const content=`<button class="operation-back" data-action="case-back">${icon('back')}К обращениям</button><h2 data-request-title tabindex="-1">Проверка ${esc(c.id)}</h2>${itemLine(E.variant(c.variantId))}${placementPanel({variant:E.variant(c.variantId),store:c.store})}${facts([['Ответственный',esc(c.ownerName||'Ещё не назначен')],['Состояние',{new:'Новое',work:'В работе',closed:'Закрыто'}[c.status]]])}${localError('warehouse',c.id)}<h3>Эпизоды и наблюдения</h3>${c.episodes.map(e=>`<section class="case-episode"><strong>${esc(e.requestId)} · ${e.type==='placement'?'Другое размещение':'Не найдено'}</strong><p>Источник при сообщении: ${esc(e.source.shelf||'неизвестно')} / ${esc(e.source.section||'неизвестно')}</p>${e.observed?`<p>Наблюдение сотрудника: ${esc(e.observed.shelf)} / ${esc(e.observed.section)}</p>`:''}<p>${esc(e.comment||'Без комментария')} · ${esc(e.author)} · ${shortTime(e.at)}</p></section>`).join('')}${c.status==='closed'?`<section class="transfer-receipt"><strong>${esc(E.caseResults[c.result])}</strong><p>${esc(c.comment)}</p>${c.correctionDone?`<p>Выполненная учётная операция: ${esc(c.accountingRef)}</p>`:'<p>Учётная корректировка не заявлена.</p>'}</section>`:''}${history(c)}`;
    return {content,action:c.status==='new'?`<button class="primary full" data-action="case-claim" data-id="${esc(c.id)}">Принять проверку</button>`:c.status==='work'?operationButton('close-case',c.id,'Завершить проверку',true):''};
  }
  function pendingBanner(role){
    const pending=ui.pendingAction;if(!pending)return '';const originRole=actorPane(pending.actor);
    const retry=pending.status==='not-recorded';return `<aside class="pending-result" role="status"><strong>${retry?'Действие не найдено при сверке':'Результат действия неизвестен'}</strong><p>Участник: ${esc(pending.actor.name)}. ${retry?'Можно повторить исходное действие с тем же номером.':'Не повторяйте отправку до уточнения сохранённого результата.'}</p><button type="button" class="secondary" data-action="reconcile-pending">Уточнить результат</button>${retry?`<button type="button" class="primary" data-action="retry-pending" ${roleActor(originRole).id!==pending.actor.id?'disabled':''}>Повторить исходное действие</button>`:''}</aside>`;
  }
  function revealResult(result,actor,command){
    const role=actorPane(actor),op=ui.operations[role];if(op)delete ui.drafts[draftKey(role,op.type,op.id)];ui.operations[role]=null;
    if(command.type==='create'){ui.requestId=result.id;ui.serviceId=result.serviceId;ui.seller='request';ui.alternativeOriginId=null;ui.stockAttempt=null;}
    else if(result.kind==='case'){if(actor.role==='senior')ui.caseId=result.id;else if(result.requestId){ui.warehouseId=result.requestId;ui.warehouse='request';}}
    else if(result.kind==='request'&&role==='warehouse'){ui.warehouseId=result.id;ui.warehouse='request';}
  }
  function transact(type,payload,actor,originalCommand=null){
    const role=actorPane(actor);try{
      if(ui.pendingAction)throw new Error('Сначала уточните результат предыдущего действия.');
      if(ui.networkMode==='offline')throw new Error('Связь со StoreAssist отсутствует. Действие не отправлено; текст сохранён.');
      if(!memoryOnly&&!originalCommand)adoptState(load());if(ui.pendingAction)throw new Error('Сначала уточните результат предыдущего действия.');
      const command=originalCommand||{id:globalThis.crypto?.randomUUID?crypto.randomUUID():`action-${Date.now()}-${Math.random().toString(36).slice(2)}`,type,...payload};
      const mode=type==='read-stock'?'online':ui.networkMode;
      if(['lost-before','lost-after'].includes(mode)){
        const before=JSON.parse(JSON.stringify(state));const pending={command,actor:{...actor},status:'unknown',createdAt:new Date().toISOString(),before};
        const stored=mode==='lost-after'?E.apply(state,actor,command).state:JSON.parse(JSON.stringify(state));stored.pendingAction=pending;pendingSavedState=stored;save(stored);state=before;ui.pendingAction=pending;ui.networkMode='online';ui.actionErrors[role]=null;render();return null;
      }
      const output=E.apply(state,actor,command);state=output.state;delete state.pendingAction;save(state);ui.actionErrors[role]=null;message(memoryOnly?'Сохранено в памяти текущей вкладки.':'');return output.result;
    }catch(error){const request=state.requests.find(r=>r.id===payload.requestId),service=state.services.find(s=>s.id===(payload.serviceId||request?.serviceId)),c=(state.cases||[]).find(c=>c.id===payload.caseId);ui.actionErrors[role]={id:ui.operations[role]?.id||payload.caseId||payload.requestId||payload.serviceId||ui.productId,text:error.message,type,owner:c?.ownerName||(role==='warehouse'?request?.workerName:service?.sellerName),status:c?.status||request?.status||service?.status};message(error.message,true);render({errorRole:role});return null;}
  }
  function reconcilePending(retry=false){
    const pending=ui.pendingAction;if(!pending)return;if(ui.networkMode==='offline'){message('Для сверки восстановите связь со StoreAssist.',true);return;}
    const latest=memoryOnly?(pendingSavedState||state):load(),saved=latest.actions[pending.command.id];
    if(saved){state=latest;delete state.pendingAction;save(state);ui.pendingAction=null;pendingSavedState=null;revealResult(saved.result,pending.actor,pending.command);message('Сохранённый результат подтверждён. Повторная операция не выполнялась.');render({stateChange:true});return;}
    if(!retry){pending.status='not-recorded';latest.pendingAction=pending;save(latest);adoptState(latest);render();return;}
    if(pending.status!=='not-recorded')return;const role=actorPane(pending.actor);if(roleActor(role).id!==pending.actor.id){message('Для повтора выберите исходного участника демонстрации.',true);return;}
    ui.pendingAction=null;pendingSavedState=null;state=latest;delete state.pendingAction;const result=transact(pending.command.type,pending.command,pending.actor,pending.command);
    if(result){delete state.pendingAction;save(state);revealResult(result,pending.actor,pending.command);render({stateChange:true});}
    else if(!ui.pendingAction){delete state.pendingAction;save(state);render();}
  }
  function preparedCreate(){return {variantId:selectedVariant().id,place:ui.place,serviceId:ui.serviceId,...(ui.alternativeOriginId?{originRequestId:ui.alternativeOriginId,customerAgreed:ui.customerAgreed}:{})};}
  function sendPrepared(){
    const prepared=preparedCreate(),stock=transact('read-stock',{variantId:prepared.variantId,serviceId:prepared.serviceId},sellerActor());if(!stock)return;
    ui.stockAttempt={...stock,prepared};
    if(stock.status!=='current'){ui.operations.seller={type:'stock-warning',id:stock.id,returnScroll:document.getElementById('seller-app').querySelector('.phone-scroll').scrollTop};render({operationFocus:'seller'});return;}
    const result=transact('create',{...prepared,stockAttemptId:stock.id},sellerActor());if(result){revealResult(result,sellerActor(),{type:'create'});render({top:true});}
  }
  function featureContext(op,entity){
    if(op.type==='stock-warning')return `${itemLine(E.variant(entity.variantId))}<p class="availability-note attention">${esc(stockText(entity))}</p><p>Проверка относится к этой отправке. Подтверждение продолжает её без повторного чтения по кругу.</p>`;
    return `<p class="section-kicker">Проверка ${esc(entity.id)}</p>${itemLine(E.variant(entity.variantId))}${facts([['Ответственный',esc(entity.ownerName||'Не назначен')],['Эпизодов',String(entity.episodes.length)]])}`;
  }
  function featureFields(op,entity,draft,area){
    const option=(value,label)=>`<option value="${value}" ${draft.result===value?'selected':''}>${label}</option>`;
    if(op.type==='stock-warning')return `<label class="check-label"><input type="checkbox" name="stockConfirmed" required ${draft.stockConfirmed?'checked':''}>Понимаю, что наличие не подтверждено; отправить этот запрос на поиск</label>`;
    if(op.type==='record-search')return `<label>Проверенный стеллаж<input class="search-input" name="actualShelf" maxlength="80" required value="${esc(draft.actualShelf||'')}"></label><label>Проверенная секция<input class="search-input" name="actualSection" maxlength="80" required value="${esc(draft.actualSection||'')}"></label>${area('comment','Что проверили · необязательно')}<p class="hint">Отметка останется в истории поиска. Учётный адрес не изменится.</p>`;
    if(op.type==='return-work')return area('reason','Почему требуется повторный поиск',true)+'<p class="hint">История готовности, время создания и ожидающая отмена сохранятся.</p>';
    if(op.type==='report-issue'){
      const type=draft.issueType||(entity?.status==='not-found'?'not-found':'placement');
      return `<label>Тип расхождения<select class="select" name="issueType"><option value="not-found" ${type==='not-found'?'selected':''} ${entity?.status!=='not-found'?'disabled':''}>Не найдено</option><option value="placement" ${type==='placement'?'selected':''} ${!['work','ready','transferred'].includes(entity?.status)?'disabled':''}>Другое место хранения</option></select></label>${type==='placement'?`<label>Фактический стеллаж<input class="search-input" name="actualShelf" maxlength="80" value="${esc(draft.actualShelf||'')}" required></label><label>Фактическая секция<input class="search-input" name="actualSection" maxlength="80" value="${esc(draft.actualSection||'')}" required></label>`:''}${area('comment',type==='placement'?'Пояснение':'Комментарий · необязательно',type==='placement')}<p class="hint">Наблюдение не изменит учёт или адрес источника. Открытая проверка этого варианта будет дополнена.</p>`;
    }
    if(op.type==='close-case')return `<label>Результат проверки<select name="result" class="select" required><option value="">Выберите результат</option>${Object.entries(E.caseResults).map(([key,label])=>option(key,label)).join('')}</select></label>${area('comment','Пояснение к результату',true)}<label class="check-label"><input type="checkbox" name="correctionDone" ${draft.correctionDone?'checked':''}>Уполномоченный сотрудник уже выполнил учётную операцию во внешней системе</label><label>Ссылка или отметка выполненной операции<input class="search-input" name="accountingRef" maxlength="200" value="${esc(draft.accountingRef||'')}" ${draft.correctionDone?'required':''}></label><p class="hint">Закрытие не изменит учёт и исход выдачи. Адрес будет заново получен из демонстрационного источника независимо от наблюдения сотрудника.</p>`;
    return null;
  }

  const operationNames={
    'record-search':['Проверенное место','Сохранить отметку'],
    'not-found':['Товар не найден','Завершить поиск'],
    'cancel-request':['Отмена запроса','Отправить отмену'],
    'resolve-cancel':['Сверка отмены','Сохранить фактический исход'],
    'offer-search':['Передача поиска','Предложить передачу'],
    'offer-service':['Передача обслуживания','Предложить передачу'],
    'return-work':['Возврат в работу','Вернуть в работу'],'report-issue':['Сообщить расхождение','Сохранить обращение'],'close-case':['Результат проверки','Завершить проверку'],'stock-warning':['Наличие не подтверждено','Подтвердить и отправить']
  };
  const operationRole=(type,explicit)=>explicit||(type==='cancel-request'||type==='stock-warning'||type.endsWith('-service')?'seller':'warehouse');
  const roleActor=role=>role==='seller'?sellerActor():warehouseActor();
  const draftKey=(role,type,id)=>`${roleActor(role).id}|${type}|${id}`;
  function operationButton(type,id,label,primary=false,role=''){return `<button class="${primary?'primary':'secondary'}" type="button" data-action="operation-open" ${role?`data-role="${role}"`:''} data-type="${type}" data-id="${esc(id)}">${esc(label)}</button>`;}
  function captureDraft(form){
    if(!form?.dataset?.command||!operationNames[form.dataset.command]||!form.elements)return;
    const type=form.dataset.command,role=operationRole(type,form.dataset.role);if(form.dataset.actor&&form.dataset.actor!==roleActor(role).id)return;const key=draftKey(role,type,form.dataset.id),draft=ui.drafts[key]||{};
    for(const name of ['comment','reason','toId','outcome','factsConfirmed','managerAssisted','result','issueType','actualShelf','actualSection','correctionDone','accountingRef','stockConfirmed']){
      const input=form.elements.namedItem(name);if(input)draft[name]=['factsConfirmed','managerAssisted','correctionDone','stockConfirmed'].includes(name)?input.checked===true:input.value;
    }
    ui.drafts[key]=draft;
  }
  function operationAllowed(type,entity,role){
    if(!entity||entity.store!==roleActor(role).store)return false;
    if(ui.pendingAction)return false;
    if(type==='stock-warning')return entity.sellerId===sellerActor().id&&!state.stockAttempts?.find(a=>a.id===entity.id)?.usedByRequestId;
    if(type==='close-case')return warehouseActor().role==='senior'&&entity.ownerId===warehouseActor().id&&entity.status==='work';
    if(type==='report-issue')return entity.workerId===warehouseActor().id&&(entity.status==='not-found'||['work','ready','transferred'].includes(entity.status));
    if(type==='record-search')return entity.workerId===warehouseActor().id&&entity.status==='work'&&entity.cancel?.status!=='pending';
    if(type==='return-work')return entity.workerId===warehouseActor().id&&entity.status==='ready';
    if(type==='offer-search'&&warehouseActor().role==='manager')return entity.status==='work'&&entity.cancel?.status!=='pending'&&!entity.transfers?.some(p=>p.status==='pending');

    if(type==='offer-service')return entity.status==='active'&&(entity.sellerId===roleActor(role).id||roleActor(role).role==='manager')&&!entity.pendingTransfers?.some(p=>p.status==='pending');
    if(E.finalStates.includes(entity.status))return false;
    if(type==='cancel-request')return serviceFor(entity)?.sellerId===sellerActor().id&&serviceFor(entity)?.status==='active'&&entity.cancel?.status!=='pending';
    if(entity.workerId!==warehouseActor().id)return false;
    if(type==='resolve-cancel')return entity.cancel?.status==='pending';
    return entity.status==='work'&&entity.cancel?.status!=='pending'&&(type!=='offer-search'||!entity.transfers?.some(p=>p.status==='pending'));
  }
  function localError(role,id){
    const error=ui.actionErrors[role];if(!error||error.id!==id)return '';
    return `<div class="operation-error" id="operation-error-${role}" role="alert" tabindex="-1"><strong>Действие не выполнено</strong><p>${esc(error.text)}</p>${error.owner?`<p>Текущий ответственный: ${esc(error.owner)} · ${esc(error.status==='active'?'Активно':labels[error.status]||error.status)}</p>`:''}<p>Проверьте актуальное состояние и ответственного. ${ui.operations[role]?'Введённый текст сохранён.':''}</p></div>`;
  }
  function operationEditor(role){
    const op=ui.operations[role],service=op.type==='offer-service',entity=op.type==='stock-warning'?ui.stockAttempt:(op.type==='close-case'?state.cases||[]:service?state.services:state.requests).find(r=>r.id===op.id&&r.store===roleActor(role).store);
    const [title,label]=operationNames[op.type],draft=ui.drafts[draftKey(role,op.type,op.id)]||{},allowed=operationAllowed(op.type,entity,role);
    const text=(name)=>esc(draft[name]||''),area=(name,caption,required=false)=>`<label>${caption}<textarea name="${name}" maxlength="1000" rows="4" ${required?'required':''}>${text(name)}</textarea></label>`;
    let context=entity?(['stock-warning','close-case'].includes(op.type)?featureContext(op,entity):service?`<p class="section-kicker">Обслуживание ${esc(entity.id)}</p>${serviceProgress(requestsFor(entity.id))}${facts([['Состояние',entity.status==='active'?'Активно':'Завершено'],['Сейчас отвечает',esc(entity.sellerName)]])}`:`<p class="section-kicker">Запрос ${esc(entity.id)}</p>${itemLine(entity.variant)}${searchContext(entity)}${facts([['Состояние',badge(entity.status)],['Поиск выполняет',esc(entity.workerName||'Склад ещё не назначен')],['Продавец',esc(serviceFor(entity)?.sellerName||'')]])}`):'<p>Объект больше недоступен текущему участнику.</p>';
    if(op.type==='report-issue'&&op.sourcePlacement){const source=op.sourcePlacement;context+=`<p class="hint">Источник при открытии: ${source.status==='current'?esc(source.shelf)+' / '+esc(source.section):source.status==='missing'?'адрес не задан':'адрес неизвестен'}${source.error?' · обновление не подтверждено':''} · ${shortTime(source.receivedAt||source.attemptedAt)}</p>`;}
    let fields='';
    if(op.type==='not-found')fields=area('comment','Комментарий склада · необязательно')+'<p class="hint">Завершится только этот поиск. Продавец увидит исход и комментарий; учётный остаток не изменится.</p>';
    if(op.type==='cancel-request')fields=area('reason','Причина отмены',true)+`<p class="hint">${entity?.status==='created'?'Непринятый запрос отменится сразу.':'Запрос останется активным до решения текущего исполнителя склада.'}</p>`;
    if(op.type.startsWith('offer-')){
      const targetRole=service?'seller':'warehouse',owner=service?entity?.sellerId:entity?.workerId;const colleagues=E.staff.filter(a=>a.role===targetRole&&a.store===roleActor(role).store&&a.id!==owner);
      fields=`<p class="transfer-route"><span>От ${esc(roleActor(role).name)}</span><span>→ выбранному коллеге</span></p><label>Кому предложить<select name="toId" class="select" required><option value="">Выберите коллегу</option>${colleagues.map(a=>`<option value="${esc(a.id)}" ${draft.toId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>${area('comment',service?'Что важно знать об обслуживании · необязательно':'Где уже искали и что проверить · необязательно')}<p class="hint">До принятия отвечает ${esc(service?entity?.sellerName:entity?.workerName)}. Отказ и отсутствие ответа не меняют назначение.</p>`;
    }
    if(op.type==='resolve-cancel')fields=`<div class="cancel-banner"><strong>Причина отмены</strong><p>${esc(entity?.cancel?.reason||'')}</p></div><p class="hint">Сверьте факты с продавцом. Если факт передачи или положение вещи не выяснены, вернитесь без подтверждения.</p><label>Фактический исход<select name="outcome" class="select" required><option value="">Выберите после сверки</option><option value="cancelled" ${draft.outcome==='cancelled'?'selected':''}>Не передан — подтвердить отмену</option><option value="transferred" ${draft.outcome==='transferred'?'selected':''}>Уже передан — подтвердить передачу</option></select></label>${area('comment','Итог сверки',true)}<label class="check-label"><input type="checkbox" name="factsConfirmed" required ${draft.factsConfirmed?'checked':''}>Факт передачи проверен; если товар не передан, его положение урегулировано по правилам магазина</label><label class="check-label"><input type="checkbox" name="managerAssisted" ${draft.managerAssisted?'checked':''}>При сверке помог руководитель</label>`;
    fields=featureFields(op,entity,draft,area)??fields;
    const error=localError(role,op.id);
    return {
      title,
      content:`<section class="operation-screen" aria-label="${esc(title)}"><h2 id="operation-title-${role}" tabindex="-1">${esc(title)}</h2>${error}<div class="operation-context">${context}</div>${!allowed?'<p class="operation-unavailable">Действие больше недоступно: состояние или ответственный изменились. Можно вернуться к актуальной карточке; черновик сохранён.</p>':''}<form id="operation-form-${role}" class="operation-form" data-command="${op.type}" data-role="${role}" data-id="${esc(op.id)}" data-actor="${esc(roleActor(role).id)}">${fields}</form><p class="draft-note">Черновик сохраняется в этой вкладке при возврате. После перезагрузки он очистится.</p></section>`,
      action:`<button class="primary full" type="submit" form="operation-form-${role}" ${allowed?'':'disabled'}>${op.type==='cancel-request'&&entity?.status==='created'?'Подтвердить отмену':label}</button>`
    };
  }
  function warehouseMore(r){
    if(r.workerId!==warehouseActor().id)return '';
    const actions=[];if(r.status==='work'&&r.cancel?.status!=='pending')actions.push(operationButton('record-search',r.id,'Отметить проверенное место'));if(r.status==='work'&&r.cancel?.status!=='pending')actions.push(operationButton('not-found',r.id,'Не удалось найти товар'));
    if(r.status==='work'&&r.cancel?.status!=='pending'&&!r.transfers?.some(p=>p.status==='pending'))actions.push(operationButton('offer-search',r.id,'Передать поиск коллеге'));
    if(r.status==='ready')actions.push(operationButton('return-work',r.id,'Вернуть в работу'));
    if(['work','ready','transferred','not-found'].includes(r.status))actions.push(operationButton('report-issue',r.id,'Сообщить расхождение'));
    return actions.length?`<details class="request-more"><summary>Другие действия</summary><div>${actions.join('')}</div></details>`:'';
  }

  function serviceProgress(requests){
    const groups=[['waiting','Ожидаем',requests.filter(r=>['created','work'].includes(r.status)).length],['ready','Готовы',requests.filter(r=>r.status==='ready').length],['transferred','Переданы',requests.filter(r=>r.status==='transferred').length]];
    const other=requests.filter(r=>['not-found','cancelled'].includes(r.status)).length;if(other)groups.push(['other','Другой исход',other]);
    return `<span class="service-progress" role="group" aria-label="Состояние запросов обслуживания">${groups.map(([status,label,count])=>`<span class="${status}"><span class="progress-label">${label}</span><strong>${count}</strong></span>`).join('')}</span>`;
  }
  function home(){
    const services=state.services.filter(s=>s.store===sellerActor().store&&s.sellerId===sellerActor().id&&s.status===(ui.homeTab==='active'?'active':'closed')).slice().reverse();
    const count=status=>state.services.filter(s=>s.store===sellerActor().store&&s.sellerId===sellerActor().id&&s.status===status).length;
    const incoming=state.services.filter(s=>s.store===sellerActor().store&&s.status==='active'&&s.pendingTransfers?.some(p=>p.status==='pending'&&p.toId===sellerActor().id));
    let body=`<div class="phone-nav"><h3 style="padding-left:9px">Мои обслуживания</h3><button class="icon-button" data-action="start" aria-label="Новый запрос">${icon('plus')}</button></div><div class="phone-content"><div class="segment"><button data-action="home-tab" data-tab="active" aria-pressed="${ui.homeTab==='active'}">Активные<span class="count">${count('active')}</span></button><button data-action="home-tab" data-tab="closed" aria-pressed="${ui.homeTab==='closed'}">Завершённые<span class="count">${count('closed')}</span></button></div>`;
    body+=resultFeed();
    if(!services.length&&!incoming.length)body+=`<div class="empty"><div class="empty-illustration">${icon('box')}</div><h3>${ui.homeTab==='active'?'Поможем найти нужную вещь':'История пока пуста'}</h3><p>${ui.homeTab==='active'?'Выберите товар, размер и цвет. Склад получит запрос на выдачу.':'Завершённые обслуживания останутся доступны вместе с запросами.'}</p>${ui.homeTab==='active'?'<button class="primary full" data-action="start">Найти товар</button>':''}</div>`;
    for(const service of incoming)body+=`<button class="request-card incoming-transfer" data-action="open-service" data-id="${esc(service.id)}"><strong>Предложена передача · ${esc(service.id)}</strong><p>От ${esc(service.sellerName)} · просмотрите контекст и ответьте</p></button>`;
    for(const service of services){const requests=requestsFor(service.id);body+=`<button class="request-card" data-action="open-service" data-id="${esc(service.id)}"><span class="row between"><strong>${esc(service.id)}</strong>${service.status==='closed'?badge('closed'):'<span class="arrow-small">›</span>'}</span><p>${requests.length} ${plural(requests.length,'запрос','запроса','запросов')} · начало ${shortTime(service.createdAt)}</p><p>${esc(requests.at(-1)?.variant.name||'')}</p>${serviceProgress(requests)}${requests.some(r=>r.status==='not-found')?'<span class="service-alert">Есть исход «Не найдено» — откройте обслуживание</span>':''}</button>`;}
    if(services.length&&ui.homeTab==='active')body+='<div class="phone-footer"><button class="primary full" data-action="start">Новый запрос</button></div>';
    return phoneShell(body+'</div>');
  }
  function catalog(){return phoneShell(nav('Найти товар',ui.serviceId?'service':'home')+`<div class="phone-content"><label class="sr-only" for="product-search">Название или артикул</label><div class="search-wrap">${icon('search')}<input class="search-input" id="product-search" type="search" placeholder="Название или артикул" value="${esc(ui.query)}" autocomplete="off"></div><div class="section-heading"><h3>Товары магазина</h3><span>Каталог</span></div><div id="catalog-list">${catalogList()}</div></div>`);}
  function catalogList(){if(state.demoSources?.catalog==='failed')return '<div class="operation-error">Каталог недоступен. Повторите позже.</div>';if(state.demoSources?.catalog==='empty')return '<div class="empty">Каталог не содержит товаров.</div>';const products=E.catalog.filter(p=>(p.name+' '+p.article).toLocaleLowerCase('ru-RU').includes(ui.query.toLocaleLowerCase('ru-RU')));return products.length?products.map(p=>`<button class="product-tile" data-action="product" data-id="${p.id}">${garment({...p,hex:p.colors[0].hex})}<div><strong>${esc(p.name)}</strong><span>${p.article} · ${p.colors.length} цвета</span></div>${icon('arrow')}</button>`).join(''):'<div class="empty"><p>По этому названию или артикулу ничего не найдено.</p></div>';}
  function selectedVariant(){return E.variant(`${ui.productId}~${ui.color}~${ui.size}`);}
  function product(){
    const p=E.catalog.find(p=>p.id===ui.productId);if(!p)return catalog();const item=selectedVariant();
    return phoneShell(nav('Товар и вариант','catalog')+`<div class="phone-content"><div class="product-visual">${garment(item,'large')}<span class="variant-stamp">Размер <strong>${esc(item.size)}</strong></span></div><h2 class="product-name">${esc(p.name)}</h2><p class="article">Артикул ${esc(p.article)}</p><fieldset class="variant-options"><legend>Цвет <span>${esc(item.color)}</span></legend><div class="choices">${p.colors.map((c,i)=>`<button class="choice color-choice" data-action="color" data-index="${i}" aria-pressed="${i===ui.color}"><span class="swatch" style="background:${esc(c.hex)}"></span>${esc(c.name)}</button>`).join('')}</div></fieldset><fieldset class="variant-options"><legend>Размер <span>${esc(ui.size)}</span></legend><div class="choices">${p.sizes.map(size=>`<button class="choice size-choice" data-action="size" data-size="${esc(size)}" aria-pressed="${ui.size===size}">${esc(size)}</button>`).join('')}</div></fieldset>${stockCard(item)}</div>`,`<div class="action-selection"><span>${esc(item.color)} · ${esc(item.size)}</span><span>1 шт.</span></div><button class="primary full" data-action="prepare">Запросить со склада ${icon('arrow')}</button>`);
  }
  function newRequest(){const item=selectedVariant();return phoneShell(nav('Новый запрос',ui.alternativeOriginId?'alternatives':'back-product')+`<div class="phone-content">${itemLine(item)}${missWarning(item)}${stockCard(item)}${ui.alternativeOriginId?`<label class="check-label alternative-agreement"><input type="checkbox" id="alternative-agreed" ${ui.customerAgreed?'checked':''}>Вариант согласован с покупателем. Будет создан отдельный запрос к ${esc(ui.alternativeOriginId)}.</label>`:''}${facts([['Магазин','Магазин 01'],['Количество','1 шт.'],['Обслуживание',ui.serviceId?esc(ui.serviceId):'Создастся с запросом']])}<label class="field-label" for="handoff-place">Место передачи</label><select class="select" id="handoff-place" required><option value="">Выберите место</option>${E.places.map(p=>`<option value="${esc(p)}" ${p===ui.place?'selected':''}>${esc(p)}</option>`).join('')}</select><p class="hint">Перед отправкой наличие выбранного размера и цвета обновится. Запрос не резервирует товар.</p></div>`,`<button class="primary full" data-action="send" ${ui.place&&(!ui.alternativeOriginId||ui.customerAgreed)&&!(E.stockFor(state,item.id).status==='current'&&E.stockFor(state,item.id).quantity===0)?'':'disabled'}>Отправить запрос ${icon('arrow')}</button>`);}
  function sellerRequest(){
    const r=state.requests.find(r=>r.id===ui.requestId&&r.store===sellerActor().store);if(!r)return home();const service=serviceFor(r);
    if(service?.sellerId!==sellerActor().id)return home();
    if(E.finalStates.includes(r.status))return phoneShell(nav(r.id,'service')+`<div class="phone-content">${outcomeSummary(r)}${linkedCases(r)}${r.status==='not-found'&&service.status==='active'?`<button class="primary full" data-action="alternatives" data-id="${esc(r.id)}">Подобрать альтернативу</button>`:''}</div>`,`<button class="secondary full" data-action="service">К обслуживанию ${esc(r.serviceId)}</button>`);
    const states={created:['Запрос отправлен','Склад увидит запрос в очереди и примет его в работу.'],work:['Товар ищут на складе',`${r.workerName} принял запрос в ${shortTime(r.acceptedAt)}.`],ready:['Товар готов к передаче',`Нужный вариант подобран. Место передачи: ${r.place}.`]};
    const [title,note]=states[r.status];
    return phoneShell(nav(r.id,'service')+`<div class="phone-content">${delay(r)}<div class="state-banner ${r.status}"><strong>${title}</strong><p>${esc(note)}</p></div>${itemLine(r.variant)}${sellerCancel(r)}${facts([['Состояние',badge(r.status)],['Место передачи',esc(r.place)],['Исполнитель',esc(r.workerName||'Ещё не назначен')],['Создан',shortTime(r.createdAt)],['С момента создания',elapsed(r)]])}<div class="section-heading"><h3>История запроса</h3><span>${r.history.length}</span></div>${history(r)}</div>`,`<button class="secondary full" data-action="service">К обслуживанию ${esc(r.serviceId)}</button>`);
  }
  function service(){
    const s=state.services.find(s=>s.id===ui.serviceId&&s.store===sellerActor().store);if(!s)return home();const owns=s.sellerId===sellerActor().id,incoming=s.pendingTransfers?.some(p=>p.status==='pending'&&p.toId===sellerActor().id);if(!owns&&!incoming)return home();const requests=requestsFor(s.id);
    const canFinish=owns&&s.status==='active'&&requests.length>0&&requests.every(r=>E.finalStates.includes(r.status))&&!s.pendingTransfers?.some(p=>p.status==='pending');
    let body=nav(s.id)+`<div class="phone-content">${s.status==='closed'?'<div class="state-banner closed"><strong>Обслуживание завершено</strong><p>Все запросы разрешены. История сохранена.</p></div>':`<p class="screen-note" style="padding-left:0">Ответственный продавец · ${esc(s.sellerName)}</p>`}${serviceProgress(requests)}<div class="section-heading"><h3>Запросы обслуживания</h3><span>${requests.length}</span></div>`;
    for(const r of requests)body+=`<button class="request-card" ${owns?`data-action="seller-request" data-id="${esc(r.id)}"`:'disabled'}><span class="row between"><strong>${esc(r.id)}</strong>${badge(r.status)}</span><p class="service-product-name">${esc(r.variant.name)}</p><span class="queue-variant">${variantPills(r.variant)}</span>${r.cancel?.status==='pending'?'<span class="queue-cancel-hint">Запрошена отмена</span>':''}</button>`;
    body+=resultFeed(s.id)+transferPanel(s,'service');if(s.history.length)body+=`<details class="delivery-history"><summary>История обслуживания</summary>${history(s)}</details>`;
    if(owns&&s.status==='active')body+='<div class="phone-footer"><button class="secondary full" data-action="add-item">Ещё один товар</button></div>';
    const action=owns&&s.status==='active'?`${canFinish?'':s.pendingTransfers?.some(p=>p.status==='pending')?'<p class="action-hint">Сначала разрешите предложение передачи обслуживания.</p>':'<p class="action-hint">Сначала дождитесь финального исхода всех запросов.</p>'}<button class="primary full" data-action="finish" ${canFinish?'':'disabled'}>Завершить обслуживание</button>`:'<button class="secondary full" data-action="home">Все обслуживания</button>';
    return phoneShell(body+'</div>',action);
  }
  function seller(){if(ui.pendingAction&&!ui.pendingAction.before)return phoneShell('<div class="phone-content"><h2>Нужно уточнить результат</h2><p>До сверки сохранённого действия текущее состояние не подтверждено.</p></div>');if(ui.operations.seller){const op=operationEditor('seller');return phoneShell(`<div class="phone-nav"><button class="operation-back" data-action="operation-back" data-role="seller">${icon('back')}К карточке</button></div>`+op.content,op.action);}switch(ui.seller){case'alternatives':return alternativesScreen();case'catalog':return catalog();case'product':return product();case'new-request':return newRequest();case'request':return sellerRequest();case'service':return service();default:return home();}}
  function terminalShell(content){
    return `<header class="terminal-top"><span class="terminal-brand"><img class="app-logo" src="logo.svg?v=20261019-logo08" width="22" height="22" alt="">StoreAssist <span class="store-context">/ ${warehouseActor().role==='senior'?'проверки':warehouseActor().role==='manager'?'обзор смены':'склад'}</span></span><span class="staff">Магазин 01 <span class="avatar" aria-hidden="true">${esc(warehouseActor().name[0])}</span> ${esc(warehouseActor().name)}</span></header><div class="terminal-body">${content}</div>`;
  }
  function matchesQueue(request,tab=ui.queueTab){return tab==='complete'?E.finalStates.includes(request.status):tab==='work'?['work','ready'].includes(request.status):!E.finalStates.includes(request.status);}
  function normalizeSearch(value){return String(value??'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,' ').trim();}
  function matchesSearch(request){
    const words=normalizeSearch(ui.queueQuery).split(' ').filter(Boolean);
    const text=normalizeSearch([request.id,request.variant.article,request.variant.name,serviceFor(request)?.sellerName].join(' '));
    return words.every(word=>text.includes(word));
  }
  function queueRecords(){return state.requests.filter(r=>r.store===warehouseActor().store&&matchesQueue(r)).sort((a,b)=>(ui.queueOrder==='newest'?-1:1)*(Date.parse(a.createdAt)-Date.parse(b.createdAt)));}
  function filteredQueue(){return queueRecords().filter(matchesSearch).filter(r=>!ui.queueLateOnly||overdue(r));}
  function queueKey(){return filteredQueue().map(r=>r.id).join('|');}
  function queueResultCount(){const all=queueRecords(),found=filteredQueue();return (normalizeSearch(ui.queueQuery)||ui.queueLateOnly)?`Найдено: ${found.length} из ${all.length}${ui.queueLateOnly?' · 5+ минут':''}`:`В этой вкладке: ${all.length}`;}
  function nextActive(id){return state.requests.filter(r=>r.store===warehouseActor().store&&r.id!==id&&!E.finalStates.includes(r.status)&&(r.status==='created'||r.workerId===warehouseActor().id)).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt))[0];}
  function deliverySummary(r){
    const service=serviceFor(r);
    return `<section class="delivery-summary" aria-label="Итог выдачи"><div class="delivery-heading"><span class="delivery-mark" aria-hidden="true">${icon('check')}</span><div><p class="section-kicker">Выдача завершена · ${esc(r.id)}</p><h2 data-request-title tabindex="-1">Товар передан</h2><p>Подтверждено в ${shortTime(r.transferredAt)}</p></div></div>${itemLine(r.variant)}${facts([['Получил',esc(service?.sellerName||'Продавец')],['Место передачи',esc(r.place)],['Передал',esc(r.workerName||'')],['Время выполнения',elapsed(r)]])}</section><details class="delivery-history"><summary>История запроса · ${r.history.length}</summary>${history(r)}</details>`;
  }
  function queueRow(r){
    const service=serviceFor(r),selected=ui.warehouse==='request'&&ui.warehouseId===r.id;
    return `<button class="queue-row${overdue(r)?' is-overdue':''}${selected?' is-selected':''}"${selected?' aria-current="true"':''} aria-controls="warehouse-detail" data-action="warehouse-request" data-id="${esc(r.id)}" data-state="${esc(r.status)}" ${r.cancel?.status==='pending'?'data-cancel-pending="true"':''} data-request-row="${esc(r.id)}"><span class="queue-item">${garment(r.variant)}<span class="queue-copy"><span class="queue-title"><span class="queue-id">${esc(r.id)}</span><strong>${esc(r.variant.name)}</strong></span><span class="queue-variant">${variantPills(r.variant)}</span>${r.cancel?.status==='pending'?'<span class="queue-cancel-hint">Запрошена отмена</span>':''}${r.transfers?.some(p=>p.status==='pending'&&p.toId===warehouseActor().id)?'<span class="queue-transfer-hint">Вам предложен поиск</span>':''}<small class="queue-meta"><span class="queue-location">${queuePlacement(r)}</span><span>${esc(service?.sellerName||'')}</span></small></span></span>${badge(r.status)}<span class="queue-age">${elapsed(r)}<small>${E.finalStates.includes(r.status)?(r.status==='transferred'?'до передачи':'до завершения'):'с создания'}</small><small class="queue-late" data-delay="${esc(r.id)}" ${overdue(r)?'':'hidden'}>5+ минут</small></span>${icon('arrow')}</button>`;
  }
  function queueResults(){
    const requests=state.requests.filter(r=>r.store===warehouseActor().store);
    const filtered=filteredQueue();
    const count=type=>requests.filter(r=>matchesQueue(r,type)).length;
    let empty;
    if(ui.queueTab==='work')empty=['Нет запросов в работе','Принятые запросы появятся здесь. Новые доступны во вкладке «Активные».',count('active')?'<button class="secondary" data-action="queue-tab" data-tab="active">К активным запросам</button>':''];
    else if(ui.queueTab==='complete')empty=['История пока пуста','После подтверждения передачи запрос переместится сюда.',count('active')?'<button class="secondary" data-action="queue-tab" data-tab="active">К активным запросам</button>':''];
    else if(count('complete'))empty=['Все запросы выполнены','Подтверждённые передачи сохранены в истории.','<button class="secondary" data-action="queue-tab" data-tab="complete">Посмотреть завершённые</button>'];
    else empty=['Новых запросов пока нет','Запросы появятся после отправки продавцом. Очередь обновляется автоматически.',''];
    if(!filtered.length&&normalizeSearch(ui.queueQuery))return `<div class="empty queue-no-results"><div class="empty-illustration">${icon('search')}</div><h3>Ничего не найдено</h3><p>По запросу «${esc(ui.queueQuery.trim())}» в этой вкладке нет совпадений. Измените запрос или вкладку${ui.queueLateOnly?' либо снимите фильтр ожидания':''}.</p><div class="queue-empty-actions"><button class="secondary" data-action="queue-clear">Очистить поиск</button>${ui.queueLateOnly?'<button class="secondary" data-action="queue-late">Снять фильтр 5+ минут</button>':''}</div></div>`;
    if(!filtered.length&&ui.queueLateOnly)return `<div class="empty queue-no-results"><div class="empty-illustration">${icon('clock')}</div><h3>Нет ожидания от 5 минут</h3><p>Здесь появятся активные запросы, которым исполнилось пять минут с момента создания.</p><button class="secondary" data-action="queue-late">Снять фильтр 5+ минут</button></div>`;
    return `${filtered.length?`<div class="queue-row queue-label"><span>Запрос / товар</span><span>Состояние</span><span>Время</span><span></span></div>${filtered.map(queueRow).join('')}`:`<div class="empty"><div class="empty-illustration">${icon(ui.queueTab==='complete'?'clock':count('complete')?'check':'box')}</div><h3>${empty[0]}</h3><p>${empty[1]}</p>${empty[2]}</div>`}`;
  }
  function queueContent(){
    const requests=state.requests.filter(r=>r.store===warehouseActor().store);
    const count=type=>requests.filter(r=>matchesQueue(r,type)).length;
    return `<div class="terminal-heading"><div><p class="section-kicker">Торговый зал → склад</p><h2>Очередь запросов</h2><p>Вариант товара, адрес хранения и продавец — в одной карточке.</p></div></div><dl class="queue-overview" aria-label="Сводка всех запросов магазина"><div class="queue-stat"><dt>Ждут принятия</dt><dd>${requests.filter(r=>r.status==='created').length}</dd></div><div class="queue-stat"><dt>В работе</dt><dd>${requests.filter(r=>r.status==='work').length}</dd></div><div class="queue-stat"><dt>Готовы к передаче</dt><dd>${requests.filter(r=>r.status==='ready').length}</dd></div></dl><div class="queue-view-options"><button class="queue-late-toggle" id="queue-late-toggle" data-action="queue-late" aria-pressed="${ui.queueLateOnly}" ${ui.queueTab==='complete'?'disabled':''}>${icon('clock')}5+ минут<span class="count" id="queue-late-count">${queueRecords().filter(matchesSearch).filter(overdue).length}</span></button><label class="sr-only" for="queue-order">Порядок запросов по времени создания</label><select class="queue-order" id="queue-order"><option value="oldest" ${ui.queueOrder==='oldest'?'selected':''}>Давние сверху</option><option value="newest" ${ui.queueOrder==='newest'?'selected':''}>Новые сверху</option></select></div><div class="queue-controls" id="queue-controls"><label class="sr-only" for="queue-search">Поиск по номеру запроса, артикулу, названию товара или продавцу</label><div class="search-wrap queue-search-wrap">${icon('search')}<input class="search-input" id="queue-search" type="search" placeholder="Найти запрос" value="${esc(ui.queueQuery)}" autocomplete="off" aria-controls="queue-results"><button class="queue-search-clear" id="queue-search-clear" data-action="queue-clear" aria-label="Очистить поиск" ${ui.queueQuery?'':'hidden'}><span aria-hidden="true">×</span></button></div><div class="queue-tabs">${[['active','Активные'],['work','В работе'],['complete','Завершённые']].map(([tab,label])=>`<button data-action="queue-tab" data-tab="${tab}" aria-pressed="${tab===ui.queueTab}">${label}<span class="count">${count(tab)}</span></button>`).join('')}</div><p class="queue-result-count" id="queue-result-count" role="status" aria-live="polite" aria-atomic="true">${queueResultCount()}</p></div><div id="queue-results">${queueResults()}</div><div class="queue-summary">Магазин 01 · по времени создания</div>`;
  }
  function findQueueRow(id){return Array.from(document.querySelectorAll('[data-action=warehouse-request]')).find(el=>el.dataset.id===id);}
  function updateQueueLocate(){
    const warehouse=document.getElementById('warehouse-app'),scroll=warehouse.querySelector('.queue-scroll'),controls=document.getElementById('queue-controls');
    if(scroll&&controls)scroll.style.setProperty('--queue-controls-height',controls.offsetHeight+'px');
    const button=document.getElementById('queue-locate');if(!button)return;
    const list=warehouse.querySelector('.warehouse-list');
    if(ui.warehouse!=='request'||!list?.getClientRects().length){button.hidden=true;return;}
    const row=findQueueRow(ui.warehouseId);
    if(!row){button.hidden=false;return;}
    const view=scroll.getBoundingClientRect(),bar=controls.getBoundingClientRect(),rect=row.getBoundingClientRect();
    const viewport=globalThis.visualViewport,top=viewport?.offsetTop||0,bottom=viewport?top+viewport.height:(globalThis.innerHeight??view.bottom);
    button.hidden=rect.top>=Math.max(view.top,bar.bottom,top)&&rect.bottom<=Math.min(view.bottom,bottom);
  }
  function refreshQueueResults(resetScroll=false){
    document.getElementById('queue-results').innerHTML=queueResults();
    document.getElementById('queue-result-count').textContent=queueResultCount();
    document.getElementById('queue-search-clear').hidden=!ui.queueQuery;
    document.getElementById('queue-late-count').textContent=queueRecords().filter(matchesSearch).filter(overdue).length;
    document.getElementById('queue-late-toggle').setAttribute('aria-pressed',String(ui.queueLateOnly));
    queueResultKey=queueKey();
    if(resetScroll){
      Object.keys(queuePositions).forEach(key=>queuePositions[key]=0);
      const scroll=document.getElementById('warehouse-app').querySelector('.queue-scroll');
      scroll.scrollTop=resetScroll==='top'?0:Math.max(0,document.getElementById('queue-results').offsetTop-document.getElementById('queue-controls').offsetHeight);
      queuePositions[ui.queueTab]=scroll.scrollTop;
    }
    updateQueueLocate();
  }
  function warehouseRequest(r){
    const s=serviceFor(r);
    const copy={created:['Начните поиск','Примите запрос, чтобы начать поиск нужного варианта.','Принять в работу','accept'],work:['Проверьте нужный вариант','Отметьте готовность, когда вещь с нужным размером и цветом подобрана.','Готов к передаче','ready'],ready:['Передайте товар продавцу','Подтвердите действие только после фактической передачи вещи.','Подтвердить передачу','handoff'],transferred:['Передача завершена','Фактическая передача подтверждена. История запроса сохранена.','','']};
    const [heading,note,button,action]=copy[r.status]||[];
    const notice=ui.actionNotice?.id===r.id?`<p class="action-confirmation" role="status">${icon('check')}${esc(ui.actionNotice.text)}</p>`:'';
    if(E.finalStates.includes(r.status)){
      const next=nextActive(r.id);
      return {content:`${outcomeSummary(r)}${linkedCases(r)}${warehouseMore(r)}`,
        action:`<section class="terminal-action transferred" aria-label="После передачи"><div class="action-copy"><h3>${r.status==='transferred'?'Передача подтверждена':'Поиск завершён'}</h3>${notice}${localError('warehouse',r.id)}<p>${next?`Следующий доступный запрос · ${esc(next.id)}`:'Следующий доступный запрос не найден.'}</p></div>${next?`<button class="primary" data-action="next-request">Следующий запрос ${icon('arrow')}</button>`:'<button class="secondary" data-action="queue">К очереди</button>'}</section>`};
    }
    return {content:`${delay(r)}${r.status==='created'?missWarning(r.variant):''}<div class="terminal-request-head"><div><p class="section-kicker">Выдача со склада</p><h2 data-request-title tabindex="-1">Запрос ${esc(r.id)}</h2><p>${esc(r.serviceId)} · создан в ${shortTime(r.createdAt)}</p></div>${badge(r.status)}</div><div class="terminal-details"><div><section class="pick-summary" aria-label="Что найти"><p class="section-kicker">Что найти</p>${itemLine(r.variant)}</section>${placementPanel(r)}<section class="handoff-card" aria-label="Кому передать"><div class="handoff-icon">${icon('arrow')}</div><div><p class="section-kicker">Кому передать</p><strong>${esc(s?.sellerName||'Продавец')}</strong><p>${esc(r.place)}</p></div></section>${facts([['Исполнитель',esc(r.workerName||'Ещё не назначен')],[E.finalStates.includes(r.status)?'До передачи':'С момента создания',elapsed(r)]])}${searchContext(r)}</div><aside class="history-column"><div class="section-heading"><h3>История запроса</h3><span>${r.history.length}</span></div>${history(r)}</aside></div>${transferPanel(r,'search')}${linkedCases(r)}${warehouseMore(r)}`,action:`<section class="terminal-action ${r.status}" aria-label="Действие по запросу"><div class="action-copy"><h3>${r.cancel?.status==='pending'?'Сверьте фактический исход':heading}</h3>${notice}${localError('warehouse',r.id)}<p>${r.cancel?.status==='pending'?'Не подтверждайте отмену или выдачу до выяснения фактов.':r.workerId&&r.workerId!==warehouseActor().id?`Поиск ведёт ${esc(r.workerName)}. Действие доступно текущему исполнителю.`:esc(note)}</p></div>${r.cancel?.status==='pending'?(r.workerId===warehouseActor().id?operationButton('resolve-cancel',r.id,'Разрешить отмену',true):'<p>Ожидает решения текущего исполнителя.</p>'):button?`<button class="primary" data-action="${action}" data-id="${esc(r.id)}" ${r.workerId&&r.workerId!==warehouseActor().id?'disabled':''}>${esc(button)}${icon(action==='accept'?'arrow':'check')}</button>`:`<button class="secondary" data-action="queue">Вернуться к очереди</button>`}</section>`};
  }
  function warehouseScreen(){
    if(ui.pendingAction&&!ui.pendingAction.before)return terminalShell('<div class="terminal-scroll detail-scroll"><h2 data-request-title tabindex="-1">Нужно уточнить результат</h2><p>До сверки сохранённого действия текущее состояние не подтверждено.</p></div>'+pendingBanner('warehouse'));
    if(['senior','manager'].includes(warehouseActor().role)){const detail=ui.operations.warehouse?operationEditor('warehouse'):supervisoryScreen();return terminalShell(`<div class="terminal-scroll detail-scroll supervisor-scroll">${ui.operations.warehouse?'<button class="operation-back" data-action="operation-back" data-role="warehouse">К карточке</button>':''}${detail.content}</div>${pendingBanner('warehouse')||(detail.action?`<section class="terminal-action operation-action">${detail.action}</section>`:'')}`);}
    const request=ui.warehouse==='request'?state.requests.find(r=>r.id===ui.warehouseId&&r.store===warehouseActor().store):null;
    let detail=request?warehouseRequest(request):null;const editor=ui.operations.warehouse?operationEditor('warehouse'):null;if(editor)detail={content:editor.content,action:`<section class="terminal-action operation-action">${editor.action}</section>`};
    const tools=editor?`<div class="detail-tools"><button class="terminal-back" data-action="operation-back" data-role="warehouse">${icon('back')}К запросу</button></div>`:`<div class="detail-tools"><button class="terminal-back" data-action="queue">${icon('back')}<span class="back-label">К очереди</span><span class="close-label">Закрыть карточку</span></button><button class="queue-locate" id="queue-locate" data-action="queue-locate" hidden>Показать в очереди</button></div>`;
    const empty=`<div class="detail-placeholder"><div class="empty-illustration">${icon('box')}</div><h2>Выберите запрос</h2><p>Здесь появятся вариант товара, адрес хранения и действия по выдаче.</p></div>`;
    return terminalShell(`<div class="warehouse-layout" data-screen="${detail?'request':'queue'}"><section class="warehouse-list" aria-label="Очередь запросов"><div class="terminal-scroll queue-scroll">${queueContent()}</div></section><section class="warehouse-detail" id="warehouse-detail" aria-label="Карточка запроса">${detail?tools:''}<div class="terminal-scroll detail-scroll">${detail?detail.content:empty}</div>${pendingBanner('warehouse')||(detail?detail.action:'')}</section></div>`);
  }
  function render(options={}){
    for(const role of ['seller','warehouse'])if(ui.operations[role])captureDraft(document.getElementById('operation-form-'+role));
    const editFocus=document.activeElement?.form?.dataset?.command&&document.activeElement.name?{role:operationRole(document.activeElement.form.dataset.command,document.activeElement.form.dataset.role),name:document.activeElement.name,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
    const phone=document.getElementById('seller-app'),warehouse=document.getElementById('warehouse-app');
    const phoneScroll=phone.querySelector('.phone-scroll')?.scrollTop||0;
    const queueScroll=warehouse.querySelector('.queue-scroll')?.scrollTop||0;
    const detailScroll=warehouse.querySelector('.detail-scroll')?.scrollTop||0;
    const active=document.activeElement;
    const searchFocus=!options.operationFocus&&!options.operationDone&&!options.errorRole&&!options.focusDetail&&!options.stateChange&&!options.restoreQueueFocus&&active?.id==='queue-search'?{start:active.selectionStart,end:active.selectionEnd}:null;
    const focus=options.preserveFocus&&active?.dataset?.action?{...active.dataset}:null;
    phone.innerHTML=seller();phone.querySelector('.phone-scroll').scrollTop=options.top?0:phoneScroll;
    warehouse.innerHTML=warehouseScreen();
    if(warehouse.querySelector('.queue-scroll'))warehouse.querySelector('.queue-scroll').scrollTop=options.warehouseScroll??queueScroll;
    warehouse.querySelector('.detail-scroll').scrollTop=options.warehouseTop?0:detailScroll;
    phone.dataset.update=options.selection?'selection':'';
    warehouse.dataset.update=options.stateChange?'state':'';
    if(focus){const target=Array.from(document.querySelectorAll('[data-action]')).find(el=>Object.entries(focus).every(([key,value])=>el.dataset[key]===value));target?.focus({preventScroll:true});}
    if(options.restoreQueueFocus){
      const row=Array.from(document.querySelectorAll('[data-action=warehouse-request]')).find(el=>el.dataset.id===queueFocusId);
      const tab=Array.from(document.querySelectorAll('[data-action=queue-tab]')).find(el=>el.dataset.tab===ui.queueTab);
      (row||tab)?.focus({preventScroll:true});
    }
    if(options.focusDetail)warehouse.querySelector('[data-request-title]')?.focus({preventScroll:true});
    if(searchFocus){const input=document.getElementById('queue-search');input?.focus({preventScroll:true});if(input&&typeof searchFocus.start==='number')input.setSelectionRange(searchFocus.start,searchFocus.end);}
    if(options.errorRole){const role=options.errorRole,target=document.getElementById('operation-error-'+role);target?.focus({preventScroll:true});if(ui.operations[role]&&target){const pane=document.getElementById(role==='seller'?'seller-app':'warehouse-app').querySelector(role==='seller'?'.phone-scroll':'.detail-scroll');pane.scrollTop=Math.max(0,pane.scrollTop+target.getBoundingClientRect().top-pane.getBoundingClientRect().top-8);}}
    else if(options.operationFocus){document.getElementById('operation-title-'+options.operationFocus)?.focus({preventScroll:true});document.getElementById(options.operationFocus==='seller'?'seller-app':'warehouse-app').querySelector(options.operationFocus==='seller'?'.phone-scroll':'.detail-scroll').scrollTop=0;}
    else if(editFocus&&ui.operations[editFocus.role]){const field=document.getElementById('operation-form-'+editFocus.role)?.elements?.namedItem(editFocus.name);field?.focus({preventScroll:true});if(typeof editFocus.start==='number')field?.setSelectionRange?.(editFocus.start,editFocus.end);}
    else if(options.operationDone){const target=document.getElementById(options.operationDone==='seller'?'seller-app':'warehouse-app').querySelector(options.operationDone==='seller'?'.phone-nav h3':'[data-request-title]');target?.setAttribute('tabindex','-1');target?.focus({preventScroll:true});}
    syncKeyboardLayout();
    document.getElementById('workspaces').dataset.view=ui.view;
    document.getElementById('seller-actor-caption').textContent='iPod · '+sellerActor().name;document.getElementById('warehouse-title').textContent=({senior:'Старший склада',manager:'Руководитель смены'})[warehouseActor().role]||'Сотрудник склада';document.getElementById('warehouse-actor-caption').textContent='Терминал · '+warehouseActor().name;document.getElementById('demo-seller').value=sellerActor().id;document.getElementById('demo-warehouse').value=warehouseActor().id;for(const name of ['stock','catalog','relations','placement'])document.getElementById('demo-'+name).value=state.demoSources?.[name]||E.sourceDefaults[name];document.getElementById('demo-connection').value=ui.networkMode;
    document.querySelectorAll('[data-action=view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===ui.view)));
    const latest=state.requests.at(-1);const latestService=serviceFor(latest);const progress=!latest?0:latestService?.status==='closed'?5:(E.finalStates.includes(latest.status)?4:({created:1,work:2,ready:3}[latest.status]||0));
    document.getElementById('journey').innerHTML=['Создать запрос','Принять','Готовность','Передать','Завершить'].map((label,i)=>`<div class="journey-step ${i<progress?'done':i===progress?'current':''}"${i===progress?' aria-current="step"':''}><span class="step-dot">${i<progress?'✓':i+1}</span><span>${label}</span></div>`).join('');
    queueResultKey=queueKey();
    warehouse.querySelector('.queue-scroll')?.addEventListener('scroll',updateQueueLocate,{passive:true});
    updateQueueLocate();if(ui.pendingAction)document.querySelectorAll('[data-action=send],[data-action=accept],[data-action=ready],[data-action=handoff],[data-action=finish],[data-action=case-claim],button[type=submit]').forEach(button=>button.disabled=true);
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');if(!button)return;event.preventDefault();if(button.disabled||event.detail>1)return;
    const a=button.dataset.action;
    if(a==='reconcile-pending'||a==='retry-pending'){reconcilePending(a==='retry-pending');return;}
    if(a==='operation-open'){
      const type=button.dataset.type;if(!operationNames[type])return;const role=operationRole(type,button.dataset.role);
      if(!memoryOnly)adoptState(load());if(type==='close-case'){const c=(state.cases||[]).find(c=>c.id===button.dataset.id);if(c)refreshPlacement(c.variantId);}
      const pane=document.getElementById(role==='seller'?'seller-app':'warehouse-app').querySelector(role==='seller'?'.phone-scroll':'.detail-scroll');
      ui.actionErrors[role]=null;ui.operations[role]={type,id:button.dataset.id,returnScroll:pane.scrollTop};if(['report-issue','not-found'].includes(type)){const r=state.requests.find(r=>r.id===button.dataset.id);if(r)ui.operations[role].sourcePlacement=JSON.parse(JSON.stringify(placementSnapshot(r)));}render({operationFocus:role});return;
    }
    if(a==='operation-back'){
      const role=button.dataset.role||(ui.operations.seller?'seller':'warehouse'),op=ui.operations[role];if(!op)return;
      captureDraft(document.getElementById('operation-form-'+role));ui.operations[role]=null;render();
      const app=document.getElementById(role==='seller'?'seller-app':'warehouse-app');app.querySelector(role==='seller'?'.phone-scroll':'.detail-scroll').scrollTop=op.returnScroll;
      const opener=Array.from(document.querySelectorAll('[data-action=operation-open]')).find(el=>el.dataset.type===op.type&&el.dataset.id===op.id);
      if(opener){const menu=opener.closest?.('details');if(menu)menu.open=true;opener.focus({preventScroll:true});}else{const title=app.querySelector(role==='seller'?'.phone-nav h3':'[data-request-title]');title?.setAttribute('tabindex','-1');title?.focus({preventScroll:true});}app.querySelector(role==='seller'?'.phone-scroll':'.detail-scroll').scrollTop=op.returnScroll;return;
    }
    const navigatesSeller=['home','start','service','seller-request','open-service','read-result'].includes(a),navigatesWarehouse=['queue','queue-tab','warehouse-request','next-request'].includes(a);
    for(const role of [navigatesSeller?'seller':null,navigatesWarehouse?'warehouse':null].filter(Boolean)){
      if(ui.operations[role])captureDraft(document.getElementById('operation-form-'+role));ui.operations[role]=null;ui.actionErrors[role]=null;
    }

    if(['warehouse-request','queue','next-request'].includes(a))ui.actionNotice=null;
    if(['warehouse-request','queue-tab','next-request'].includes(a))queuePositions[ui.queueTab]=document.getElementById('warehouse-app').querySelector('.queue-scroll').scrollTop;
    if(a==='warehouse-request')queueFocusId=button.dataset.id;
    if(a==='reset'){if(ui.pendingAction){message('Сначала уточните результат действия; очистка временно недоступна.',true);return;}document.getElementById('reset-dialog').showModal();return;}
    if(a==='view'){ui.view=button.dataset.view;render();return;}
    if(a==='queue-late'){
      if(ui.queueTab==='complete')return;
      ui.queueLateOnly=!ui.queueLateOnly;refreshQueueResults('top');document.getElementById('queue-late-toggle').focus({preventScroll:true});return;
    }
    if(a==='queue-clear'){
      ui.queueQuery='';const input=document.getElementById('queue-search');input.value='';refreshQueueResults(true);input.focus({preventScroll:true});return;
    }
    if(a==='queue-locate'){
      if(!memoryOnly)adoptState(load());
      const selected=state.requests.find(r=>r.id===ui.warehouseId&&r.store===warehouseActor().store);if(!selected)return;
      queuePositions[ui.queueTab]=document.getElementById('warehouse-app').querySelector('.queue-scroll').scrollTop;
      if(!matchesQueue(selected))ui.queueTab=E.finalStates.includes(selected.status)?'complete':'active';
      ui.queueQuery='';ui.queueLateOnly=false;render({warehouseScroll:queuePositions[ui.queueTab]});
      const row=findQueueRow(selected.id),scroll=document.getElementById('warehouse-app').querySelector('.queue-scroll'),controls=document.getElementById('queue-controls');
      if(row){scroll.scrollTop=Math.max(0,scroll.scrollTop+row.getBoundingClientRect().top-scroll.getBoundingClientRect().top-controls.offsetHeight-12);row.focus({preventScroll:true});queuePositions[ui.queueTab]=scroll.scrollTop;}
      updateQueueLocate();return;
    }
    if(a==='alternatives'){const r=state.requests.find(r=>r.id===(button.dataset.id||ui.alternativeOriginId||ui.requestId));if(!r||serviceFor(r)?.sellerId!==sellerActor().id)return;ui.alternativeOriginId=r.id;ui.serviceId=r.serviceId;ui.seller='alternatives';}
    else if(a==='choose-alternative'){const item=E.variant(button.dataset.variant);ui.productId=item.productId;ui.color=Number(item.id.split('~')[1]);ui.size=item.size;ui.customerAgreed=false;ui.stockAttempt=null;ui.place='';ui.seller='new-request';}
    else if(a==='review-service'){ui.reviewServiceId=button.dataset.id;ui.reviewRequestId=null;}
    else if(a==='review-request'){ui.reviewServiceId=null;ui.reviewRequestId=button.dataset.id;}
    else if(a==='review-back'){ui.reviewRequestId=null;ui.reviewServiceId=null;}
    else if(a==='case-open'){ui.caseId=button.dataset.id;const c=(state.cases||[]).find(c=>c.id===ui.caseId);if(c)refreshPlacement(c.variantId);}
    else if(a==='case-back'){ui.caseId=null;}
    else if(a==='case-claim'){if(!transact('claim-case',{caseId:button.dataset.id},warehouseActor()))return;ui.caseId=button.dataset.id;}
    else if(a==='home'){ui.seller='home';ui.homeTab='active';}
    else if(a==='start'){ui.alternativeOriginId=null;ui.customerAgreed=false;ui.stockAttempt=null;ui.serviceId=null;ui.query='';ui.seller='catalog';}
    else if(a==='add-item'){ui.alternativeOriginId=null;ui.stockAttempt=null;ui.query='';ui.seller='catalog';}
    else if(a==='home-tab'){ui.homeTab=button.dataset.tab;ui.seller='home';}
    else if(a==='catalog'){ui.seller='catalog';}
    else if(a==='product'){ui.productId=button.dataset.id;ui.color=0;ui.size='M';ui.seller='product';}
    else if(a==='back-product'){ui.seller='product';}
    else if(a==='color'){ui.color=Number(button.dataset.index);}
    else if(a==='size'){ui.size=button.dataset.size;}
    else if(a==='prepare'){ui.place='';ui.seller='new-request';}
    else if(a==='refresh-stock'){if(!transact('read-stock',{variantId:selectedVariant().id,serviceId:ui.serviceId},sellerActor()))return;render();return;}
    else if(a==='send'){sendPrepared();return;}
    else if(a==='service'){if(ui.requestId)ui.serviceId=state.requests.find(r=>r.id===ui.requestId)?.serviceId||ui.serviceId;ui.seller='service';}
    else if(a==='open-service'){ui.serviceId=button.dataset.id;ui.requestId=null;ui.seller='service';}
    else if(a==='seller-request'||a==='read-result'){markRequestResults(button.dataset.id);ui.requestId=button.dataset.id;ui.serviceId=state.requests.find(r=>r.id===ui.requestId)?.serviceId||ui.serviceId;ui.seller='request';}
    else if(a==='finish'){const output=transact('finish-service',{serviceId:ui.serviceId},sellerActor());if(!output)return;ui.seller='service';}
    else if(a==='queue'){ui.warehouse='queue';ui.warehouseId=null;}
    else if(a==='queue-tab'){ui.queueTab=button.dataset.tab;if(ui.queueTab==='complete')ui.queueLateOnly=false;const selected=state.requests.find(r=>r.id===ui.warehouseId);if(!selected||!matchesQueue(selected)){ui.warehouse='queue';ui.warehouseId=null;}}
    else if(a==='warehouse-request'){ui.warehouseId=button.dataset.id;placementReadAt[ui.warehouseId]=new Date().toISOString();ui.warehouse='request';const r=state.requests.find(r=>r.id===ui.warehouseId);if(r)refreshPlacement(r.variant.id);}
    else if(a==='next-request'){
      if(!memoryOnly)adoptState(load());
      const current=state.requests.find(r=>r.id===ui.warehouseId&&r.store===warehouseActor().store);
      if(!current||!E.finalStates.includes(current.status))return;
      const next=nextActive(current.id);ui.queueTab='active';ui.queueQuery='';ui.queueLateOnly=false;
      ui.warehouseId=next?.id||null;ui.warehouse=next?'request':'queue';queueFocusId=next?.id||null;
      if(next)placementReadAt[next.id]=new Date().toISOString();
    }
    else if(['accept','ready','handoff'].includes(a)){ui.actionNotice=null;if(!transact(a,{requestId:button.dataset.id},warehouseActor()))return;ui.actionNotice={id:button.dataset.id,text:{accept:'Запрос принят. Вы назначены исполнителем.',ready:'Готовность сохранена. Осталось передать товар продавцу.',handoff:'Фактическая передача сохранена.'}[a]};}
    else return;
    render({top:!['color','size','queue-tab','accept','ready','handoff'].includes(a),warehouseTop:['warehouse-request','next-request'].includes(a),focusDetail:['warehouse-request','next-request'].includes(a)&&Boolean(ui.warehouseId),warehouseScroll:['queue','queue-tab','next-request'].includes(a)?queuePositions[ui.queueTab]:undefined,restoreQueueFocus:a==='queue'||(a==='next-request'&&!ui.warehouseId),preserveFocus:['color','size','queue-tab','home-tab'].includes(a),selection:['color','size'].includes(a),stateChange:['accept','ready','handoff'].includes(a)});
  });
  document.addEventListener('submit',event=>{
    const form=event.target;if(!form.dataset.command)return;event.preventDefault();
    captureDraft(form);const originalType=form.dataset.command;let type=originalType;const field=name=>form.elements.namedItem(name),value=name=>field(name)?.value||'';
    const service=type.endsWith('-service');
    const pane=form.dataset.role||operationRole(type);const actor=roleActor(pane);
    let payload={...(type==='close-case'?{caseId:form.dataset.id}:service?{serviceId:form.dataset.id}:{requestId:form.dataset.id}),comment:value('comment'),reason:value('reason'),toId:value('toId'),offerId:value('offerId'),decision:event.submitter?.value||value('decision'),outcome:value('outcome'),factsConfirmed:field('factsConfirmed')?.checked===true,managerAssisted:field('managerAssisted')?.checked===true,issueType:value('issueType'),actualShelf:value('actualShelf'),actualSection:value('actualSection'),result:value('result'),correctionDone:field('correctionDone')?.checked===true,accountingRef:value('accountingRef')};
    if(type==='stock-warning'){if(!ui.stockAttempt)return;type='create';payload={...ui.stockAttempt.prepared,stockAttemptId:ui.stockAttempt.id,stockConfirmed:field('stockConfirmed')?.checked===true};}
    if(['report-issue','not-found'].includes(type)){const r=state.requests.find(r=>r.id===payload.requestId);if(r)payload.sourcePlacement=ui.operations[pane]?.sourcePlacement||placementSnapshot(r);}
    ui.actionNotice=null;const output=transact(type,payload,actor);if(!output)return;
    if(type==='create')revealResult(output,actor,{type});if(type==='close-case'){ui.caseId=output.id;const c=(state.cases||[]).find(c=>c.id===output.id);if(c)refreshPlacement(c.variantId);}
    if(!service)ui.actionNotice={id:type==='report-issue'?payload.requestId:output.id,text:type==='not-found'?'Исход «Не найдено» сохранён.':type==='resolve-cancel'?'Фактический исход сохранён.':'Изменение сохранено.'};
    const role=actorPane(actor);if(operationNames[originalType]){delete ui.drafts[draftKey(role,originalType,form.dataset.id)];ui.operations[role]=null;}
    render({stateChange:true,operationDone:role});
  });
  document.addEventListener('input',event=>{captureDraft(event.target.form);if(event.target.id==='product-search'){ui.query=event.target.value;document.getElementById('catalog-list').innerHTML=catalogList();}else if(event.target.id==='queue-search'){ui.queueQuery=event.target.value;refreshQueueResults(true);}});
  document.addEventListener('change',event=>{captureDraft(event.target.form);const setting=event.target.id?.replace(/^demo-/,'');
    if(['stock','catalog','relations','placement'].includes(setting)){
      if(ui.pendingAction){message('Сначала уточните результат действия.',true);render();return;}
      if(!memoryOnly)adoptState(load());state=E.configureSources(state,{[setting]:event.target.value});save(state);if(setting==='placement')refreshQueuePlacements();render();return;
    }
    if(setting==='connection'){ui.networkMode=event.target.value;render();return;}
    if(event.target.id==='alternative-agreed'){ui.customerAgreed=event.target.checked;const button=document.querySelector('[data-action=send]');if(button)button.disabled=!ui.place||!ui.customerAgreed;return;}
    if(event.target.form&&['issueType','correctionDone'].includes(event.target.name)){render({preserveFocus:true});return;}
if(['demo-seller','demo-warehouse'].includes(event.target.id)){const role=event.target.id==='demo-seller'?'seller':'warehouse';if(!E.staff.some(a=>a.id===event.target.value&&(a.role===role||(role==='warehouse'&&['senior','manager'].includes(a.role)))))return;if(ui.operations[role])captureDraft(document.getElementById('operation-form-'+role));ui.operations[role]=null;ui.actionErrors[role]=null;if(role==='seller'){ui.sellerActorId=event.target.value;ui.seller='home';ui.serviceId=null;ui.requestId=null;}else{ui.warehouseActorId=event.target.value;ui.warehouse='queue';ui.warehouseId=null;ui.caseId=null;ui.reviewRequestId=null;ui.reviewServiceId=null;ui.actionNotice=null;}render();}else if(event.target.id==='queue-order'){if(['oldest','newest'].includes(event.target.value)){ui.queueOrder=event.target.value;refreshQueueResults('top');}}else if(event.target.id==='handoff-place'){ui.place=event.target.value;const send=document.querySelector('[data-action=send]');if(send)send.disabled=!ui.place||(Boolean(ui.alternativeOriginId)&&!ui.customerAgreed);}});
  document.getElementById('reset-dialog').addEventListener('close',event=>{if(event.target.returnValue!=='confirm'||ui.pendingAction)return;state=E.initial();pendingSavedState=null;save(state);Object.assign(ui,{seller:'home',homeTab:'active',serviceId:null,requestId:null,warehouse:'queue',warehouseId:null,queueTab:'active',queueQuery:'',queueLateOnly:false,queueOrder:'oldest',actionNotice:null,operations:{seller:null,warehouse:null},drafts:{},actionErrors:{seller:null,warehouse:null},alternativeOriginId:null,customerAgreed:false,stockAttempt:null,placements:{},caseId:null,reviewRequestId:null,reviewServiceId:null,pendingAction:null,networkMode:'online'});message('Демонстрация начата заново.');render({top:true});});
  window.addEventListener('storage',event=>{if(!stressMode&&event.key===key){adoptState(load());render();}});
  setInterval(()=>{document.querySelectorAll('[data-search-summary]').forEach(el=>{const html=searchSummaryBody(E.variant(el.dataset.searchSummary));if(el.innerHTML!==html)el.innerHTML=html;});document.querySelectorAll('[data-miss-until]').forEach(el=>el.hidden=Date.now()>=Number(el.dataset.missUntil));document.querySelectorAll('[data-age]').forEach(el=>el.textContent=age(el.dataset.age));document.querySelectorAll('[data-delay]').forEach(el=>{const r=state.requests.find(r=>r.id===el.dataset.delay);el.hidden=!r||!overdue(r);});document.querySelectorAll('[data-request-row]').forEach(el=>{const r=state.requests.find(r=>r.id===el.dataset.requestRow);el.classList.toggle('is-overdue',Boolean(r&&overdue(r)));});if(document.getElementById('queue-results')){if(ui.queueLateOnly&&queueKey()!==queueResultKey)refreshQueueResults(false);else {const count=document.getElementById('queue-late-count');if(count)count.textContent=queueRecords().filter(matchesSearch).filter(overdue).length;}}},1000);
  function syncKeyboardLayout(){
    const viewport=globalThis.visualViewport;if(!viewport)return;
    const phone=document.getElementById('seller-app'),active=document.activeElement;
    const focused=Boolean(active&&phone.contains(active)&&/^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName)&&globalThis.matchMedia('(max-width:820px)').matches);
    phone.dataset.keyboard=String(focused);
    if(focused)phone.style.setProperty('--phone-available-height',`${Math.max(220,Math.min(650,Math.floor(viewport.height-48)))}px`);
    else phone.style.removeProperty('--phone-available-height');
    const warehouse=document.getElementById('warehouse-app');
    const queueInput=Boolean(active&&warehouse.contains(active)&&(active.id==='queue-search'||/^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName))&&globalThis.matchMedia('(max-width:820px)').matches);
    warehouse.dataset.keyboard=String(queueInput);
    if(queueInput)warehouse.style.setProperty('--terminal-available-height',`${Math.max(220,Math.min(692,Math.floor(viewport.height-32)))}px`);
    else warehouse.style.removeProperty('--terminal-available-height');
    updateQueueLocate();
  }
  window.addEventListener('resize',updateQueueLocate);
  window.addEventListener('scroll',updateQueueLocate,{passive:true});
  if(globalThis.visualViewport){
    visualViewport.addEventListener('resize',syncKeyboardLayout);
    visualViewport.addEventListener('scroll',updateQueueLocate,{passive:true});
    document.addEventListener('focusin',syncKeyboardLayout);
    document.addEventListener('focusout',()=>requestAnimationFrame(syncKeyboardLayout));
  }
  if(stressMode){
    document.body.dataset.demo='stress';
    document.querySelector('.demo-info strong').textContent='Проверочная очередь · 20 запросов';
    document.querySelector('.demo-info span:not(.info-dot)').textContent='Синтетические данные · изменения только в этой вкладке';
    const link=document.getElementById('fixture-link');link.href='./';link.textContent='К обычному макету';
    document.querySelector('#reset-dialog h2').textContent='Очистить проверочную очередь?';
    document.querySelector('#reset-dialog p').textContent='Будут очищены только проверочные данные этой вкладки. Сохранённые запросы обычного макета останутся на месте.';
  }
  render();if(memoryOnly)message('Хранилище браузера недоступно: изменения действуют в этой вкладке.');
})();
