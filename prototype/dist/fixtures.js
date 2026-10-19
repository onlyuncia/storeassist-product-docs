(function(root){
  'use strict';
  function makeStress(E,now=Date.now()){
    let state=E.initial();
    for(let i=0;i<20;i++){
      const product=E.catalog[i%E.catalog.length];
      const started=now-(2+i%11)*60000;
      const created=E.apply(state,E.actors.seller,{id:`fixture-create-${i}`,type:'create',variantId:`${product.id}~${i%2}~${product.sizes[i%3]}`,place:E.places[i%E.places.length],serviceId:null},new Date(started).toISOString());
      state=created.state;
      if(i%3>0)state=E.apply(state,E.actors.warehouse,{id:`fixture-accept-${i}`,type:'accept',requestId:created.result.id},new Date(started+30000).toISOString()).state;
      if(i%3===2)state=E.apply(state,E.actors.warehouse,{id:`fixture-ready-${i}`,type:'ready',requestId:created.result.id},new Date(started+60000).toISOString()).state;
      // Deliberately long display strings, confined to this synthetic fixture.
      const request=state.requests.at(-1);
      if(i%4===0)request.variant.name='Рубашка свободного кроя из хлопка с длинным рукавом — специальная демонстрационная модель';
      if(i===3)request.variant.name='МодельБезПробеловДляПроверкиПереносаОченьДлинногоНаименованияТовараВКарточкеОчереди';
      if(i%5===0)request.place='Торговый зал · дальняя зона у примерочных за центральным проходом';
      if(i%6===0)state.services.at(-1).sellerName='Анна Александровна · консультант торгового зала';
    }
    for(const event of state.resultEvents||[]){const owner=state.services.find(s=>s.id===event.serviceId)?.sellerId;if(owner)event.readBy=[owner];}
    return state;
  }
  const api={makeStress};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.StoreAssistFixtures=api;
})(typeof window!=='undefined'?window:globalThis);
