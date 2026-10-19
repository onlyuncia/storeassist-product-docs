const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../dist/engine.js');
const seller=E.actors.seller,warehouse=E.actors.warehouse;
const times=['2026-10-19T09:00:00.000Z','2026-10-19T09:01:00.000Z','2026-10-19T09:02:00.000Z','2026-10-19T09:04:00.000Z'];
const create={id:'create-1',type:'create',variantId:'cotton-shirt~0~M',place:E.places[0],serviceId:null};
function sent(){return E.apply(E.initial(),seller,create,times[0]);}
function step(state,type,id,actor=warehouse){return E.apply(state,actor,{id:type+'-'+id+'-'+actor.id,type,requestId:id},times[1]);}

const elena=E.staff.find(a=>a.id==='seller-elena'),pavel=E.staff.find(a=>a.id==='warehouse-pavel');
let sequence=0;
function action(state,actor,type,data={},at=times[2]){return E.apply(state,actor,{...data,id:'extra-'+(++sequence),type},at);}
function working(){const first=sent();return step(first.state,'accept',first.result.id).state;}

const senior=E.staff.find(a=>a.id==='senior-daria'),otherSenior=E.staff.find(a=>a.id==='senior-olga'),manager=E.staff.find(a=>a.id==='manager-irina');
function missed(){const state=working();return action(state,warehouse,'not-found',{requestId:state.requests[0].id}).state;}
function reported(){const state=missed();return action(state,warehouse,'report-issue',{requestId:state.requests[0].id,issueType:'not-found'}).state;}

test('Актуальный ноль блокирует запрос даже с подтверждением; неизвестный и устаревший ноль требуют своей попытки',()=>{
  const zero=E.configureSources(E.initial(),{stock:'zero'});assert.throws(()=>action(zero,seller,'create',{...create,stockConfirmed:true}),/нулевой/);
  for(const mode of ['unknown','stale-zero']){
    const state=E.configureSources(E.initial(),{stock:mode});assert.throws(()=>action(state,seller,'create',{...create,stockConfirmed:true}),/требуется/);
    const checked=action(state,seller,'read-stock',{variantId:create.variantId});
    assert.throws(()=>action(checked.state,seller,'create',{...create,stockAttemptId:checked.result.id}),/требуется/);
    const out=action(checked.state,seller,'create',{...create,stockAttemptId:checked.result.id,stockConfirmed:true}).state;
    assert.equal(out.requests.length,1);assert.equal(out.requests[0].stockConfirmation.confirmedBy,seller.id);
    assert.throws(()=>action(out,seller,'create',{...create,stockAttemptId:checked.result.id,stockConfirmed:true}),/использована/);
  }
});
test('Подтверждение продолжает ту же попытку без чтения по кругу; чужая попытка и другой вариант не подходят',()=>{
  const checked=action(E.configureSources(E.initial(),{stock:'unknown'}),seller,'read-stock',{variantId:create.variantId});
  const changed=E.configureSources(checked.state,{stock:'zero'}),payload={...create,stockAttemptId:checked.result.id,stockConfirmed:true};
  assert.equal(action(changed,seller,'create',payload).state.requests.length,1);
  assert.throws(()=>action(checked.state,elena,'create',payload),/попытка|Попытка/);
  assert.throws(()=>action(checked.state,seller,'create',{...payload,variantId:'cotton-shirt~0~L'}),/попытка|Попытка/);
});
test('Альтернатива требует согласия, каталожной связи и текущего продавца; исходный поиск неизменен',()=>{
  const state=missed(),r=state.requests[0],item=E.alternatives(state,r,r.store).variants[0];
  const payload={variantId:item.id,place:r.place,serviceId:r.serviceId,originRequestId:r.id};
  assert.throws(()=>action(state,seller,'create',payload),/согласуйте/);
  assert.throws(()=>action(state,elena,'create',{...payload,customerAgreed:true}));
  assert.throws(()=>action(state,seller,'create',{...payload,variantId:'straight-trousers~0~M',customerAgreed:true}),/альтернативам/);
  const next=action(state,seller,'create',{...payload,customerAgreed:true}).state;
  assert.equal(next.requests[1].originRequestId,r.id);assert.equal(next.requests[1].serviceId,r.serviceId);assert.deepEqual(next.requests[0],r);
});
test('Каталог, отсутствие связей и сбой связей различаются; при сбое остаётся только исходная модель',()=>{
  const state=missed(),r=state.requests[0];
  for(const mode of ['empty','failed'])assert.equal(E.alternatives(E.configureSources(state,{catalog:mode}),r,r.store).status,mode);
  for(const relations of ['empty','failed']){
    const data=E.alternatives(E.configureSources(state,{relations}),r,r.store);assert.ok(data.variants.every(v=>v.productId===r.variant.productId));assert.equal(data.relationsFailed,relations==='failed');
  }
});
test('Возврат готовности требует причины и сохраняет отмену, исполнителя, исходное время и историю',()=>{
  let state=working(),r=state.requests[0];state=step(state,'ready',r.id).state;state=action(state,seller,'cancel-request',{requestId:r.id,reason:'Ушёл'}).state;
  assert.throws(()=>action(state,warehouse,'return-work',{requestId:r.id,reason:''}));
  assert.throws(()=>action(state,pavel,'return-work',{requestId:r.id,reason:'Ошибка'}));
  const out=action(state,warehouse,'return-work',{requestId:r.id,reason:'Подобран другой размер'}).state.requests[0];
  assert.equal(out.status,'work');assert.equal(out.cancel.status,'pending');assert.equal(out.createdAt,r.createdAt);assert.equal(out.workerId,r.workerId);assert.ok(out.history.some(e=>e.label==='Готов к передаче'));assert.equal(out.readyValid,false);
});
test('Эпизоды одного варианта объединяются в открытую проверку, не меняя её владельца и финал выдачи',()=>{
  const state=reported(),id=state.cases[0].id,claimed=action(state,senior,'claim-case',{caseId:id}).state;
  const next=action(claimed,warehouse,'report-issue',{requestId:state.requests[0].id,issueType:'not-found',comment:'Повторная проверка секции'}).state;
  assert.equal(next.cases.length,1);assert.equal(next.cases[0].episodes.length,2);assert.equal(next.cases[0].ownerId,senior.id);assert.equal(next.requests[0].status,'not-found');assert.equal(next.requests[0].closedAt,state.requests[0].closedAt);
});
test('Проверку принимает один старший; закрытие требует ответственного, результата и пояснения',()=>{
  const state=reported(),id=state.cases[0].id;
  assert.throws(()=>action(state,warehouse,'claim-case',{caseId:id}));const claimed=action(state,senior,'claim-case',{caseId:id}).state;
  assert.throws(()=>action(claimed,otherSenior,'claim-case',{caseId:id}));
  for(const [actor,data] of [[otherSenior,{result:'found-source',comment:'Нашли'}],[senior,{result:'found-source'}],[senior,{comment:'Нашли'}]])assert.throws(()=>action(claimed,actor,'close-case',{caseId:id,...data}));
  assert.throws(()=>action(claimed,senior,'close-case',{caseId:id,result:'found-source',comment:'Нашли',correctionDone:true}),/операцию/);
});
test('Закрытие проверки снимает предупреждение при нахождении, но не исправляет остаток и не переписывает финальный исход',()=>{
  const state=reported(),r=state.requests[0],claimed=action(state,senior,'claim-case',{caseId:state.cases[0].id}).state;
  const closed=action(claimed,senior,'close-case',{caseId:state.cases[0].id,result:'found-other',comment:'Нашли в другой секции',correctionDone:true,accountingRef:'Операция внешней системы №7'},times[3]).state;
  assert.equal(closed.requests[0].status,'not-found');assert.equal(closed.requests[0].variant.stock,4);assert.equal(E.recentMiss(closed,r.store,r.variant.id,Date.parse(times[3])),null);
  const again=action(closed,warehouse,'report-issue',{requestId:r.id,issueType:'not-found'}).state;assert.equal(again.cases.length,2);assert.equal(again.cases[1].previousCaseId,closed.cases[0].id);
});
test('Наблюдение адреса не подменяет источник; неудача чтения сохраняет закрытую проверку и прежний адрес',()=>{
  let state=working(),r=state.requests[0];state.placements={[r.variant.id]:E.placementFor(state,r.variant.id,null,Date.parse(times[0]))};
  state=action(state,warehouse,'report-issue',{requestId:r.id,issueType:'placement',actualShelf:'Z-99',actualSection:'Секция 8',comment:'Вещь лежит здесь'}).state;
  state=action(state,senior,'claim-case',{caseId:state.cases[0].id}).state;state=E.configureSources(state,{placement:'failed'});
  const closed=action(state,senior,'close-case',{caseId:state.cases[0].id,result:'found-other',comment:'Проверено'},times[3]).state;
  assert.equal(closed.cases[0].status,'closed');assert.equal(closed.placements[r.variant.id].error,true);assert.equal(closed.placements[r.variant.id].shelf,r.variant.shelf);assert.notEqual(closed.placements[r.variant.id].shelf,'Z-99');
  const missing=E.placementFor(E.configureSources(closed,{placement:'missing'}),r.variant.id,closed.placements[r.variant.id]);assert.equal(missing.status,'missing');assert.equal(missing.shelf,null);assert.equal(missing.error,false);
});
test('Руководитель предлагает передачу текущего владельца, но не принимает работу и не фиксирует исход вместо склада',()=>{
  const state=working(),r=state.requests[0],offered=action(state,manager,'offer-search',{requestId:r.id,toId:pavel.id}).state,p=offered.requests[0].transfers[0];
  assert.equal(p.fromId,warehouse.id);assert.equal(p.initiatorId,manager.id);assert.equal(offered.requests[0].workerId,warehouse.id);
  assert.throws(()=>action(offered,manager,'reply-search',{requestId:r.id,offerId:p.id,decision:'accept'}));assert.throws(()=>action(state,manager,'ready',{requestId:r.id}));
  const accepted=action(offered,pavel,'reply-search',{requestId:r.id,offerId:p.id,decision:'accept'}).state;assert.equal(accepted.requests[0].workerId,pavel.id);
  const service=action(state,manager,'offer-service',{serviceId:r.serviceId,toId:elena.id}).state;assert.equal(service.services[0].pendingTransfers[0].fromId,seller.id);
});

test('Не найдено: пустой комментарий допустим, поиск финален, остаток и источник неизменны',()=>{
  const before=working(),r=before.requests[0],out=action(before,warehouse,'not-found',{requestId:r.id});
  assert.equal(before.requests[0].status,'work');assert.equal(out.state.requests[0].status,'not-found');
  assert.equal(out.state.requests[0].notFoundComment,'');assert.deepEqual(out.state.requests[0].variant,r.variant);
  assert.equal(out.state.requests[0].history.at(-1).actorId,warehouse.id);
  assert.throws(()=>action(out.state,warehouse,'handoff',{requestId:r.id}));
  assert.equal(action(out.state,seller,'finish-service',{serviceId:r.serviceId}).state.services[0].status,'closed');
});
test('Не найдено сохраняет свободный комментарий без выбора причины; чужой исполнитель и готовый запрос отклонены',()=>{
  const state=working(),id=state.requests[0].id;
  assert.throws(()=>action(state,pavel,'not-found',{requestId:id}));
  const ready=step(state,'ready',id).state;assert.throws(()=>action(ready,warehouse,'not-found',{requestId:id}));
  const out=action(state,warehouse,'not-found',{requestId:id,comment:'  Проверили B-04 и соседний стеллаж  '});
  assert.equal(out.state.requests[0].history.at(-1).comment,'Проверили B-04 и соседний стеллаж');
});
test('Отмена до принятия требует причины и текущего продавца; финал не переписывается',()=>{
  const first=sent(),id=first.result.id;
  assert.throws(()=>action(first.state,seller,'cancel-request',{requestId:id,reason:'   '}));
  assert.throws(()=>action(first.state,elena,'cancel-request',{requestId:id,reason:'Ушёл'}));
  const out=action(first.state,seller,'cancel-request',{requestId:id,reason:'Покупатель ушёл'});
  assert.equal(out.state.requests[0].status,'cancelled');assert.equal(out.state.requests[0].workerId,null);
  for(const actor of [seller,warehouse])assert.throws(()=>action(out.state,actor,'cancel-request',{requestId:id,reason:'Другое'}));
  assert.throws(()=>step(out.state,'accept',id));
});
test('Отмена начатого запроса остаётся активной и запрещает обычную готовность, поиск и смену исполнителя',()=>{
  const state=working(),id=state.requests[0].id;
  const pending=action(state,seller,'cancel-request',{requestId:id,reason:'Не нужен'}).state;
  assert.equal(pending.requests[0].status,'work');assert.equal(pending.requests[0].cancel.status,'pending');
  for(const type of ['ready','not-found','offer-search'])assert.throws(()=>action(pending,warehouse,type,{requestId:id,toId:pavel.id}));
  assert.throws(()=>action(pending,seller,'finish-service',{serviceId:state.services[0].id}));
});
test('Склад сохраняет отмену только после проверки фактов; причина, итог сверки и участие руководителя остаются в истории',()=>{
  const state=working(),id=state.requests[0].id,pending=action(state,seller,'cancel-request',{requestId:id,reason:'Ушёл'}).state;
  const payload={requestId:id,outcome:'cancelled',comment:'Вещь не передана, возвращена в секцию',managerAssisted:true};
  assert.throws(()=>action(pending,warehouse,'resolve-cancel',payload));
  assert.throws(()=>action(pending,pavel,'resolve-cancel',{...payload,factsConfirmed:true}));
  const out=action(pending,warehouse,'resolve-cancel',{...payload,factsConfirmed:true}).state;
  assert.equal(out.requests[0].status,'cancelled');assert.equal(out.requests[0].cancel.reason,'Ушёл');assert.equal(out.requests[0].history.at(-1).managerAssisted,true);
  assert.equal(out.requests[0].history.at(-1).actorId,warehouse.id);
});
test('Спорная отмена может завершиться фактической передачей, включая ещё не отмеченную готовность',()=>{
  const state=working(),id=state.requests[0].id,pending=action(state,seller,'cancel-request',{requestId:id,reason:'Покупатель ушёл'}).state;
  assert.throws(()=>action(pending,warehouse,'resolve-cancel',{requestId:id,outcome:'transferred',factsConfirmed:true}));
  const out=action(pending,warehouse,'resolve-cancel',{requestId:id,outcome:'transferred',factsConfirmed:true,comment:'Продавец и склад подтвердили передачу'}).state;
  assert.equal(out.requests[0].status,'transferred');assert.equal(out.requests[0].cancel.status,'resolved-by-handoff');
  assert.throws(()=>action(out,warehouse,'resolve-cancel',{requestId:id,outcome:'cancelled',factsConfirmed:true,comment:'Повтор'}));
});
test('Повтор сохранённой отмены или ненахождения идемпотентен, изменённый повтор отклоняется',()=>{
  for(const [state,actor,type,data] of [[sent().state,seller,'cancel-request',{reason:'Ушёл'}],[working(),warehouse,'not-found',{comment:'Нет'}]]){
    const command={id:'replay-outcome',type,requestId:state.requests[0].id,...data};const first=E.apply(state,actor,command,times[2]);
    const again=E.apply(first.state,actor,command,times[3]);assert.deepEqual(again.state,first.state);assert.equal(again.replayed,true);
    assert.throws(()=>E.apply(first.state,actor,{...command,comment:'Изменено'}));
  }
});
test('Предупреждение прошлого поиска ограничено точным вариантом, магазином и двумя часами',()=>{
  const state=working(),r=state.requests[0],missed=action(state,warehouse,'not-found',{requestId:r.id},times[2]).state,at=Date.parse(times[2]);
  assert.ok(E.recentMiss(missed,r.store,r.variant.id,at+7199999));
  assert.equal(E.recentMiss(missed,r.store,r.variant.id,at+7200000),null);
  assert.equal(E.recentMiss(missed,'other-store',r.variant.id,at),null);
  assert.equal(E.recentMiss(missed,r.store,'cotton-shirt~0~L',at),null);
  const next=action(missed,seller,'create',{variantId:r.variant.id,place:E.places[0],serviceId:r.serviceId},times[3]);assert.equal(next.state.requests.length,2);
  const accepted=step(next.state,'accept',next.result.id).state;
  const found=action(accepted,warehouse,'ready',{requestId:next.result.id},'2026-10-19T09:06:00Z').state;
  assert.equal(E.recentMiss(found,r.store,r.variant.id,Date.parse('2026-10-19T09:07:00Z')),null);
  assert.equal(found.requests[0].status,'not-found');
});
test('Передача поиска меняет единственного исполнителя только после принятия получателем, сохраняя возраст и контекст',()=>{
  const state=working(),r=state.requests[0];r.checkedPlaces=['B-04 / 2'];
  const offered=action(state,warehouse,'offer-search',{requestId:r.id,toId:pavel.id,comment:'Проверили соседнюю секцию'});
  assert.equal(offered.state.requests[0].workerId,warehouse.id);
  const accepted=action(offered.state,pavel,'reply-search',{requestId:r.id,offerId:offered.state.requests[0].transfers[0].id,decision:'accept'}).state;
  assert.equal(accepted.requests[0].workerId,pavel.id);assert.equal(accepted.requests[0].createdAt,r.createdAt);assert.equal(accepted.requests[0].acceptedAt,r.acceptedAt);
  assert.deepEqual(accepted.requests[0].checkedPlaces,r.checkedPlaces);assert.equal(accepted.requests[0].transfers[0].comment,'Проверили соседнюю секцию');
  assert.throws(()=>action(accepted,warehouse,'ready',{requestId:r.id}));assert.equal(action(accepted,pavel,'ready',{requestId:r.id}).state.requests[0].status,'ready');
});
test('Передача поиска отклоняет чужие роли, магазин, себя и недопустимое состояние',()=>{
  const state=working(),id=state.requests[0].id;
  for(const toId of [warehouse.id,seller.id,'foreign-worker','missing'])assert.throws(()=>action(state,warehouse,'offer-search',{requestId:id,toId}));
  assert.throws(()=>action(state,seller,'offer-search',{requestId:id,toId:pavel.id}));
  assert.throws(()=>action(state,{...warehouse,store:'other-store'},'offer-search',{requestId:id,toId:pavel.id}));
  const ready=step(state,'ready',id).state;assert.throws(()=>action(ready,warehouse,'offer-search',{requestId:id,toId:pavel.id}));
});
test('Отказ, отзыв и устаревшее принятие поиска сохраняют текущего исполнителя; второго предложения одновременно нет',()=>{
  const state=working(),id=state.requests[0].id,offered=action(state,warehouse,'offer-search',{requestId:id,toId:pavel.id}).state,offerId=offered.requests[0].transfers[0].id;
  assert.throws(()=>action(offered,warehouse,'offer-search',{requestId:id,toId:pavel.id}));
  assert.throws(()=>action(offered,warehouse,'reply-search',{requestId:id,offerId,decision:'accept'}));
  for(const [actor,type,extra] of [[pavel,'reply-search',{decision:'decline'}],[warehouse,'revoke-search',{}]]){
    const out=action(offered,actor,type,{requestId:id,offerId,...extra}).state;assert.equal(out.requests[0].workerId,warehouse.id);
    assert.throws(()=>action(out,pavel,'reply-search',{requestId:id,offerId,decision:'accept'}));
  }
});
test('Готовность или отмена раньше принятия предложения исключает позднюю смену исполнителя',()=>{
  const state=working(),id=state.requests[0].id,offered=action(state,warehouse,'offer-search',{requestId:id,toId:pavel.id}).state,offerId=offered.requests[0].transfers[0].id;
  for(const [actor,type,data] of [[warehouse,'ready',{}],[seller,'cancel-request',{reason:'Ушёл'}]]){
    const changed=action(offered,actor,type,{requestId:id,...data}).state;
    assert.equal(changed.requests[0].transfers[0].status,'superseded');
    assert.throws(()=>action(changed,pavel,'reply-search',{requestId:id,offerId,decision:'accept'}));
  }
});
test('Передача обслуживания сохраняет работу склада и отмену, но меняет права продавца целиком',()=>{
  let state=working(),r=state.requests[0];state=action(state,seller,'cancel-request',{requestId:r.id,reason:'Ушёл'}).state;
  const offered=action(state,seller,'offer-service',{serviceId:r.serviceId,toId:elena.id,comment:'Сложное обслуживание'}).state,offerId=offered.services[0].pendingTransfers[0].id;
  const accepted=action(offered,elena,'reply-service',{serviceId:r.serviceId,offerId,decision:'accept'}).state;
  assert.equal(accepted.services[0].sellerId,elena.id);assert.deepEqual(accepted.requests,offered.requests);
  assert.throws(()=>action(accepted,seller,'create',{variantId:r.variant.id,place:r.place,serviceId:r.serviceId}));
  assert.throws(()=>action(accepted,seller,'finish-service',{serviceId:r.serviceId}));
  assert.equal(action(accepted,elena,'create',{variantId:r.variant.id,place:r.place,serviceId:r.serviceId}).state.requests.length,2);
  assert.equal(accepted.requests[0].history[0].actorId,seller.id);
});
test('Передача обслуживания: отказ и отзыв не меняют владельца; принятое предложение нельзя отозвать прежнему продавцу',()=>{
  const first=sent(),id=first.result.serviceId,offered=action(first.state,seller,'offer-service',{serviceId:id,toId:elena.id}).state,offerId=offered.services[0].pendingTransfers[0].id;
  for(const [actor,type,data] of [[elena,'reply-service',{decision:'decline'}],[seller,'revoke-service',{}]]){
    const out=action(offered,actor,type,{serviceId:id,offerId,...data}).state;assert.equal(out.services[0].sellerId,seller.id);
    assert.throws(()=>action(out,elena,'reply-service',{serviceId:id,offerId,decision:'accept'}));
    assert.equal(action(out,seller,'offer-service',{serviceId:id,toId:elena.id}).state.services[0].pendingTransfers.length,2);
  }
  const accepted=action(offered,elena,'reply-service',{serviceId:id,offerId,decision:'accept'}).state;
  assert.throws(()=>action(accepted,seller,'revoke-service',{serviceId:id,offerId}));
});
test('Завершение обслуживания ждёт ответа на предложение даже при финальных запросах; смена продавца не отменяет выдачу',()=>{
  const state=working(),r=state.requests[0],offered=action(state,seller,'offer-service',{serviceId:r.serviceId,toId:elena.id}).state,offerId=offered.services[0].pendingTransfers[0].id;
  const ready=step(offered,'ready',r.id).state,handed=step(ready,'handoff',r.id).state;
  assert.throws(()=>action(handed,seller,'finish-service',{serviceId:r.serviceId}));
  const accepted=action(handed,elena,'reply-service',{serviceId:r.serviceId,offerId,decision:'accept'}).state;
  assert.equal(accepted.requests[0].status,'transferred');
  const closed=action(accepted,elena,'finish-service',{serviceId:r.serviceId}).state;
  assert.throws(()=>action(closed,elena,'offer-service',{serviceId:r.serviceId,toId:seller.id}));
});
test('Обслуживание возникает вместе с первым сохранённым запросом; вариант точный, одна единица',()=>{const empty=E.initial();const {state,result}=E.apply(empty,seller,create,times[0]);assert.equal(empty.requests.length,0);assert.equal(state.services.length,1);assert.equal(state.requests[0].serviceId,result.serviceId);assert.equal(state.requests[0].quantity,1);assert.equal(state.requests[0].variant.size,'M');assert.equal(state.requests[0].variant.color,'Белый');assert.equal('customer' in state.services[0],false);});
test('Повтор исходного действия не создаёт второй запрос и обслуживание',()=>{const first=sent();const again=E.apply(first.state,seller,create,times[1]);assert.equal(again.replayed,true);assert.equal(again.state.requests.length,1);assert.equal(again.state.services.length,1);assert.equal(again.state.requests[0].history.length,1);assert.deepEqual(again.result,first.result);});
test('Повтор ID с другим вариантом отклонён, исходный вариант сохранён',()=>{const first=sent();assert.throws(()=>E.apply(first.state,seller,{...create,variantId:'cotton-shirt~0~L'}),/другими данными/);assert.equal(first.state.requests[0].variant.size,'M');});
test('Без варианта или допустимого места запрос и обслуживание не создаются',()=>{const state=E.initial();for(const command of [{...create,variantId:'unknown~0~M'},{...create,place:''}])assert.throws(()=>E.apply(state,seller,command));assert.equal(state.requests.length,0);assert.equal(state.services.length,0);});
test('Второй намеренный запрос входит в активное обслуживание без резервирования',()=>{const first=sent();const next=E.apply(first.state,seller,{...create,id:'create-2',serviceId:first.result.serviceId},times[1]);assert.equal(next.state.services.length,1);assert.equal(next.state.requests.length,2);assert.equal(next.state.requests[0].variant.stock,4);assert.equal(next.state.requests[1].variant.stock,4);});
test('Чужой магазин не получает результат даже при повторе известного действия',()=>{const first=sent();assert.throws(()=>E.apply(first.state,{...seller,store:'store-02'},create),/другому магазину/);});
test('Другой продавец не может добавить запрос к чужому обслуживанию',()=>{const first=sent();assert.throws(()=>E.apply(first.state,{...seller,id:'seller-2'},{...create,id:'create-2',serviceId:first.result.serviceId}),/недоступно/);});
test('После первого принятия второй сотрудник не получает тот же запрос',()=>{const first=sent();const accepted=step(first.state,'accept',first.result.id);assert.equal(accepted.state.requests[0].workerId,warehouse.id);assert.throws(()=>step(accepted.state,'accept',first.result.id,{...warehouse,id:'warehouse-2'}),/уже принят/);assert.equal(accepted.state.requests[0].history.length,2);});
test('Готовность не завершает выдачу; продавец не может подтвердить её вместо склада',()=>{const first=sent();let {state}=step(first.state,'accept',first.result.id);state=step(state,'ready',first.result.id).state;assert.equal(state.requests[0].status,'ready');assert.throws(()=>step(state,'handoff',first.result.id,seller),/сотрудник склада/);assert.throws(()=>E.apply(state,seller,{id:'finish-1',type:'finish-service',serviceId:first.result.serviceId}),/все запросы/);});
test('Обычная передача требует готовности и текущего исполнителя',()=>{const first=sent();const accepted=step(first.state,'accept',first.result.id).state;assert.throws(()=>step(accepted,'handoff',first.result.id),/готовность/);const ready=step(accepted,'ready',first.result.id).state;assert.throws(()=>step(ready,'handoff',first.result.id,{...warehouse,id:'warehouse-2'}),/другому сотруднику/);});
test('Полный путь сохраняет первоначальное время и настоящих авторов, финал не переписывается',()=>{const first=sent();let state=E.apply(first.state,warehouse,{id:'accept-r1',type:'accept',requestId:first.result.id},times[1]).state;state=E.apply(state,warehouse,{id:'ready-r1',type:'ready',requestId:first.result.id},times[2]).state;state=E.apply(state,warehouse,{id:'handoff-r1',type:'handoff',requestId:first.result.id},times[3]).state;const r=state.requests[0];assert.equal(r.createdAt,times[0]);assert.equal(r.transferredAt,times[3]);assert.deepEqual(r.history.map(e=>e.actorId),[seller.id,warehouse.id,warehouse.id,warehouse.id]);assert.throws(()=>step(state,'ready',r.id),/только после/);const closed=E.apply(state,seller,{id:'finish-1',type:'finish-service',serviceId:r.serviceId}).state;assert.equal(closed.services[0].status,'closed');assert.equal(closed.requests[0].status,'transferred');});
test('Завершение проверяет все связанные запросы и ожидающие предложения',()=>{const first=sent();let state=step(first.state,'accept',first.result.id).state;state=step(state,'ready',first.result.id).state;state=step(state,'handoff',first.result.id).state;const second=E.apply(state,seller,{...create,id:'create-2',serviceId:first.result.serviceId});assert.throws(()=>E.apply(second.state,seller,{id:'finish',type:'finish-service',serviceId:first.result.serviceId}),/все запросы/);state.services[0].pendingTransfers.push({status:'pending'});assert.throws(()=>E.apply(state,seller,{id:'finish',type:'finish-service',serviceId:first.result.serviceId}),/предложение/);});
test('После завершения нельзя добавить запрос в старое обслуживание',()=>{const first=sent();let state=step(first.state,'accept',first.result.id).state;state=step(state,'ready',first.result.id).state;state=step(state,'handoff',first.result.id).state;state=E.apply(state,seller,{id:'finish',type:'finish-service',serviceId:first.result.serviceId}).state;assert.throws(()=>E.apply(state,seller,{...create,id:'create-2',serviceId:first.result.serviceId}),/недоступно/);const next=E.apply(state,seller,{...create,id:'create-2'});assert.equal(next.state.services.length,2);});


test('Согласие на альтернативу и подтверждение неподтверждённого наличия проверяются независимо',()=>{
  let state=E.configureSources(missed(),{stock:'unknown'});const original=state.requests[0],variantId='cotton-shirt~0~L';const read=action(state,seller,'read-stock',{variantId,serviceId:original.serviceId});state=read.state;
  const data={variantId,place:E.places[0],serviceId:original.serviceId,originRequestId:original.id,stockAttemptId:read.result.id};
  assert.throws(()=>action(state,seller,'create',{...data,customerAgreed:true}),/подтверждение/);
  assert.throws(()=>action(state,seller,'create',{...data,stockConfirmed:true}),/соглас/);
  const out=action(state,seller,'create',{...data,customerAgreed:true,stockConfirmed:true}).state;assert.equal(out.requests.length,2);assert.equal(out.requests[1].originRequestId,original.id);assert.equal(out.requests[0].status,'not-found');
});


test('Результаты доступны только текущему продавцу; прочтение не меняет запрос или историю',()=>{
 const state=working(),r=state.requests[0],events=E.resultsFor(state,seller);assert.equal(events.length,1);assert.equal(E.resultsFor(state,elena).length,0);
 const read=action(state,seller,'read-results',{serviceId:r.serviceId,eventIds:events.map(e=>e.id)}).state;assert.deepEqual(read.requests,state.requests);assert.deepEqual(read.services,state.services);assert.deepEqual(read.resultEvents[0].readBy,[seller.id]);
 assert.throws(()=>action(read,elena,'read-results',{serviceId:r.serviceId,eventIds:[events[0].id]}));assert.throws(()=>action(read,seller,'read-results',{serviceId:r.serviceId,eventIds:['unknown']}));assert.equal(E.resultsFor(read,{...seller,store:'other-store'}).length,0);
});

test('После передачи результаты переходят новому продавцу без замены исторических авторов и прочтения',()=>{
 let state=working(),r=state.requests[0];const event=E.resultsFor(state,seller)[0];state=action(state,seller,'read-results',{serviceId:r.serviceId,eventIds:[event.id]}).state;
 state=action(state,seller,'offer-service',{serviceId:r.serviceId,toId:elena.id}).state;assert.equal(E.resultsFor(state,elena).length,0);state=action(state,elena,'reply-service',{serviceId:r.serviceId,offerId:state.services[0].pendingTransfers[0].id,decision:'accept'}).state;
 assert.equal(E.resultsFor(state,seller).length,0);assert.equal(E.resultsFor(state,elena)[0].author,warehouse.name);assert.deepEqual(state.resultEvents[0].readBy,[seller.id]);assert.equal(state.resultEvents[0].readBy.includes(elena.id),false);
 assert.throws(()=>action(state,seller,'read-results',{serviceId:r.serviceId,eventIds:[event.id]}));
});

test('Проверенные места сохраняют автора, время и комментарий после передачи поиска',()=>{
 const state=working(),r=state.requests[0],before=JSON.stringify(r.variant);const recorded=action(state,warehouse,'record-search',{requestId:r.id,actualShelf:'B-04',actualSection:'2',comment:'Проверили весь ряд'}).state;
 assert.equal(recorded.requests[0].searchAttempts[0].author,warehouse.name);assert.equal(JSON.stringify(recorded.requests[0].variant),before);assert.throws(()=>action(recorded,pavel,'record-search',{requestId:r.id,actualShelf:'A',actualSection:'1'}));
 const offered=action(recorded,warehouse,'offer-search',{requestId:r.id,toId:pavel.id}).state;const accepted=action(offered,pavel,'reply-search',{requestId:r.id,offerId:offered.requests[0].transfers[0].id,decision:'accept'}).state;
 assert.deepEqual(accepted.requests[0].searchAttempts,recorded.requests[0].searchAttempts);assert.equal(action(accepted,pavel,'record-search',{requestId:r.id,actualShelf:'B-05',actualSection:'3'}).state.requests[0].searchAttempts.length,2);
});

test('Сводка прошлого поиска показывает проверенное место, результат проверки и истечение окна',()=>{
 let state=working(),r=state.requests[0];state=action(state,warehouse,'record-search',{requestId:r.id,actualShelf:'Z-02',actualSection:'8'}).state;state=action(state,warehouse,'not-found',{requestId:r.id},times[2]).state;
 const at=Date.parse(times[2]);assert.equal(E.searchSummary(state,r.store,r.variant.id,at+1000).shelf,'Z-02');assert.equal(E.searchSummary(state,r.store,r.variant.id,at+7200000).status,'expired');
 state=action(state,warehouse,'report-issue',{requestId:r.id,issueType:'not-found'}).state;state=action(state,senior,'claim-case',{caseId:state.cases[0].id}).state;state=action(state,senior,'close-case',{caseId:state.cases[0].id,result:'not-found',comment:'Повторно не найден'},times[3]).state;
 const summary=E.searchSummary(state,r.store,r.variant.id,Date.parse(times[3])+1000);assert.equal(summary.status,'active');assert.equal(summary.check.result,'not-found');assert.equal(state.requests[0].variant.stock,4);
});

test('Снимок источника в обращении ограничен магазином и точным вариантом и не связан с объектом команды',()=>{
 const state=working(),r=state.requests[0],snapshot=E.placementFor(E.configureSources(state,{placement:'updated'}),r.variant.id,null,Date.parse(times[1]));const data={requestId:r.id,issueType:'placement',actualShelf:'E-01',actualSection:'3',comment:'Наблюдение',sourcePlacement:snapshot};
 assert.throws(()=>action(state,warehouse,'report-issue',{...data,sourcePlacement:{...snapshot,store:'other'}}));assert.throws(()=>action(state,warehouse,'report-issue',{...data,sourcePlacement:{...snapshot,variantId:'cotton-shirt~1~L'}}));
 const out=action(state,warehouse,'report-issue',data).state;snapshot.shelf='Changed';assert.equal(out.cases[0].episodes[0].source.shelf,'D-01');assert.equal(out.cases[0].episodes[0].observed.shelf,'E-01');assert.equal(out.requests[0].status,'work');
});


test('[AC-23] Отмену после принятой передачи поиска разрешает только новый исполнитель',()=>{
 let state=working(),r=state.requests[0];state=action(state,warehouse,'offer-search',{requestId:r.id,toId:pavel.id}).state;state=action(state,pavel,'reply-search',{requestId:r.id,offerId:state.requests[0].transfers[0].id,decision:'accept'}).state;state=action(state,seller,'cancel-request',{requestId:r.id,reason:'Ушёл'}).state;
 const data={requestId:r.id,outcome:'cancelled',factsConfirmed:true,comment:'Вещь возвращена'};assert.throws(()=>action(state,warehouse,'resolve-cancel',data));assert.equal(action(state,pavel,'resolve-cancel',data).state.requests[0].status,'cancelled');
});

test('[AC-34] Одинаковый вариант двух покупателей не объединяет новые обслуживания',()=>{
 const first=sent();const second=action(first.state,seller,'create',{variantId:create.variantId,place:E.places[0],serviceId:null}).state;assert.equal(second.services.length,2);assert.notEqual(second.requests[0].serviceId,second.requests[1].serviceId);
});

test('[AC-37] Передача обслуживания сохраняет готовность и отмену, место и времена; выдачу выполняет прежний склад',()=>{
 for(const pending of [false,true]){
  let state=working(),r=state.requests[0];state=step(state,'ready',r.id).state;if(pending)state=action(state,seller,'cancel-request',{requestId:r.id,reason:'Ушёл'}).state;const before=JSON.parse(JSON.stringify(state.requests));
  state=action(state,seller,'offer-service',{serviceId:r.serviceId,toId:elena.id}).state;state=action(state,elena,'reply-service',{serviceId:r.serviceId,offerId:state.services[0].pendingTransfers[0].id,decision:'accept'}).state;assert.deepEqual(state.requests,before);
  state=pending?action(state,warehouse,'resolve-cancel',{requestId:r.id,outcome:'transferred',factsConfirmed:true,comment:'Уже передали'}).state:step(state,'handoff',r.id).state;
  assert.equal(state.requests[0].status,'transferred');assert.equal(state.services[0].sellerId,elena.id);assert.equal(E.resultsFor(state,elena).at(0).requestId,r.id);
 }
});

test('[AC-39] Выдача между предложением и принятием обслуживания сохраняет итог и авторов без повторной передачи',()=>{
 let state=working(),r=state.requests[0];state=step(state,'ready',r.id).state;state=action(state,seller,'offer-service',{serviceId:r.serviceId,toId:elena.id}).state;state=step(state,'handoff',r.id).state;const before=JSON.parse(JSON.stringify(state.requests));
 state=action(state,elena,'reply-service',{serviceId:r.serviceId,offerId:state.services[0].pendingTransfers[0].id,decision:'accept'}).state;assert.deepEqual(state.requests,before);assert.equal(E.resultsFor(state,elena)[0].label,'Товар передан');assert.equal(step(state,'handoff',r.id).replayed,true);assert.throws(()=>action(state,warehouse,'handoff',{requestId:r.id}));
});

test('[AC-40] Отмена и альтернатива проверяют продавца в обоих порядках относительно принятия обслуживания',()=>{
 for(const type of ['cancel-request','create']){
  let state=missed(),original=state.requests[0];state=action(state,seller,'create',{variantId:create.variantId,place:E.places[0],serviceId:original.serviceId}).state;const active=state.requests[1];state=action(state,seller,'offer-service',{serviceId:original.serviceId,toId:elena.id}).state;const offerId=state.services[0].pendingTransfers[0].id;
  const data=type==='create'?{variantId:'cotton-shirt~0~L',place:E.places[0],serviceId:original.serviceId,originRequestId:original.id,customerAgreed:true}:{requestId:active.id,reason:'Не нужен'};
  const before=action(state,seller,type,data).state;const acceptedAfter=action(before,elena,'reply-service',{serviceId:original.serviceId,offerId,decision:'accept'}).state;assert.deepEqual(acceptedAfter.requests,before.requests);
  const acceptedFirst=action(state,elena,'reply-service',{serviceId:original.serviceId,offerId,decision:'accept'}).state;assert.throws(()=>action(acceptedFirst,seller,type,data));assert.ok(action(acceptedFirst,elena,type,data).state);
 }
});

test('[AC-49] Просмотр, комментарии и передача не продлевают окно; новый исход начинает собственное',()=>{
 let state=missed(),first=state.requests[0],at=Date.parse(first.notFoundAt);const before=JSON.stringify(state);E.searchSummary(state,first.store,first.variant.id,at+1000);assert.equal(JSON.stringify(state),before);
 state=action(state,warehouse,'report-issue',{requestId:first.id,issueType:'not-found',comment:'Пояснение'},times[3]).state;assert.equal(state.requests[0].notFoundAt,first.notFoundAt);
 const created=action(state,seller,'create',{variantId:first.variant.id,place:E.places[0],serviceId:first.serviceId},times[3]);state=step(created.state,'accept',created.result.id).state;state=action(state,warehouse,'offer-search',{requestId:created.result.id,toId:pavel.id},times[3]).state;state=action(state,pavel,'reply-search',{requestId:created.result.id,offerId:state.requests[1].transfers[0].id,decision:'accept'},times[3]).state;
 assert.equal(E.searchSummary(state,first.store,first.variant.id,at+7200000).status,'expired');state=action(state,pavel,'not-found',{requestId:created.result.id},'2026-10-19T09:10:00Z').state;assert.equal(state.requests[0].notFoundAt,first.notFoundAt);assert.equal(E.searchSummary(state,first.store,first.variant.id,Date.parse('2026-10-19T09:11:00Z')).at,'2026-10-19T09:10:00Z');
});

test('[AC-52] Положительное обновление остатка не снимает предупреждение прежнего поиска',()=>{
 const state=missed(),r=state.requests[0],now=Date.parse(times[3]);const read=action(state,seller,'read-stock',{variantId:r.variant.id,serviceId:r.serviceId},times[3]).state;assert.equal(read.stockAttempts[0].quantity,4);assert.equal(E.searchSummary(read,r.store,r.variant.id,now).status,'active');assert.equal(read.requests[0].status,'not-found');
});

test('[AC-58] Отзыв и принятие обслуживания проверяются в обоих последовательных порядках',()=>{
 const first=sent(),id=first.result.serviceId,offered=action(first.state,seller,'offer-service',{serviceId:id,toId:elena.id}).state,offerId=offered.services[0].pendingTransfers[0].id;
 const revoked=action(offered,seller,'revoke-service',{serviceId:id,offerId}).state;const next=action(revoked,seller,'offer-service',{serviceId:id,toId:elena.id}).state;assert.throws(()=>action(next,elena,'reply-service',{serviceId:id,offerId,decision:'accept'}));assert.equal(next.services[0].pendingTransfers.filter(p=>p.status==='pending').length,1);
 const accepted=action(offered,elena,'reply-service',{serviceId:id,offerId,decision:'accept'}).state;assert.throws(()=>action(accepted,seller,'revoke-service',{serviceId:id,offerId}));assert.throws(()=>action(accepted,seller,'offer-service',{serviceId:id,toId:elena.id}));assert.equal(accepted.services[0].sellerId,elena.id);
});


test('[AC-53] Другой магазин не может принять или закрыть обращение',()=>{
 const state=reported(),id=state.cases[0].id;assert.throws(()=>action(state,{...senior,store:'other-store'},'claim-case',{caseId:id}));const claimed=action(state,senior,'claim-case',{caseId:id}).state;assert.throws(()=>action(claimed,{...senior,store:'other-store'},'close-case',{caseId:id,result:'found-source',comment:'Проверено'}));
});
