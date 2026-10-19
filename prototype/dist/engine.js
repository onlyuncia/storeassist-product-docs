(function(root){
  'use strict';
  const catalog=[
    {id:'cotton-shirt',name:'Рубашка из хлопка',article:'ST-0418',kind:'shirt',colors:[{name:'Белый',hex:'#f5f2e9'},{name:'Тёмно-синий',hex:'#3f4e5c'}],sizes:['S','M','L'],shelf:'B-04',section:'Секция 2'},
    {id:'straight-trousers',name:'Брюки прямого кроя',article:'ST-0521',kind:'trousers',colors:[{name:'Графит',hex:'#666965'},{name:'Песочный',hex:'#c4b6a1'}],sizes:['S','M','L'],shelf:'C-02',section:'Секция 1'},
    {id:'wool-jumper',name:'Джемпер с шерстью',article:'ST-0734',kind:'jumper',colors:[{name:'Бежевый',hex:'#c7bea9'},{name:'Серый',hex:'#9b9e96'}],sizes:['S','M','L'],shelf:'A-03',section:'Секция 3'}
  ];
  const actors={seller:{id:'seller-anna',name:'Анна',role:'seller',store:'store-01'},warehouse:{id:'warehouse-mikhail',name:'Михаил',role:'warehouse',store:'store-01'}};
  const places=['Торговый зал · зона 1','Торговый зал · зона 2','У примерочных'];
  const finalStates=['transferred','not-found','cancelled'];
  const staff=[actors.seller,{id:'seller-elena',name:'Елена',role:'seller',store:'store-01'},actors.warehouse,{id:'warehouse-pavel',name:'Павел',role:'warehouse',store:'store-01'},{id:'senior-daria',name:'Дарья',role:'senior',store:'store-01'},{id:'senior-olga',name:'Ольга',role:'senior',store:'store-01'},{id:'manager-irina',name:'Ирина',role:'manager',store:'store-01'}];
  const sourceDefaults={stock:'positive',catalog:'ready',relations:'ready',placement:'current'};
  const caseResults={'found-source':'Найден по указанному адресу','found-other':'Найден в другом месте','not-found':'После проверки не найден','no-discrepancy':'Расхождение не подтвердилось'};
  function configureSources(source,patch){
    const next=JSON.parse(JSON.stringify(source)),allowed={stock:['positive','zero','unknown','stale','stale-zero'],catalog:['ready','empty','failed'],relations:['ready','empty','failed'],placement:['current','missing','failed','updated']};
    for(const [name,value] of Object.entries(patch))demand(allowed[name]?.includes(value),'Недопустимый режим демонстрационного источника.');
    next.demoSources={...sourceDefaults,...next.demoSources,...patch};return next;
  }
  function stockFor(source,id,now=Date.now()){
    const item=variant(id),mode=source.demoSources?.stock||'positive';
    return {variantId:item.id,status:['unknown','stale','stale-zero'].includes(mode)?mode==='unknown'?'unknown':'stale':'current',quantity:['zero','stale-zero'].includes(mode)?0:mode==='unknown'?null:4,readAt:new Date(now).toISOString(),sourceUpdatedAt:mode.startsWith('stale')?new Date(now-3600000).toISOString():mode==='unknown'?null:new Date(now).toISOString()};
  }
  function alternatives(source,request,store,now=Date.now()){
    demand(request&&request.store===store,'Исходный запрос недоступен.');
    const config={...sourceDefaults,...source.demoSources};
    if(config.catalog==='failed')return {status:'failed',variants:[],relationsFailed:false};
    if(config.catalog==='empty')return {status:'empty',variants:[],relationsFailed:false};
    const links={'cotton-shirt':['wool-jumper'],'wool-jumper':['cotton-shirt'],'straight-trousers':[]};
    const ids=[request.variant.productId,...(config.relations==='ready'?links[request.variant.productId]||[]:[])];
    const variants=catalog.filter(p=>ids.includes(p.id)).flatMap(p=>p.colors.flatMap((c,i)=>p.sizes.map(size=>variant(`${p.id}~${i}~${size}`)))).filter(v=>v.id!==request.variant.id).map(v=>({...v,availability:stockFor(source,v.id,now)}));
    return {status:variants.length?'ready':'empty',variants,relationsFailed:config.relations==='failed'};
  }
  function placementFor(source,id,previous=null,now=Date.now(),store=source.store){
    demand(store===source.store,'Размещение другого магазина недоступно.');const item=variant(id),mode=source.demoSources?.placement||'current',at=new Date(now).toISOString();
    if(mode==='failed')return {...(previous||{}),variantId:id,store,error:true,attemptedAt:at,status:previous?.status||'unknown'};
    return {variantId:id,store,status:mode==='missing'?'missing':'current',shelf:mode==='missing'?null:mode==='updated'?'D-01':item.shelf,section:mode==='missing'?null:mode==='updated'?'Секция 4':item.section,receivedAt:at,sourceUpdatedAt:at,error:false};
  }
  function additional(state,actor,command,time,event){
    const r=state.requests.find(r=>r.id===command.requestId),cases=state.cases||=[],now=Date.parse(time);
    const owns=()=>demand(r&&r.store===actor.store&&actor.role==='warehouse'&&r.workerId===actor.id,'Действие доступно текущему складскому исполнителю.');
    if(command.type==='read-results'){
      demand(actor.role==='seller','Результаты читает ответственный продавец.');const service=state.services.find(s=>s.id===command.serviceId&&s.store===actor.store&&s.sellerId===actor.id);demand(service,'Обслуживание недоступно.');
      demand(Array.isArray(command.eventIds)&&command.eventIds.length>0,'Не выбраны результаты.');
      const events=resultsFor(state,actor,service.id);demand(command.eventIds.every(id=>events.some(e=>e.id===id)),'Результат другого обслуживания недоступен.');
      for(const e of state.resultEvents||[])if(command.eventIds.includes(e.id)){e.readBy||=[];if(!e.readBy.includes(actor.id))e.readBy.push(actor.id);}
      return {kind:'service',id:service.id};
    }
    if(command.type==='record-search'){
      owns();demand(r.status==='work'&&r.cancel?.status!=='pending','Отметить поиск можно в работе без ожидающей отмены.');
      const shelf=String(command.actualShelf||'').trim(),section=String(command.actualSection||'').trim(),comment=String(command.comment||'').trim();demand(shelf&&section&&shelf.length<=80&&section.length<=80&&comment.length<=1000,'Укажите проверенные стеллаж и секцию; сократите пояснение при необходимости.');
      r.searchAttempts||=[];r.searchAttempts.push({id:command.id,shelf,section,comment,at:time,actorId:actor.id,author:actor.name});r.checkedPlaces||=[];const place=shelf+' / '+section;if(!r.checkedPlaces.includes(place))r.checkedPlaces.push(place);
      r.history.push({...event('Проверено место: '+place),...(comment?{comment}:{})});return {kind:'request',id:r.id,serviceId:r.serviceId};
    }
    if(command.type==='read-stock'){
      demand(actor.role==='seller','Наличие перед отправкой проверяет продавец.');variant(command.variantId);
      const s=command.serviceId?state.services.find(s=>s.id===command.serviceId):null;
      if(command.serviceId)demand(s?.store===actor.store&&s.sellerId===actor.id&&s.status==='active','Обслуживание недоступно.');
      state.stockAttempts||=[];const attempt={...stockFor(state,command.variantId,now),id:command.id,store:actor.store,sellerId:actor.id};state.stockAttempts.push(attempt);return {kind:'stock',id:attempt.id,...attempt};
    }
    if(command.type==='return-work'){
      owns();demand(r.status==='ready','Вернуть в работу можно только готовый запрос.');const reason=String(command.reason||'').trim();demand(reason&&reason.length<=1000,'Укажите причину возврата до 1000 символов.');
      r.status='work';r.readyValid=false;r.history.push({...event('Возвращён в работу'),comment:reason});return {kind:'request',id:r.id,serviceId:r.serviceId};
    }
    if(command.type==='report-issue'){
      owns();const type=command.issueType;demand(['not-found','placement'].includes(type),'Выберите тип расхождения.');
      demand(type==='not-found'?r.status==='not-found':['work','ready','transferred'].includes(r.status),'В этом состоянии обращение недоступно.');
      const comment=String(command.comment||'').trim(),shelf=String(command.actualShelf||'').trim(),section=String(command.actualSection||'').trim();demand(comment.length<=1000&&shelf.length<=80&&section.length<=80,'Сократите сведения об обращении.');
      if(type==='placement')demand(shelf&&section&&comment,'Укажите фактические стеллаж, секцию и пояснение.');
      state.cases||=[];let c=state.cases.find(c=>c.store===actor.store&&c.variantId===r.variant.id&&c.status!=='closed');
      if(!c){const previous=state.cases.filter(c=>c.store===actor.store&&c.variantId===r.variant.id).at(-1);c={id:'C-'+String(state.cases.length+1).padStart(3,'0'),store:actor.store,variantId:r.variant.id,status:'new',ownerId:null,ownerName:null,createdAt:time,episodes:[],history:[],previousCaseId:previous?.id||null};state.cases.push(c);}
      const snapshot=command.sourcePlacement||state.placements?.[r.variant.id]||placementFor(state,r.variant.id,null,now,r.store);
      demand(snapshot.store===r.store&&snapshot.variantId===r.variant.id&&['current','missing','unknown'].includes(snapshot.status),'Снимок источника относится к другому магазину или варианту.');
      if(snapshot.status==='current')demand(typeof snapshot.shelf==='string'&&typeof snapshot.section==='string'&&snapshot.shelf.trim()&&snapshot.section.trim()&&snapshot.shelf.length<=80&&snapshot.section.length<=80&&Number.isFinite(Date.parse(snapshot.receivedAt)),'Снимок адреса источника неполон.');
      if(snapshot.status==='unknown')demand(snapshot.error===true&&snapshot.shelf==null&&snapshot.section==null,'Неизвестный адрес не должен подменяться наблюдением.');
      if(snapshot.status==='missing')demand(snapshot.shelf==null&&snapshot.section==null,'Отсутствующий адрес не должен содержать прежние значения.');
      c.episodes.push({requestId:r.id,type,at:time,author:actor.name,actorId:actor.id,source:JSON.parse(JSON.stringify(snapshot)),observed:type==='placement'?{shelf,section}:null,comment});c.history.push({...event('Добавлен эпизод: '+r.id),...(comment?{comment}:{})});
      r.caseIds||=[];if(!r.caseIds.includes(c.id))r.caseIds.push(c.id);r.history.push(event('Связано обращение '+c.id));return {kind:'case',id:c.id,requestId:r.id};
    }
    const c=cases.find(c=>c.id===command.caseId&&c.store===actor.store);demand(c&&actor.role==='senior','Проверка доступна старшему склада своего магазина.');
    if(command.type==='claim-case'){
      demand(c.status==='new'&&!c.ownerId,'Проверка уже принята.');c.status='work';c.ownerId=actor.id;c.ownerName=actor.name;c.acceptedAt=time;c.history.push(event('Проверка принята'));
    }else if(command.type==='close-case'){
      demand(c.status==='work'&&c.ownerId===actor.id,'Завершить проверку может ответственный старший.');const note=String(command.comment||'').trim(),ref=String(command.accountingRef||'').trim();
      demand(caseResults[command.result]&&note&&note.length<=1000,'Выберите результат и добавьте пояснение до 1000 символов.');demand(ref.length<=200&&(!command.correctionDone||ref),'Укажите выполненную учётную операцию или её ссылку.');
      c.status='closed';c.closedAt=time;c.result=command.result;c.comment=note;c.correctionDone=command.correctionDone===true;c.accountingRef=ref;c.history.push({...event('Проверка завершена: '+caseResults[c.result]),comment:note});
      state.placements||={};state.placements[c.variantId]=placementFor(state,c.variantId,state.placements[c.variantId],now,actor.store);
    }else throw new Error('Неизвестное действие проверки.');
    return {kind:'case',id:c.id};
  }

  function searchSummary(state,store,variantId,now=Date.now()){
    const matching=state.requests.filter(r=>r.store===store&&r.variant.id===variantId);
    const miss=matching.filter(r=>r.status==='not-found'&&Date.parse(r.notFoundAt)<=now).sort((a,b)=>Date.parse(b.notFoundAt)-Date.parse(a.notFoundAt))[0];if(!miss)return null;
    const checks=(state.cases||[]).filter(c=>c.store===store&&c.variantId===variantId&&Date.parse(c.createdAt)<=now).sort((a,b)=>Date.parse(b.closedAt||b.createdAt)-Date.parse(a.closedAt||a.createdAt));
    const check=checks.find(c=>c.episodes.some(e=>e.requestId===miss.id)||Date.parse(c.closedAt)>Date.parse(miss.notFoundAt));
    const cleared=checks.find(c=>c.status==='closed'&&['found-source','found-other','no-discrepancy'].includes(c.result)&&Date.parse(c.closedAt)>Date.parse(miss.notFoundAt)&&Date.parse(c.closedAt)<=now);
    const found=matching.flatMap(r=>[r.readyValid===false?null:r.readyAt,r.transferredAt]).filter(at=>Date.parse(at)>Date.parse(miss.notFoundAt)&&Date.parse(at)<=now).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
    const resolution=cleared?{label:caseResults[cleared.result],at:cleared.closedAt}:found?{label:'Позднее вариант найден',at:found}:null;
    const place=miss.searchAttempts?.at(-1)||miss.notFoundPlacement||miss.variant;
    return {at:miss.notFoundAt,shelf:place.shelf,section:place.section,comment:miss.notFoundComment||'',status:resolution?'resolved':now-Date.parse(miss.notFoundAt)<7200000?'active':'expired',resolution,check:check?{id:check.id,status:check.status,result:check.result||null,at:check.closedAt||check.createdAt}:null};
  }
  function recentMiss(state,store,variantId,now=Date.now()){const summary=searchSummary(state,store,variantId,now);return summary?.status==='active'?summary:null;}
  function resultsFor(state,actor,serviceId=null){
    if(actor?.role!=='seller'||actor.store!==state.store)return [];
    const own=new Set(state.services.filter(s=>s.store===actor.store&&s.sellerId===actor.id&&(!serviceId||s.id===serviceId)).map(s=>s.id));
    return (state.resultEvents||[]).filter(e=>e.store===actor.store&&own.has(e.serviceId)).slice().reverse().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  }
  function recordResults(state,actor,command,time,result){
    const labels={accept:'Запрос принят складом',ready:'Товар готов к передаче',handoff:'Товар передан','not-found':'Товар не найден','return-work':'Поиск возобновлён','resolve-cancel':'Фактический исход отмены установлен','reply-search':'Исполнитель поиска изменился','close-case':'Проверка расхождения завершена'};
    if(!labels[command.type]||(command.type==='reply-search'&&command.decision!=='accept'))return;
    let requests=result.kind==='request'?state.requests.filter(r=>r.id===result.id):[];
    if(command.type==='close-case'){const c=(state.cases||[]).find(c=>c.id===command.caseId);const ids=new Set(c?.episodes.map(e=>e.requestId));requests=state.requests.filter(r=>ids.has(r.id));}
    state.resultEvents||=[];
    for(const r of requests)state.resultEvents.push({id:'event-'+command.id+'-'+r.id,store:r.store,serviceId:r.serviceId,requestId:r.id,label:labels[command.type],at:time,actorId:actor.id,author:actor.name,readBy:[]});
  }
  function extend(state,actor,command,time,event){
    const service=command.serviceId?state.services.find(s=>s.id===command.serviceId):null;
    const request=command.requestId?state.requests.find(r=>r.id===command.requestId):null;
    const currentService=request?state.services.find(s=>s.id===request.serviceId):service;
    const reason=String(command.reason||'').trim(),comment=String(command.comment||'').trim();
    demand(comment.length<=1000&&reason.length<=1000,'Сократите текст до 1000 символов.');
    const liveRequest=()=>demand(request&&request.store===actor.store&&!finalStates.includes(request.status),'Запрос уже завершён или недоступен.');
    const sellerOwns=()=>demand(actor.role==='seller'&&currentService?.store===actor.store&&currentService.sellerId===actor.id&&currentService.status==='active','Обслуживание уже завершено или изменилось назначение.');
    const workerOwns=()=>demand(actor.role==='warehouse'&&request?.workerId===actor.id,'Запрос назначен другому сотруднику склада.');
    const supersede=()=>{for(const p of request.transfers||[])if(p.status==='pending'){p.status='superseded';p.resolvedAt=time;}};
    if(command.type==='cancel-request'){
      liveRequest();sellerOwns();demand(reason,'Укажите причину отмены.');
      demand(request.cancel?.status!=='pending','Отмена уже запрошена.');
      request.cancel={status:request.status==='created'?'confirmed':'pending',reason,requestedAt:time,requestedBy:actor.id};
      if(request.status==='created'){request.status='cancelled';request.closedAt=time;request.cancel.confirmedAt=time;}
      supersede();request.history.push({...event(request.status==='cancelled'?'Непринятый запрос отменён':'Запрошена отмена'),comment:reason});
    }else if(command.type==='not-found'){
      liveRequest();workerOwns();demand(request.status==='work'&&request.cancel?.status!=='pending','Завершить поиск можно из работы без ожидающей отмены.');
      supersede();request.status='not-found';request.notFoundAt=time;request.closedAt=time;request.notFoundComment=comment;request.notFoundPlacement=JSON.parse(JSON.stringify(command.sourcePlacement||state.placements?.[request.variant.id]||placementFor(state,request.variant.id,null,Date.parse(time),request.store)));
      request.history.push({...event('Товар не найден'),...(comment?{comment}:{})});
    }else if(command.type==='resolve-cancel'){
      liveRequest();workerOwns();demand(request.cancel?.status==='pending','Нет ожидающей отмены.');
      demand(command.factsConfirmed===true,'Сначала подтвердите фактическое положение вещи.');
      demand(['cancelled','transferred'].includes(command.outcome),'Выберите фактический исход.');
      demand(comment,'Зафиксируйте итог сверки.');
      supersede();request.status=command.outcome;request.closedAt=time;
      request.cancel.status=command.outcome==='cancelled'?'confirmed':'resolved-by-handoff';request.cancel.resolvedAt=time;
      if(command.outcome==='transferred')request.transferredAt=time;
      request.history.push({...event(command.outcome==='cancelled'?'Отмена подтверждена складом':'Фактическая передача подтверждена при отмене'),comment,managerAssisted:command.managerAssisted===true});
    }else if(/^(offer|reply|revoke)-(search|service)$/.test(command.type)){
      const [action,scope]=command.type.split('-'),search=scope==='search',entity=search?request:service;
      demand(entity&&entity.store===actor.store,'Передача недоступна.');
      if(search){liveRequest();demand(request.status==='work'&&request.cancel?.status!=='pending','Передача поиска доступна только из работы без отмены.');}
      else demand(service.status==='active','Завершённое обслуживание не передаётся.');
      const role=search?'warehouse':'seller',owner=()=>search?entity.workerId:entity.sellerId;
      const owns=()=>demand(actor.role==='manager'||(actor.role===role&&owner()===actor.id),'Изменилось назначение ответственного.');
      const list=search?(entity.transfers||=[]):(entity.pendingTransfers||=[]);
      if(action==='offer'){
        owns();demand(!list.some(p=>p.status==='pending'),'Сначала отзовите ожидающее предложение.');
        const colleague=staff.find(a=>a.id===command.toId&&a.role===role&&a.store===actor.store&&a.id!==owner());
        demand(colleague,'Выберите другого коллегу своего магазина с нужной ролью.');
        list.push({id:command.id,fromId:owner(),fromName:search?entity.workerName:entity.sellerName,initiatorId:actor.id,toId:colleague.id,toName:colleague.name,status:'pending',createdAt:time,comment});
        entity.history.push({...event(`Предложена передача ${search?'поиска':'обслуживания'}: ${colleague.name}`),...(comment?{comment}:{})});
      }else{
        const proposal=list.find(p=>p.id===command.offerId&&p.status==='pending');
        demand(proposal&&proposal.fromId===owner(),'Предложение уже разрешено или назначение изменилось.');
        if(action==='revoke'){owns();proposal.status='revoked';}
        else{
          demand(actor.role===role&&proposal.toId===actor.id,'Ответить может только выбранный коллега.');
          demand(['accept','decline'].includes(command.decision),'Выберите ответ на предложение.');
          proposal.status=command.decision==='accept'?'accepted':'declined';
          if(proposal.status==='accepted'){
            if(search){entity.workerId=actor.id;entity.workerName=actor.name;}
            else{entity.sellerId=actor.id;entity.sellerName=actor.name;}
          }
        }
        proposal.resolvedAt=time;
        entity.history.push(event(`Передача ${search?'поиска':'обслуживания'}: ${{accepted:'принята',declined:'отклонена',revoked:'отозвана'}[proposal.status]}`));
      }
      return {kind:search?'request':'service',id:entity.id,...(search?{serviceId:entity.serviceId}:{})};
    }else throw new Error('Неизвестное действие.');
    return {kind:'request',id:request.id,serviceId:request.serviceId};
  }

  function initial(){return {version:1,store:'store-01',services:[],requests:[],actions:{}};}
  function variant(id){
    const [productId,colorIndex,size]=String(id||'').split('~');
    const product=catalog.find(p=>p.id===productId);const color=product?.colors[Number(colorIndex)];
    if(!product||!color||!product.sizes.includes(size))throw new Error('Выберите точный вариант товара.');
    return {id,productId,name:product.name,article:product.article,kind:product.kind,color:color.name,hex:color.hex,size,stock:4,shelf:product.shelf,section:product.section};
  }
  function demand(condition,message){if(!condition)throw new Error(message);}
  function apply(source,actor,command,now){
    demand(source?.version===1,'Не удалось прочитать данные демонстрации.');
    demand(actor?.store===source.store,'Нет доступа к другому магазину.');
    demand(['seller','warehouse','senior','manager'].includes(actor.role),'Действие недоступно для этой роли.');
    demand(command&&typeof command.id==='string'&&command.id.length>0,'Не определено исходное действие.');
    const time=now||new Date().toISOString();demand(Number.isFinite(Date.parse(time)),'Не определено время действия.');
    const fingerprint=JSON.stringify([actor,command]);
    const prior=Object.prototype.hasOwnProperty.call(source.actions,command.id)?source.actions[command.id]:null;
    if(prior){demand(prior.fingerprint===fingerprint,'Это действие уже сохранено с другими данными.');return {state:source,result:prior.result,replayed:true};}
    const state=JSON.parse(JSON.stringify(source));let result;
    const event=label=>({label,at:time,author:actor.name,actorId:actor.id,role:actor.role});
    if(command.type==='create'){
      demand(actor.role==='seller','Создать запрос может продавец.');
      const item=variant(command.variantId);demand(state.demoSources?.catalog!=='failed'&&state.demoSources?.catalog!=='empty','Каталог недоступен или пуст.');
      const attempt=command.stockAttemptId?(state.stockAttempts||[]).find(a=>a.id===command.stockAttemptId&&a.store===actor.store&&a.sellerId===actor.id&&a.variantId===item.id):null;
      if(command.stockAttemptId)demand(attempt&&!attempt.usedByRequestId,'Попытка проверки наличия недоступна или уже использована.');
      const stock=attempt||stockFor(state,item.id,Date.parse(time));
      demand(!(stock.status==='current'&&stock.quantity===0),'Актуальный нулевой остаток: запрос недоступен.');
      demand(stock.status==='current'||(attempt&&command.stockConfirmed===true),'Наличие не подтверждено: требуется отдельное подтверждение текущей попытки.');
      if(command.originRequestId){const original=state.requests.find(r=>r.id===command.originRequestId&&r.store===actor.store);const owner=state.services.find(s=>s.id===original?.serviceId);demand(original?.status==='not-found'&&owner?.sellerId===actor.id&&owner.status==='active'&&command.serviceId===original.serviceId,'Исходный запрос или обслуживание недоступны.');demand(command.customerAgreed===true,'Сначала согласуйте альтернативу с покупателем.');demand(alternatives(state,original,actor.store,Date.parse(time)).variants.some(v=>v.id===item.id),'Вариант не относится к доступным альтернативам каталога.');}
      demand(places.includes(command.place),'Выберите место передачи.');
      let service=command.serviceId?state.services.find(s=>s.id===command.serviceId):null;
      if(command.serviceId)demand(service&&service.sellerId===actor.id&&service.store===actor.store&&service.status==='active','Обслуживание недоступно для нового запроса.');
      if(!service){service={id:'S-'+String(state.services.length+1).padStart(3,'0'),store:actor.store,sellerId:actor.id,sellerName:actor.name,status:'active',createdAt:time,pendingTransfers:[],history:[]};state.services.push(service);}
      const request={id:'R-'+String(state.requests.length+1).padStart(3,'0'),store:actor.store,serviceId:service.id,variant:item,quantity:1,place:command.place,status:'created',createdAt:time,stockReadAt:stock.readAt,workerId:null,workerName:null,history:[event('Запрос создан')]};
      if(attempt)attempt.usedByRequestId=request.id;if(command.originRequestId){request.originRequestId=command.originRequestId;request.history.push(event('Альтернатива согласована покупателем'));}if(stock.status!=='current'){request.stockConfirmation={...stock,confirmedBy:actor.id,confirmedAt:time};request.history.push(event('Предупреждение о наличии подтверждено продавцом'));}request.variant.stock=stock.quantity;
      state.requests.push(request);result={kind:'request',id:request.id,serviceId:service.id};
    }else if(['read-stock','read-results','record-search','return-work','report-issue','claim-case','close-case'].includes(command.type)){
      result=additional(state,actor,command,time,event);
    }else if(['cancel-request','not-found','resolve-cancel','offer-search','reply-search','revoke-search','offer-service','reply-service','revoke-service'].includes(command.type)){
      result=extend(state,actor,command,time,event);
    }else if(command.type==='finish-service'){
      demand(actor.role==='seller','Завершить обслуживание может текущий продавец.');
      const service=state.services.find(s=>s.id===command.serviceId);
      demand(service&&service.store===actor.store&&service.sellerId===actor.id&&service.status==='active','Обслуживание уже завершено или изменилось назначение.');
      const requests=state.requests.filter(r=>r.serviceId===service.id);
      demand(requests.length>0&&requests.every(r=>finalStates.includes(r.status)),'Сначала завершите все запросы обслуживания.');
      demand(!service.pendingTransfers.some(p=>p.status==='pending'),'Сначала разрешите ожидающее предложение передачи.');
      service.status='closed';service.closedAt=time;service.history.push(event('Обслуживание завершено'));result={kind:'service',id:service.id};
    }else{
      demand(actor.role==='warehouse','Состояние выдачи подтверждает сотрудник склада.');
      const request=state.requests.find(r=>r.id===command.requestId);
      demand(request&&request.store===actor.store,'Запрос недоступен.');
      if(command.type==='accept'){
        demand(request.status==='created'&&!request.workerId,'Запрос уже принят или завершён.');
        request.status='work';request.workerId=actor.id;request.workerName=actor.name;request.acceptedAt=time;request.history.push(event('Принят в работу'));
      }else{
        demand(request.workerId===actor.id,'Запрос назначен другому сотруднику склада.');
        demand(request.cancel?.status!=='pending','Сначала разрешите ожидающую отмену.');
        if(command.type==='ready'){
          demand(request.status==='work','Отметить готовность можно только после принятия в работу.');
          for(const p of request.transfers||[])if(p.status==='pending'){p.status='superseded';p.resolvedAt=time;}
          request.status='ready';request.readyValid=true;request.readyAt=time;request.history.push(event('Готов к передаче'));
        }else if(command.type==='handoff'){
          demand(request.status==='ready','В обычной выдаче сначала нужно отметить готовность.');
          request.status='transferred';request.transferredAt=time;request.closedAt=time;request.history.push(event('Фактическая передача подтверждена'));
        }else throw new Error('Действие не входит в основной сценарий.');
      }
      result={kind:'request',id:request.id,serviceId:request.serviceId};
    }
    recordResults(state,actor,command,time,result);
    state.actions[command.id]={fingerprint,result};
    return {state,result,replayed:false};
  }
  const api={catalog,actors,staff,places,initial,variant,apply,finalStates,recentMiss,stockFor,alternatives,placementFor,configureSources,sourceDefaults,caseResults,searchSummary,resultsFor};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.StoreAssist=api;
})(typeof window!=='undefined'?window:globalThis);
