"""Build StoreAssist BPMN models, SVG previews and the request state diagram.

Python 3.10+, standard library. PNG export is a separate optional step.
Run from any directory: python scripts/build-diagrams.py
"""
from pathlib import Path
from dataclasses import dataclass, field
import html,json,math,re,textwrap,runpy
import xml.etree.ElementTree as E

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/diagrams'
TASK_KINDS=('manualTask','userTask','serviceTask')
TASK_LABELS={'manualTask':'Вне приложения','userTask':'Сотрудник в приложении','serviceTask':'Автоматически'}
NS={'bpmn':'http://www.omg.org/spec/BPMN/20100524/MODEL','bpmndi':'http://www.omg.org/spec/BPMN/20100524/DI','dc':'http://www.omg.org/spec/DD/20100524/DC','di':'http://www.omg.org/spec/DD/20100524/DI','xsi':'http://www.w3.org/2001/XMLSchema-instance'}
for p,u in NS.items():E.register_namespace(p,u)
def el(p,t,**kw):return E.SubElement(p,'{'+NS['bpmn']+'}'+t,kw)
def q(p,t,**kw):return E.SubElement(p,'{'+NS[t.split(':')[0]]+'}'+t.split(':')[1],{k:str(v) for k,v in kw.items()})
def esc(t):return html.escape(str(t),quote=True)
def lines(t,w,size=16):
    result=[]
    for row in t.split('\n'):
        result+=textwrap.wrap(row,max(6,int(w/(size*.54))),break_long_words=False,break_on_hyphens=False) or ['']
    return result
def text(x,y,t,w=180,size=16,anchor='middle',color='#1d2c42',weight=400):
    ls=lines(t,w,size);dy=size*1.3
    return f'<text x="{x}" y="{y-(len(ls)-1)*dy/2}" text-anchor="{anchor}" font-family="Segoe UI,Arial,sans-serif" font-size="{size}" font-weight="{weight}" fill="{color}">'+''.join(f'<tspan x="{x}" dy="{0 if i==0 else dy}">{esc(s)}</tspan>' for i,s in enumerate(ls))+'</text>'

def task_marker(kind,x,y):
    """Standard task markers, drawn as vectors to avoid font-dependent pictograms."""
    if kind=='manualTask':
        body='<path d="M5 16 L3 12 Q2 10 4 9 Q5 8 7 11 L8 12 L8 4 Q8 2 10 2 Q12 2 12 4 L12 11 L12 2 Q12 0 14 0 Q16 0 16 2 L16 11 L16 4 Q16 2 18 2 Q20 2 20 4 L20 13 L20 8 Q20 6 22 6 Q24 6 24 8 L24 17 Q24 24 17 24 L13 24 Q9 24 7 20 Z" transform="scale(.82)" fill="#fff" stroke="#34527c" stroke-width="1.5" stroke-linejoin="round"/>'
    elif kind=='userTask':
        body='<circle cx="11" cy="5" r="4" fill="white" stroke="#34527c" stroke-width="1.5"/><path d="M3 22 L3 16 Q3 11 8 11 L14 11 Q19 11 19 16 L19 22 Z M7 16 L7 22 M15 16 L15 22" fill="white" stroke="#34527c" stroke-width="1.5" stroke-linejoin="round"/>'
    else:
        def gear(cx,cy,r):
            pts=[]
            for k in range(32):
                a=k*math.pi/16;rr=r if k%4 in [1,2] else r*.73;pts.append(f'{cx+rr*math.cos(a):.2f},{cy+rr*math.sin(a):.2f}')
            return '<polygon points="'+' '.join(pts)+'" fill="white" stroke="#34527c" stroke-width="1.2"/>'+f'<circle cx="{cx}" cy="{cy}" r="{r*.32}" fill="white" stroke="#34527c" stroke-width="1.2"/>'
        body=gear(8,9,7.7)+gear(19,18,6.2)
    return f'<g data-task-marker="{kind}" transform="translate({x},{y})">{body}</g>'

@dataclass
class Node:
    id:str;name:str;kind:str;lane:int;x:float;y:float;w:float=190;h:float=82
    documentation:str=''
    condition:str=''
    def pt(self,side):
        return {'L':(self.x,self.y+self.h/2),'R':(self.x+self.w,self.y+self.h/2),'T':(self.x+self.w/2,self.y),'B':(self.x+self.w/2,self.y+self.h)}[side]
@dataclass
class Flow:
    a:str;b:str;label:str='';sa:str='R';sb:str='L';via:list=field(default_factory=list);labelpos:tuple|None=None
    points:list=field(default_factory=list)

class Diagram:
    def __init__(self,slug,title,subtitle,width,lanes,notes,refs):
        self.slug=slug;self.title=title;self.subtitle=subtitle;self.width=width;self.lanes=lanes;self.notes=notes;self.refs=refs;self.nodes={};self.flows=[]
        self.bottom=140+sum(h for _,h in lanes);self.height=self.bottom+115+len(notes)*25
    def n(self,id,name,lane,x,y,kind='task',w=190,h=82,doc=''):
        if kind in ['startEvent','endEvent','intermediateCatchEvent']:w=h=34
        if kind in ['exclusiveGateway','eventBasedGateway']:w=h=52
        assert id not in self.nodes
        self.nodes[id]=Node(id,name,kind,lane,x,y,w,h,doc);return id
    def f(self,a,b,label='',sa='R',sb='L',via=None,lp=None):self.flows.append(Flow(a,b,label,sa,sb,via or [],lp))
    def route(self,f):
        if f.points:return f.points
        a=self.nodes[f.a].pt(f.sa);b=self.nodes[f.b].pt(f.sb)
        if f.via:
            raw=[a]+f.via+[b];pts=[a]
            for i,p in enumerate(raw[1:],1):
                prev=pts[-1]
                if prev[0]!=p[0] and prev[1]!=p[1]:
                    if i==len(raw)-1:bend=(prev[0],p[1]) if f.sb in ['L','R'] else (p[0],prev[1])
                    elif i==1:bend=(p[0],prev[1]) if f.sa in ['L','R'] else (prev[0],p[1])
                    else:bend=(p[0],prev[1])
                    pts.append(bend)
                if p!=pts[-1]:pts.append(p)
            return pts
        if a[0]==b[0] or a[1]==b[1]:return [a,b]
        if f.sa in ['L','R'] and f.sb in ['L','R']:
            mid=(a[0]+b[0])/2;return [a,(mid,a[1]),(mid,b[1]),b]
        if f.sa in ['T','B'] and f.sb in ['T','B']:
            mid=(a[1]+b[1])/2;return [a,(a[0],mid),(b[0],mid),b]
        return [a,(b[0],a[1]),b] if f.sa in ['L','R'] else [a,(a[0],b[1]),b]
    def validate(self):
        incoming={i:[] for i in self.nodes};outgoing={i:[] for i in self.nodes}
        for f in self.flows:
            assert f.a in self.nodes and f.b in self.nodes
            outgoing[f.a].append(f);incoming[f.b].append(f)
            for x,y in self.route(f):assert 170<=x<=self.width-30 and 140<=y<=self.bottom,(self.slug,f,x,y)
        starts=[i for i,n in self.nodes.items() if n.kind=='startEvent'];ends=[i for i,n in self.nodes.items() if n.kind=='endEvent']
        assert len(starts)==1 and ends
        for i,n in self.nodes.items():
            assert (not incoming[i])==(n.kind=='startEvent'),(self.slug,i,'incoming')
            assert (not outgoing[i])==(n.kind=='endEvent'),(self.slug,i,'outgoing')
            assert len(outgoing[i])<=1 or n.kind in ['exclusiveGateway','eventBasedGateway'],(self.slug,i,'implicit fork')
            if n.kind=='exclusiveGateway' and len(outgoing[i])>1:assert all(f.label for f in outgoing[i])
            top=140+sum(h for _,h in self.lanes[:n.lane]);assert n.y>=top and n.y+n.h<=top+self.lanes[n.lane][1],(self.slug,i,'lane bounds')
            assert n.kind!='task',(self.slug,i,'untyped task')
            if n.kind in TASK_KINDS:assert len(lines(n.name,n.w-54))*20.8<=n.h-12,(self.slug,i,'text does not fit')
        def walk(seed,reverse=False):
            seen=set(seed);todo=list(seed)
            while todo:
                i=todo.pop()
                for f in incoming[i] if reverse else outgoing[i]:
                    j=f.a if reverse else f.b
                    if j not in seen:seen.add(j);todo.append(j)
            return seen
        assert walk(starts)==self.nodes.keys(),(self.slug,'unreachable')
        assert walk(ends,True)==self.nodes.keys(),(self.slug,'no completion path')
        for i,a in self.nodes.items():
            for j,b in self.nodes.items():
                if i>=j:continue
                assert not (a.x<b.x+b.w and a.x+a.w>b.x and a.y<b.y+b.h and a.y+a.h>b.y),(self.slug,'node overlap',i,j)
    def bpmn(self):
        d=E.Element('{'+NS['bpmn']+'}definitions',{'id':'Definitions_'+self.slug.replace('-','_'),'targetNamespace':'https://storeassist.example/portfolio/bpmn','exporter':'StoreAssist diagram builder'})
        pid='Process_'+self.slug.replace('-','_');process=el(d,'process',id=pid,name=self.title,isExecutable='false')
        el(process,'documentation').text=self.subtitle+'\n'+'\n'.join(self.notes)+'\nТребования: '+', '.join(self.refs)
        laneset=el(process,'laneSet',id='Lanes')
        for i,(name,h) in enumerate(self.lanes):
            lane=el(laneset,'lane',id='Lane_'+str(i),name=name)
            for n in self.nodes.values():
                if n.lane==i:el(lane,'flowNodeRef').text=n.id
        for n in self.nodes.values():
            e=el(process,n.kind,id=n.id,name=n.name.replace('\n',' '))
            if n.documentation:el(e,'documentation').text=n.documentation
            for k,f in enumerate(self.flows):
                if f.b==n.id:el(e,'incoming').text='Flow_'+str(k)
            for k,f in enumerate(self.flows):
                if f.a==n.id:el(e,'outgoing').text='Flow_'+str(k)
            if n.kind=='intermediateCatchEvent':
                assert n.condition,(self.slug,n.id,'missing conditional trigger')
                definition=el(e,'conditionalEventDefinition',id='Condition_'+n.id)
                condition=el(definition,'condition');condition.set('{'+NS['xsi']+'}type','bpmn:tFormalExpression');condition.text=n.condition
        for i,f in enumerate(self.flows):
            e=el(process,'sequenceFlow',id='Flow_'+str(i),sourceRef=f.a,targetRef=f.b)
            if f.label:
                e.set('name',f.label)
                if self.nodes[f.a].kind=='exclusiveGateway':
                    c=el(e,'conditionExpression');c.set('{'+NS['xsi']+'}type','bpmn:tFormalExpression');c.text=f.label
        collab=el(d,'collaboration',id='Collaboration');el(collab,'participant',id='Store',name='Магазин · StoreAssist' if 'as-is' not in self.slug else 'Магазин · исходный процесс',processRef=pid)
        diagram=q(d,'bpmndi:BPMNDiagram',id='Diagram');plane=q(diagram,'bpmndi:BPMNPlane',id='Plane',bpmnElement='Collaboration')
        shape=q(plane,'bpmndi:BPMNShape',id='Shape_Store',bpmnElement='Store',isHorizontal='true');q(shape,'dc:Bounds',x=30,y=140,width=self.width-60,height=self.bottom-140)
        top=140
        for i,(name,h) in enumerate(self.lanes):
            shape=q(plane,'bpmndi:BPMNShape',id='Shape_Lane_'+str(i),bpmnElement='Lane_'+str(i),isHorizontal='true');q(shape,'dc:Bounds',x=60,y=top,width=self.width-90,height=h);top+=h
        for n in self.nodes.values():
            shape=q(plane,'bpmndi:BPMNShape',id='Shape_'+n.id,bpmnElement=n.id)
            if n.kind=='exclusiveGateway':shape.set('isMarkerVisible','true')
            q(shape,'dc:Bounds',x=n.x,y=n.y,width=n.w,height=n.h)
            if n.kind not in TASK_KINDS:
                x,y,w,h=LAYOUT['node_labels'](self,lines)[n.id]
                label=q(shape,'bpmndi:BPMNLabel');q(label,'dc:Bounds',x=x,y=y,width=w,height=h)
        for i,f in enumerate(self.flows):
            edge=q(plane,'bpmndi:BPMNEdge',id='Edge_'+str(i),bpmnElement='Flow_'+str(i))
            for x,y in self.route(f):q(edge,'di:waypoint',x=x,y=y)
            if f.label and f.labelpos:
                x,y,w,h=LAYOUT['label_box'](f.label,f.labelpos,lines)
                label=q(edge,'bpmndi:BPMNLabel');q(label,'dc:Bounds',x=x,y=y,width=w,height=h)
        E.indent(d,space='  ');E.ElementTree(d).write(OUT/(self.slug+'.bpmn'),encoding='utf-8',xml_declaration=True)
    def svg(self):
        s=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" height="{self.height}" viewBox="0 0 {self.width} {self.height}" role="img" aria-labelledby="title desc"><title id="title">{esc(self.title)}</title><desc id="desc">{esc(self.subtitle)}</desc>',
           '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L8 4.5 L0 9 Z" fill="#42536c" stroke="#42536c" stroke-width="1"/></marker></defs>',f'<rect width="100%" height="100%" fill="#fff"/>',text(32,38,self.title,w=self.width-70,size=27,anchor='start',weight=650),text(32,76,self.subtitle,w=self.width-70,size=16,anchor='start',color='#607087')]
        for kind,lx in [('manualTask',35),('userTask',410),('serviceTask',850)]:
            s.extend([task_marker(kind,lx,98),text(lx+33,115,TASK_LABELS[kind],w=315,size=14,anchor='start',color='#496286')])
        y=140
        header_width=getattr(self,'header_width',140)
        for i,(name,h) in enumerate(self.lanes):
            s += [f'<rect x="30" y="{y}" width="{self.width-60}" height="{h}" fill="{["#f7f9fc","#ffffff"][i%2]}" stroke="#c8d2df"/>',f'<rect x="30" y="{y}" width="{header_width}" height="{h}" fill="#edf2f8" stroke="#c8d2df"/>',text(30+header_width/2,y+h/2,name,w=header_width-24,size=16,weight=600)]
            y+=h
        for i,f in enumerate(self.flows):
            pts=self.route(f);s.append(f'<polyline data-flow="Flow_{i}" points="'+ ' '.join(f'{x},{y}' for x,y in pts)+'" fill="none" stroke="#42536c" stroke-width="1.8" stroke-linejoin="round" marker-end="url(#arrow)"/>')
        for f in self.flows:
            if f.label:
                x,y=f.labelpos or tuple((a+b)/2 for a,b in zip(self.route(f)[0],self.route(f)[1]));ls=lines(f.label,146,14)
                bw=min(156,max(len(v) for v in ls)*8+14)
                s += [text(x,y+4,f.label,w=146,size=14,color='#42536c')]
        for n in self.nodes.values():
            x,y,w,h=n.x,n.y,n.w,n.h;s.append(f'<g data-node="{n.id}">')
            if n.kind in TASK_KINDS:
                s += [f'<rect data-task-type="{n.kind}" x="{x}" y="{y}" width="{w}" height="{h}" rx="11" fill="#edf4ff" stroke="#7d9cc9" stroke-width="1.5"/>',task_marker(n.kind,x+9,y+9),text(x+w/2+12,y+h/2+5,n.name,w=w-54)]
            elif 'Gateway' in n.kind:
                s.append(f'<path d="M{x+w/2},{y} L{x+w},{y+h/2} L{x+w/2},{y+h} L{x},{y+h/2} Z" fill="white" stroke="#6f86a5" stroke-width="1.8"/>')
                marker_scale=w/52
                s.append(f'<g transform="translate({x},{y}) scale({marker_scale})">')
                if n.kind=='exclusiveGateway':s.append('<path d="M18,18 L34,34 M34,18 L18,34" stroke="#42536c" stroke-width="2"/>')
                else:
                    s.append('<circle cx="26" cy="26" r="14" fill="none" stroke="#42536c"/><circle cx="26" cy="26" r="11" fill="none" stroke="#42536c"/>')
                    s.append('<path d="M26,17 L35,24 L32,34 L20,34 L17,24 Z" fill="none" stroke="#42536c"/>')
                s.append('</g>')
                box=LAYOUT['node_labels'](self,lines)[n.id];cy=box[1]+box[3]/2+5
                s.append(text(box[0]+box[2]/2,cy,n.name,w=box[2],size=14,weight=600))
            else:
                s.append(f'<g transform="translate({x},{y}) scale({w/34})"><circle cx="17" cy="17" r="16" fill="white" stroke="#34527c" stroke-width="{3.5 if n.kind=="endEvent" else 1.8}"/>')
                if n.kind=='intermediateCatchEvent':
                    s.append('<g data-event-type="conditional"><circle cx="17" cy="17" r="12" fill="none" stroke="#34527c"/><rect x="11" y="9" width="12" height="16" fill="white" stroke="#34527c"/><path d="M13,13 H21 M13,17 H21 M13,21 H21" fill="none" stroke="#34527c" stroke-width="1"/></g>')
                s.append('</g>')
                box=LAYOUT['node_labels'](self,lines)[n.id];cy=box[1]+box[3]/2+5
                s.append(text(box[0]+box[2]/2,cy,n.name,w=box[2],size=14))
            s.append('</g>')
        y=self.bottom+35
        if self.refs:s += [text(32,y,'Связи: '+', '.join(self.refs),w=self.width-70,size=14,anchor='start',color='#496286')]
        for note in self.notes:
            y+=27;s.append(text(32,y,note,w=self.width-70,size=15,anchor='start',color='#607087'))
        s.append('</svg>');(OUT/(self.slug+'.svg')).write_text('\n'.join(s),encoding='utf-8')
    def build(self):self.validate();self.bpmn();self.svg()

DIAGRAMS=[]

# 01. Confirmed AS-IS actions only; no historical application states inferred.
d=Diagram('01-bpmn-as-is','AS-IS · запрос товара со склада','Исходный процесс: продавец с iPod и сотрудник склада со складским терминалом.',1960,[('Продавец · iPod',220),('Сотрудник склада',450)],['Отмена: продавец отмечал её в iPod, склад видел её на терминале. Детальный порядок разрешения отмены в AS-IS не установлен.','Статусы исходного приложения не воспроизводятся. При неудачном поиске результат сообщался лично в зале.'],[])
d.n('Need','Нужен вариант товара',0,205,220,'startEvent')
d.n('Choose','Уточнить товар,\nразмер и цвет',0,295,190)
d.n('Stock','Проверить наличие\nна iPod',0,545,190)
d.n('Send','Отправить запрос;\nвидеть очередь',0,795,190)
d.n('Search','Искать вещь по\nстеллажу и секции',1,1010,420,w=220)
d.n('Found','Вещь найдена?',1,1330,435,'exclusiveGateway')
d.n('Deliver','Вынести вещь; найти\nпродавца и передать',1,1480,410,w=220)
d.n('Confirm','Подтвердить передачу\nна терминале',1,1480,600,w=220)
d.n('Tell','Выйти в зал; лично\nсообщить о неудаче',1,1010,600,w=220)
d.n('Continue','Продолжить\nобслуживание',0,1500,190)
d.n('End','Обслуживание продолжается',0,1810,220,'endEvent')
d.f('Need','Choose');d.f('Choose','Stock');d.f('Stock','Send');d.f('Send','Search',sa='B',sb='T',via=[(890,325),(1120,325)])
d.f('Search','Found');d.f('Found','Deliver','Да',lp=(1430,450));d.f('Deliver','Confirm',sa='B',sb='T')
d.f('Found','Tell','Нет',sa='B',sb='R',via=[(1356,641)],lp=(1310,557))
d.f('Tell','Continue',sa='L',sb='T',via=[(950,641),(950,365),(1440,365),(1440,160),(1595,160)])
d.f('Confirm','Continue',sa='R',sb='R',via=[(1760,641),(1760,231)])
d.f('Continue','End');DIAGRAMS.append(d)

# 02. Overview: a single request instance. Alternatives create a NEW instance.
d=Diagram('02-bpmn-to-be','TO-BE · от запроса до выдачи','Основной сценарий. Правила создания раскрыты на схеме 03; отмена — на схеме 04.',2500,[('Продавец · iPod',230),('StoreAssist',230),('Сотрудник склада',560)],['«Не найдено» завершает этот запрос. Альтернатива создаёт отдельный связанный запрос в том же обслуживании.','Обращение о расхождении выполняется независимо (схема 05); передачи работы — схемы 06–07.','С 5 минут активный запрос только выделяется; время создания не сбрасывается. Это настройка пилота, не SLA.'],['FR-02','FR-04','FR-06','FR-07','FR-08','FR-13','FR-25','FR-26','FR-31','FR-32'])
d.n('Need','Нужен вариант товара',0,205,215,'startEvent')
d.n('Prepare','Выбрать вариант и зону;\nвыполнить отправку\nпо схеме 03',0,300,175,w=220,h=100)
d.n('Created','Запрос создан?',1,610,445,'exclusiveGateway')
d.n('NotCreated','Запрос не создан',1,800,500,'endEvent')
d.n('Number','Показать номер,\n«Создан» и время',1,860,410,w=210)
d.n('Accept','Принять запрос;\n«В работе»',2,1100,650,w=200)
d.n('Search','Искать нужный\nвариант',2,1350,650,w=235)
d.n('RecordPlaces','Отметить проверенные\nместа в карточке',2,1350,790,w=235,h=96)
d.n('Found','Вещь найдена?',2,1670,805,'exclusiveGateway')
d.n('Ready','Отметить\n«Готов к передаче»',2,1830,785,w=235,h=96)
d.n('Deliver','Вынести в выбранную зону;\nпередать текущему продавцу',2,1830,980,w=235,h=96)
d.n('Confirm','Подтвердить передачу\nна терминале',2,1540,980,w=220)
d.n('Passed','Передан',2,1410,1005,'endEvent')
d.n('NotFound','Сохранить «Не найдено»;\nкомментарий необязателен',2,1100,980,w=235,h=96)
d.n('Notify','Показать исход и\nуведомление в iPod',1,1115,420,w=220)
d.n('Alternatives','Открыть варианты модели\nи связи каталога',0,1290,170,w=220,h=108)
d.n('AgreeWithBuyer','Согласовать вариант\nс покупателем',0,1560,175,w=220,h=100)
d.n('Agreed','Вариант выбран\nи согласован?',0,1840,200,'exclusiveGateway')
d.n('NoAlternative','Новый запрос не создан',0,1610,280,'endEvent')
d.n('New','Отправить отдельный\nсвязанный запрос\nпо схеме 03',0,2000,175,w=220,h=100)
d.n('NewEnd','Новая попытка\nпо отдельному запросу',0,2320,210,'endEvent')
d.f('Need','Prepare');d.f('Prepare','Created',sa='B',sb='T',via=[(410,345),(636,345)])
d.f('Created','NotCreated','Нет',sa='B',sb='L',via=[(636,517)],lp=(727,510))
d.f('Created','Number','Да',lp=(762,457));d.f('Number','Accept',sa='B',sb='T',via=[(965,590),(1200,590)])
d.f('Accept','Search');d.f('Search','RecordPlaces',sa='B',sb='T');d.f('RecordPlaces','Found');d.f('Found','Ready','Да',lp=(1770,842))
d.f('Ready','Deliver',sa='B',sb='T');d.f('Deliver','Confirm',sa='L',sb='R');d.f('Confirm','Passed',sa='L',sb='R')
d.f('Found','NotFound','Нет',sa='B',sb='T',via=[(1696,920),(1217.5,920)],lp=(1490,910))
d.f('NotFound','Notify',sa='L',sb='L',via=[(1085,1028),(1085,461)])
d.f('Notify','Alternatives',sa='T',sb='B',via=[(1225,390),(1400,390)])
d.f('Alternatives','AgreeWithBuyer');d.f('AgreeWithBuyer','Agreed');d.f('Agreed','New','Да',lp=(1950,215));d.f('New','NewEnd')
d.f('Agreed','NoAlternative','Нет',sa='B',sb='T',lp=(1960,300));DIAGRAMS.append(d)
d.nodes['Created'].caption_x=520
d.nodes['NoAlternative'].caption_y=355
d.nodes['Agreed'].caption_y=175
d.nodes['Agreed'].caption_x=1886

# 03. Stock read belongs to one intentional attempt; warning confirmation does not loop back to refresh.
d=Diagram('03-bpmn-create-request','TO-BE · проверка наличия и создание запроса','Одинаковое правило для обычного запроса и согласованной альтернативы.',2000,[('Текущий продавец',290),('StoreAssist',360)],['Подтверждение предупреждения относится к выбранному варианту и текущей попытке; повторного чтения по кругу нет.','Для альтернативы предварительно нужны выбор продавца и согласие покупателя; оно не заменяет подтверждение неизвестного наличия.','Потеря ответа StoreAssist: уточнить сохранённый результат, повторить то же действие без дубля. Принятие не является резервом.'],['FR-01','FR-02','FR-11','FR-16','FR-18','FR-26','FR-31','FR-32'])
d.n('Intent','Новая отправка',0,205,220,'startEvent')
d.n('Choose','Выбрать точный вариант\nи зону; учесть прошлый\nпоиск, если он был',0,295,175,w=245,h=106)
d.n('Read','Получить текущий остаток\nсвоего магазина и варианта',1,570,485,w=245,h=96)
d.n('Value','Результат\nобновления?',1,895,505,'exclusiveGateway')
d.n('Zero','Актуальный ноль:\nзапрос запрещён',1,1110,450,'endEvent')
d.n('Warning','Показать предупреждение:\nналичие не подтверждено',1,1100,650,w=240,h=96)
d.n('Confirm','Явно подтвердить\nотправку после\nпредупреждения',0,1200,175,w=230,h=106)
d.n('Consent','Подтверждено?',0,1500,205,'exclusiveGateway')
d.n('No','Запрос не создан',0,1720,220,'endEvent')
d.n('Merge','Отправка разрешена',1,1495,505,'exclusiveGateway')
d.n('Create','Создать запрос:\nномер, время, вариант\nи обслуживание',1,1690,475,w=245,h=106)
d.n('Done','Запрос создан',1,1820,690,'endEvent')
d.f('Intent','Choose');d.f('Choose','Read',sa='B',sb='T',via=[(417.5,390),(692.5,390)])
d.f('Read','Value');d.f('Value','Zero','Ноль',sa='T',sb='L',via=[(921,467)],lp=(1030,455))
d.f('Value','Warning','Нет актуальных данных',sa='B',sb='L',via=[(921,698)],lp=(1000,640))
d.f('Warning','Confirm',sa='T',sb='B',via=[(1220,610),(1380,610),(1380,340),(1315,340)])
d.f('Confirm','Consent');d.f('Consent','No','Нет',lp=(1640,218))
d.f('Consent','Merge','Да',sa='B',sb='T',via=[(1526,380),(1521,380)],lp=(1545,395))
d.f('Value','Merge','Положительный остаток',sa='R',sb='L',via=[(1390,531)],lp=(1250,523))
d.f('Merge','Create');d.f('Create','Done',sa='B',sb='T');DIAGRAMS.append(d)
d.nodes['Zero'].caption_x=1250
d.nodes['Zero'].caption_y=210

# Keep the warning and the seller's answer on the same side of the positive-stock path.
# This avoids a crossing caused by placing the confirmation above that path.
d.lanes=[('StoreAssist',440),('Текущий продавец',250)];d.width=2160;d.bottom=830;d.height=d.bottom+115+len(d.notes)*25
for id in ['Intent','Choose','Confirm','Consent','No']:d.nodes[id].lane=1
for id in ['Read','Value','Zero','Warning','Merge','Create','Done']:d.nodes[id].lane=0
for id,x,y in [('Intent',205,655),('Choose',295,620),('Read',570,280),('Value',895,300),('Zero',1110,195),('Warning',1100,440),('Confirm',1200,620),('Consent',1500,645),('No',1720,655),('Merge',1495,300),('Create',1690,280),('Done',2040,315)]:
    d.nodes[id].x=x;d.nodes[id].y=y

# 04. Cancellation of an existing request. Pending cancellation is NOT a request status.
d=Diagram('04-bpmn-cancellation','TO-BE · отмена и фактическая передача','Продавец запрашивает отмену; начатый запрос завершает текущий складской исполнитель.',2220,[('Текущий продавец',190),('StoreAssist',230),('Складской исполнитель',400),('Руководитель смены',210)],['Если факт не выяснен, запрос активен с ожидающей отменой; часы ожидания и назначение сохраняются.','Руководитель помогает сверить факты, но не завершает запрос вместо исполнителя. Итог сверки и причина отмены остаются в истории.','Перед сохранением проверяются текущий исполнитель и состояние; завершённый исход не переписывается. Неизвестный ответ требует сверки.'],['FR-07','FR-09','FR-10','FR-12','FR-16','RULE-08','RULE-09','RULE-27'])
d.n('Need','Запрос стал неактуален',0,205,210,'startEvent')
d.n('Cancel','Запросить отмену\nс обязательной причиной',0,300,175,w=235,h=96)
d.n('State','Текущее состояние?',1,615,405,'exclusiveGateway')
d.n('Immediate','Сохранить «Отменён»\nдо принятия складом',1,835,350,w=225)
d.n('ImmediateEnd','Отменён',1,1150,375,'endEvent')
d.n('Final','Показать сохранённый\nфинальный исход',1,835,470,w=225)
d.n('FinalEnd','Исход не переписан',1,1150,500,'endEvent')
d.n('Flag','Показать складу\n«Запрошена отмена»',1,1330,410,w=225)
d.n('Fact','Проверить факт передачи\nи положение вещи',2,1610,600,w=230)
d.n('Dispute','Есть спор?',2,1920,615,'exclusiveGateway')
d.n('Help','Сверить факты с текущим\nпродавцом и исполнителем',3,1620,1015,w=250,h=96)
d.n('Outcome','Что установлено?',2,1900,800,'exclusiveGateway')
d.n('Passed','Подтвердить передачу\nна терминале',2,1550,740,w=230)
d.n('PassedEnd','Передан',2,1420,765,'endEvent')
d.n('Stopped','Подтвердить отмену\nна терминале',2,1550,865,w=230)
d.n('StoppedEnd','Отменён',2,1420,890,'endEvent')
d.n('Wait','Продолжить сверку;\nне подтверждать\nпредполагаемый исход',3,1080,1015,w=250,h=96)
d.f('Need','Cancel');d.f('Cancel','State',sa='B',sb='L',via=[(417.5,431)])
d.f('State','Immediate','Создан',sa='R',sb='L',via=[(740,431),(740,391)],lp=(755,370));d.f('Immediate','ImmediateEnd')
d.f('State','Final','Уже финален',sa='B',sb='L',via=[(641,511)],lp=(735,510));d.f('Final','FinalEnd')
d.f('State','Flag','Начат',sa='T',sb='T',via=[(641,340),(1442.5,340)],lp=(1260,350))
d.f('Flag','Fact',sa='R',sb='T',via=[(1725,451)]);d.f('Fact','Dispute')
d.f('Dispute','Help','Да',sa='R',sb='R',via=[(2110,641),(2110,1063)],lp=(2090,900))
d.f('Dispute','Outcome','Нет',sa='B',sb='T',lp=(1965,737))
d.f('Help','Outcome',sa='T',sb='R',via=[(1745,985),(2050,985),(2050,826)])
d.f('Outcome','Passed','Уже передан',sa='L',sb='R',via=[(1840,826),(1840,781)],lp=(1840,755));d.f('Passed','PassedEnd',sa='L',sb='R')
d.f('Outcome','Stopped','Не передан;\nположение урегулировано',sa='B',sb='R',via=[(1926,906)],lp=(1945,950));d.f('Stopped','StoppedEnd',sa='L',sb='R')
d.f('Outcome','Wait','Факт не выяснен',sa='T',sb='T',via=[(1926,710),(1205,710)],lp=(1360,700))
d.f('Wait','Fact',sa='L',sb='L',via=[(1000,1063),(1000,641)]);DIAGRAMS.append(d)
d.width=2320
d.nodes['Dispute'].caption_y=590
d.nodes['Dispute'].caption_x=2020
d.nodes['Outcome'].caption_y=740
d.nodes['Outcome'].caption_x=1800

# 05. Adding an episode does not start a second verification of an already open case.
d=Diagram('05-bpmn-discrepancy','TO-BE · проверка наличия и размещения','Отдельное обращение. Его жизненный цикл не завершает и не открывает запрос выдачи.',2200,[('Сотрудник склада',190),('StoreAssist',250),('Старший склада',290),('Уполномоченный по учёту',200)],['Открытое обращение по тому же магазину и варианту дополняется эпизодом; прежний ответственный и время создания сохраняются.','Старший закрывает только завершённую проверку с результатом. Его роль не предоставляет права менять учёт.','После проверки размещения и при открытии карточки адрес читается заново. Сбой: последнее значение с предупреждением; наблюдение отдельно.'],['FR-21','FR-22','FR-23','FR-24','FR-34','RULE-14','RULE-15','RULE-24','RULE-28'])
d.n('Issue','Не найдено /\nдругое место хранения',0,205,210,'startEvent')
d.n('Report','Сообщить проблему\nсвоего магазина и варианта',0,310,175,w=240,h=96)
d.n('Existing','Есть открытое\nобращение?',1,620,410,'exclusiveGateway')
d.n('Append','Добавить эпизод;\nсохранить ответственного',1,850,360,w=240,h=96)
d.n('Appended','Проверка продолжается\nв существующем обращении',1,1190,390,'endEvent')
d.n('New','Создать обращение;\nпоказать старшему склада',1,850,480,w=240,h=96)
d.n('Accept','Принять обращение;\nсохранить ответственного\nстаршего и время',2,1160,620,w=240,h=106)
d.n('Review','Провести или организовать\nпроверку до результата',2,1460,620,w=240,h=96)
d.n('Fix','Нужно исправление?',2,1780,640,'exclusiveGateway')
d.n('Accounting','Исправить данные\nв действующей системе',3,1780,910,w=250,h=106)
d.n('Close','Сохранить итог и сведения\nоб операции, если была;\nзакрыть проверку',2,1430,772,w=260,h=96)
d.n('Refresh','Если проверялось размещение:\nзаново прочитать адрес\nиз источника по FR-34',1,1440,470,w=260,h=106)
d.n('Done','Проверка закрыта',1,1830,505,'endEvent')
d.f('Issue','Report');d.f('Report','Existing',sa='B',sb='T',via=[(430,315),(646,315)])
d.f('Existing','Append','Да',sa='R',sb='L',via=[(760,436),(760,408)],lp=(760,385));d.f('Append','Appended')
d.f('Existing','New','Нет',sa='B',sb='L',via=[(646,528)],lp=(755,520))
d.f('New','Accept',sa='R',sb='T',via=[(1280,528)]);d.f('Accept','Review');d.f('Review','Fix')
d.f('Fix','Accounting','Да',sa='R',sb='R',via=[(2100,666),(2100,963)],lp=(2085,840))
d.f('Fix','Close','Нет',sa='B',sb='R',via=[(1806,828)],lp=(1795,770))
d.f('Accounting','Close',sa='L',sb='B',via=[(1560,963)])
d.f('Close','Refresh',sa='L',sb='L',via=[(1410,828),(1410,523)])
d.f('Refresh','Done');DIAGRAMS.append(d)

# 06. Warehouse handover is restricted by request state; old executor remains until acceptance.
d=Diagram('06-bpmn-search-handover','TO-BE · передача поиска на складе','Текущий исполнитель или руководитель вручную выбирает другого складского сотрудника своего магазина.',2380,[('Исполнитель / руководитель',210),('Выбранный коллега склада',220),('StoreAssist',370)],['Разрешено только «В работе», без ожидающей отмены; чужой магазин, неподходящая роль и выбор себя отклоняются.','До сохранённого принятия отвечает прежний исполнитель. При отказе, отзыве или отсутствии ответа автоматического назначения нет.','Повтор после потерянного ответа уточняет тот же результат; исходные времена и проверенные места сохраняются.'],['FR-19','FR-20','FR-12','FR-16','RULE-12','RULE-13'])
d.n('Need','Нужна помощь в поиске',0,205,215,'startEvent')
d.n('Choose','Вручную выбрать\nдругого коллегу склада\nсвоего магазина',0,300,175,w=250,h=106)
d.n('Check','Проверить инициатора,\nполучателя, магазин,\nсостояние и отмену',2,580,620,w=245,h=106)
d.n('Allowed','Передача допустима?',2,910,645,'exclusiveGateway')
d.n('No','Предложение не создано',2,1100,745,'endEvent')
d.n('Offer','Сохранить предложение;\nпередать историю поиска',2,1110,590,w=245,h=96)
d.n('Reply','Принять или отклонить\nпредложение',1,1410,395,w=245,h=96)
d.n('Yes','Коллега принимает?',1,1760,415,'exclusiveGateway')
d.n('Keep','Показать актуальное\nназначение; записать\nотказ / отклонение',2,1920,590,w=250,h=96)
d.n('KeepEnd','Действие не применено',2,2200,710,'endEvent')
d.n('Recheck','При принятии повторно\nпроверить состояние,\nотмену и назначение',2,1420,750,w=250,h=106)
d.n('Valid','Условия ещё\nвыполняются?',2,1760,775,'exclusiveGateway')
d.n('Switch','Сохранить одного нового\nисполнителя и историю',2,1920,790,w=250,h=96)
d.n('Done','Коллега продолжает поиск',2,2200,825,'endEvent')
d.f('Need','Choose');d.f('Choose','Check',sa='B',sb='T',via=[(425,335),(702.5,335)])
d.f('Check','Allowed');d.f('Allowed','No','Нет',sa='B',sb='L',via=[(936,762)],lp=(1030,750))
d.f('Allowed','Offer','Да',sa='R',sb='L',via=[(1040,671),(1040,638)],lp=(1040,615))
d.f('Offer','Reply',sa='T',sb='B',via=[(1232.5,550),(1532.5,550)]);d.f('Reply','Yes')
d.f('Yes','Keep','Нет',sa='R',sb='T',via=[(2045,441)],lp=(1920,440))
d.f('Keep','KeepEnd',sa='R',sb='T',via=[(2210,638),(2210,735),(2147,735)])
d.f('Yes','Recheck','Да',sa='B',sb='T',via=[(1786,545),(1695,545),(1695,715),(1545,715)],lp=(1720,610))
d.f('Recheck','Valid');d.f('Valid','Switch','Да',lp=(1870,800))
d.f('Valid','Keep','Нет',sa='T',sb='B',via=[(1786,710),(2045,710)],lp=(1870,700))
d.f('Switch','Done',sa='R',sb='L');DIAGRAMS.append(d)
d.nodes['Done'].caption_y=923

# 07. Internal decisions are conditional events, not messages between participants.
d=Diagram('07-bpmn-service-handover','TO-BE · передача обслуживания продавцу','Передаётся всё активное обслуживание. Складской исполнитель и работа склада не меняются.',3000,[('Продавец / руководитель',260),('StoreAssist',1000)],['Новый коллега сам принимает предложение. До сохранённого принятия назначен прежний продавец.','Необходимость отзыва определяется инициатором, а не таймером. Новая попытка — после сохранённого отказа или отзыва.','Принятие и отзыв сохраняются по актуальному состоянию: первое сохранённое решение нельзя отменить устаревшим действием.','Время, история, очередь, зоны и складские исполнители запросов сохраняются. Отсутствие ответа не меняет назначение.'],['FR-28','FR-29','FR-30','FR-33','FR-16','RULE-17','RULE-18','RULE-19','RULE-25'])
d.n('Need','Нужна смена продавца',0,205,223,'startEvent')
d.n('Choose','Выбрать коллегу своего\nмагазина; при затруднении\nпомогает руководитель',0,300,186,w=260,h=108)
d.n('Check','Проверить активность,\nтекущего продавца\nи прежнее предложение',1,600,1000,w=245,h=106)
d.n('Allowed','Предложение допустимо?',1,910,1027,'exclusiveGateway')
d.n('No','Предложение не создано',1,1080,1200,'endEvent')
d.n('Offer','Сохранить предложение;\nпоказать коллеге\nактуальный контекст',1,1100,1000,w=245,h=106)
d.n('Wait','Ожидать решение\nили необходимость отзыва',1,1450,1027,'eventBasedGateway')
d.n('Accept','Коллега запросил\nпринятие',1,1740,1036,'intermediateCatchEvent')
d.nodes['Accept'].condition='Выбранный коллега отправил команду принятия этого предложения'
d.n('Decline','Отказ сохранён',1,1250,650,'intermediateCatchEvent')
d.nodes['Decline'].condition='По этому предложению сохранён отказ выбранного коллеги'
d.n('Withdraw','Инициатор решил\nотозвать предложение',1,1459,500,'intermediateCatchEvent')
d.nodes['Withdraw'].condition='Инициатор решил отозвать это предложение; автоматического срока отзыва нет'
d.n('WithdrawAction','Отозвать ожидающее\nпредложение',0,1500,186,w=275,h=108)
d.n('SaveWithdraw','Проверить назначение\nи состояние; сохранить отзыв,\nесли предложение ожидает',1,1850,450,w=275,h=108)
d.n('Withdrawn','Отзыв сохранён?',1,2200,477,'exclusiveGateway')
d.n('Recheck','Проверить актуального\nвладельца, активность\nи ожидающее предложение',1,1850,1000,w=260,h=106)
d.n('Valid','Принятие допустимо?',1,2200,1027,'exclusiveGateway')
d.n('Switch','Сохранить нового продавца;\nпереключить управление\nи уведомления',1,1850,1200,w=260,h=106)
d.n('Changed','Обслуживание принято',1,2200,1236,'endEvent')
d.n('Actual','Показать актуальное\nсостояние; устаревшее\nдействие не применять',1,2450,700,w=260,h=106)
d.n('Unchanged','Действие не применено',1,2820,736,'endEvent')
d.f('Need','Choose')
d.f('Choose','Check',sa='B',sb='L',via=[(430,1053)])
d.f('Check','Allowed');d.f('Allowed','No','Нет',sa='B',sb='L',via=[(936,1217)])
d.f('Allowed','Offer','Да');d.f('Offer','Wait');d.f('Wait','Accept')
d.f('Wait','Decline',sa='T',sb='R',via=[(1400,1027),(1400,667)])
d.f('Wait','Withdraw',sa='T',sb='B',via=[(1476,562)])
d.f('Accept','Recheck')
d.f('Decline','Choose',sa='L',sb='R',via=[(700,667),(700,240)])
d.f('Withdraw','WithdrawAction',sa='T',sb='B',via=[(1476,340),(1637.5,340)])
d.f('WithdrawAction','SaveWithdraw',sa='R',sb='T',via=[(1987.5,240)])
d.f('SaveWithdraw','Withdrawn')
d.f('Withdrawn','Choose','Да',sa='T',sb='T',via=[(2226,155),(430,155)])
d.f('Withdrawn','Actual','Нет',sa='R',sb='T',via=[(2580,503)])
d.f('Recheck','Valid');d.f('Valid','Switch','Да',sa='B',sb='T',via=[(2226,1140),(1980,1140)])
d.f('Switch','Changed')
d.f('Valid','Actual','Нет',sa='R',sb='B',via=[(2580,1053)])
d.f('Actual','Unchanged')
DIAGRAMS.append(d)
d.nodes['Withdraw'].caption_x=1630
d.nodes['Withdraw'].caption_y=517
d.nodes['Allowed'].caption_x=800
d.nodes['Allowed'].caption_y=1150
d.nodes['Valid'].caption_x=2350
d.nodes['Valid'].caption_y=1130

# Explicit classification: choosing a colleague in the app is a user task,
# even when the person makes that choice manually rather than by an algorithm.
TASK_TYPES={
    '01-bpmn-as-is':{
        'manualTask':['Choose','Search','Deliver','Tell','Continue'],
        'userTask':['Stock','Send','Confirm'],
        'serviceTask':[],
    },
    '02-bpmn-to-be':{
        'manualTask':['Search','Deliver','AgreeWithBuyer'],
        'userTask':['Prepare','Accept','RecordPlaces','Ready','Confirm','NotFound','Alternatives','New'],
        'serviceTask':['Number','Notify'],
    },
    '03-bpmn-create-request':{
        'manualTask':[],
        'userTask':['Choose','Confirm'],
        'serviceTask':['Read','Warning','Create'],
    },
    '04-bpmn-cancellation':{
        'manualTask':['Fact','Help','Wait'],
        'userTask':['Cancel','Passed','Stopped'],
        'serviceTask':['Immediate','Final','Flag'],
    },
    '05-bpmn-discrepancy':{
        'manualTask':['Review'],
        'userTask':['Report','Accept','Accounting','Close'],
        'serviceTask':['Append','New','Refresh'],
    },
    '06-bpmn-search-handover':{
        'manualTask':[],
        'userTask':['Choose','Reply'],
        'serviceTask':['Check','Offer','Keep','Recheck','Switch'],
    },
    '07-bpmn-service-handover':{
        'manualTask':[],
        'userTask':['Choose','WithdrawAction'],
        'serviceTask':['Check','Offer','SaveWithdraw','Recheck','Switch','Actual'],
    },
}
for diagram in DIAGRAMS:
    assignments=TASK_TYPES[diagram.slug]
    mapped=[id for ids in assignments.values() for id in ids]
    assert len(mapped)==len(set(mapped))
    assert set(mapped)=={n.id for n in diagram.nodes.values() if n.kind=='task'},(diagram.slug,'incomplete task classification')
    for kind,ids in assignments.items():
        for id in ids:diagram.nodes[id].kind=kind

STATE_TRANSITIONS=[
    ('Initial','Created','Запрос принят системой'),
    ('Created','Working','Склад принял запрос'),
    ('Working','Ready','Нужный вариант подобран [нет ожидающей отмены]'),
    ('Ready','Working','Ошибка готовности / причина [нет ожидающей отмены]'),
    ('Working','Working','Продавец запросил отмену / флаг = true'),
    ('Ready','Ready','Продавец запросил отмену / флаг = true'),
    ('Created','Cancelled','Продавец отменил / обязательная причина'),
    ('Working','NotFound','Поиск завершён без результата [нет ожидающей отмены]'),
    ('Working','Cancelled','Исполнитель подтвердил отмену [положение вещи урегулировано]'),
    ('Ready','Cancelled','Исполнитель подтвердил отмену [положение вещи урегулировано]'),
    ('Ready','Passed','Склад подтвердил фактическую передачу на терминале'),
    ('Working','Passed','Спорная отмена [ожидает отмена; фактическая передача подтверждена складом]'),
]
STATE_NAMES={'Created':'Создан','Working':'В работе','Ready':'Готов к передаче','NotFound':'Не найдено','Cancelled':'Отменён','Passed':'Передан'}
STATE_BOXES={'Created':(250,300,230,90),'Working':(800,300,230,90),'Ready':(1400,300,260,90),'NotFound':(440,650,230,90),'Cancelled':(850,1000,230,90),'Passed':(1320,650,230,90)}
STATE_GRAPH=Diagram('08-request-states','Состояния запроса','',1900,[('',1060)],[],[])
STATE_GRAPH.left=40
STATE_GRAPH.extra_obstacles=[(55,144,230,35)]
for key,(x,y,w,h) in STATE_BOXES.items():STATE_GRAPH.nodes[key]=Node(key,STATE_NAMES[key],'state',0,x,y,w,h)
STATE_GRAPH.nodes['Initial']=Node('Initial','','startEvent',0,99,334,22,22)
for key in ['NotFound','Cancelled','Passed']:
    x,y,w,h=STATE_BOXES[key];STATE_GRAPH.nodes['End_'+key]=Node('End_'+key,'','endEvent',0,x+w/2-15,y+h+45,30,30)
STATE_DRAW_LABELS=['Запрос принят','Склад принял','Вариант подобран¹','Ошибка готовности¹','Запрос отмены / флаг = true','Запрос отмены / флаг = true','Отмена продавцом; причина обязательна','Поиск без результата¹','Подтверждение отмены²','Подтверждение отмены²','Фактическая передача подтверждена','Передача при спорной отмене³']
for (a,b,_),label in zip(STATE_TRANSITIONS,STATE_DRAW_LABELS):STATE_GRAPH.f(a,b,label)
for key in ['NotFound','Cancelled','Passed']:STATE_GRAPH.f(key,'End_'+key,'',sa='B',sb='T')
for f in STATE_GRAPH.flows:
    if (f.a,f.b)==('Created','Cancelled'):f.sa='B';f.sb='L'
    elif (f.a,f.b)==('Working','Cancelled'):f.sa='B';f.sb='T'
    elif (f.a,f.b)==('Working','NotFound'):f.sa='L';f.sb='R'
    elif (f.a,f.b)==('Ready','Cancelled'):f.sa='R';f.sb='R'
    elif (f.a,f.b)==('Ready','Passed'):f.sa='B';f.sb='T'
    elif (f.a,f.b)==('Ready','Working'):f.sa='L';f.sb='R'
    elif f.a==f.b:f.sa='T';f.sb='T'

LAYOUT=runpy.run_path(str(ROOT/'scripts/diagram_layout.py'))
if (ROOT/'scripts/diagram-layout.json').exists():LAYOUT['apply_layouts'](DIAGRAMS+[STATE_GRAPH],ROOT/'scripts/diagram-layout.json')
if not globals().get('AUTHORING_LAYOUT',False):
    runpy.run_path(str(ROOT/'scripts/diagram_spacing.py'))['apply'](DIAGRAMS,LAYOUT,lines)

def build_states():
    puml=['@startuml','title TO-BE · состояния запроса','hide empty description','skinparam backgroundColor white','skinparam state {','  BackgroundColor #EDF4FF','  BorderColor #7D9CC9','  FontName Segoe UI','}','state "Активный запрос" as Active {']
    for key in ['Created','Working','Ready']:puml.append(f'  state "{STATE_NAMES[key]}" as {key}')
    puml.append('}')
    for key in ['NotFound','Cancelled','Passed']:puml.append(f'state "{STATE_NAMES[key]}" as {key}')
    for a,b,label in STATE_TRANSITIONS:puml.append(f'{"[*]" if a=="Initial" else a} --> {b} : {label}')
    for key in ['NotFound','Cancelled','Passed']:puml.append(f'{key} --> [*]')
    puml+=['note right of Active','Запрошена отмена — признак, не отдельный статус.','До подтверждения исполнителем запрос активен.','С 5 минут — визуальная пометка, не переход.','Передачи работы не меняют статус или время создания.','Неизвестный ответ — состояние связи, не новый статус запроса.','end note','note bottom of Cancelled','При споре руководитель помогает сверить факты.','Итог фиксирует складской исполнитель.','Если вещь уже передана, фиксируется Передан, не Отменён.','Финальные исходы не переписываются.','end note','@enduml']
    (OUT/'08-request-states.puml').write_text('\n'.join(puml)+'\n',encoding='utf-8')
    w,h=1900,1380
    s=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title desc"><title id="title">TO-BE · состояния запроса</title><desc id="desc">Активные состояния и три финальных исхода. Ожидающая отмена является признаком.</desc>',
       '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L8 4.5 L0 9" fill="none" stroke="#42536c" stroke-width="1.5"/></marker></defs><rect width="100%" height="100%" fill="white"/>',text(35,40,'TO-BE · состояния запроса',w=1700,size=27,anchor='start',weight=650),text(35,78,'Один запрос — один вариант и одна единица. Три финальных исхода не переписываются.',w=1700,size=16,anchor='start',color='#607087'),'<rect x="35" y="130" width="1830" height="480" rx="15" fill="#f7f9fc" stroke="#b5c6db"/>',text(60,165,'Активный запрос',w=1200,size=18,anchor='start',weight=600)]
    boxes={key:(n.x,n.y,n.w,n.h) for key,n in STATE_GRAPH.nodes.items() if key in STATE_NAMES}
    for i,f in enumerate(STATE_GRAPH.flows):
        pts=STATE_GRAPH.route(f)
        s.append(f'<polyline data-flow="StateFlow_{i}" points="'+' '.join(f'{x},{y}' for x,y in pts)+'" fill="none" stroke="#42536c" stroke-width="1.8" marker-end="url(#arrow)"/>')
    for f in STATE_GRAPH.flows:
        if f.label:s.append(text(*f.labelpos,f.label,w=146,size=14))
    for key,(x,y,bw,bh) in boxes.items():
        s+=[f'<rect data-state="{key}" x="{x}" y="{y}" width="{bw}" height="{bh}" rx="13" fill="#edf4ff" stroke="#7d9cc9" stroke-width="1.8"/>',text(x+bw/2,y+bh/2+5,STATE_NAMES[key],w=bw-20,size=20,weight=600)]
        if key in ['NotFound','Cancelled','Passed']:
            n=STATE_GRAPH.nodes['End_'+key];cx=n.x+n.w/2;cy=n.y+n.h/2;s.append(f'<circle cx="{cx}" cy="{cy}" r="15" fill="white" stroke="#34527c" stroke-width="2"/><circle cx="{cx}" cy="{cy}" r="9" fill="#34527c"/>')
    n=STATE_GRAPH.nodes['Initial'];s.append(f'<circle cx="{n.x+n.w/2}" cy="{n.y+n.h/2}" r="11" fill="#34527c"/>')
    assert len(STATE_GRAPH.flows)==len(STATE_TRANSITIONS)+3
    notes=['¹ Нет ожидающей отмены. При отмене ненужный поиск не продолжается; сначала разрешается положение вещи.','² Положение вещи урегулировано, итог сохраняет текущий складской исполнитель. При фактической передаче — «Передан».','³ Из «В работе» в «Передан» — только при ожидающей отмене и подтверждённом факте передачи по FR-10; готовность не предполагается.','Отмена — признак активного запроса. С 5 минут — визуальная пометка. Передачи работы не меняют статус и время создания.','Потеря ответа не создаёт нового статуса: сначала уточняется сохранённый результат. Комментарий к «Не найдено» необязателен.']
    for i,note in enumerate(notes):s.append(text(35,1230+i*29,note,w=1825,size=15,anchor='start',color='#607087'))
    s.append('</svg>');(OUT/'08-request-states.svg').write_text('\n'.join(s),encoding='utf-8')

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    for d in DIAGRAMS:d.build()
    build_states()
    manifest=[{'file':d.slug,'title':d.title,'nodes':len(d.nodes),'flows':len(d.flows),'requirements':d.refs,'taskTypes':{n.id:n.kind for n in d.nodes.values() if n.kind in TASK_KINDS}} for d in DIAGRAMS]
    manifest.append({'file':'08-request-states','title':'TO-BE · состояния запроса','states':STATE_NAMES,'transitions':STATE_TRANSITIONS})
    (OUT/'diagram-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Built 7 BPMN models with DI, 8 SVG previews and a PlantUML state source.')
if __name__=='__main__':main()
