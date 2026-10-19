"""Validate diagram graphs, source/preview consistency and local documentation links."""
from pathlib import Path
import argparse,hashlib,importlib.util,re,runpy,struct,tempfile
import xml.etree.ElementTree as E

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--schema',type=Path);args=parser.parse_args()
m=runpy.run_path(str(ROOT/'scripts/build-diagrams.py'))
ds=m['DIAGRAMS'];ns=m['NS'];out=ROOT/'assets/diagrams'
req=(ROOT/'docs/02-REQUIREMENTS.md').read_text(encoding='utf-8-sig')
definitions=set(re.findall(r'^\| ((?:FR|RULE)-\d+) \|',req,re.M))
layout=m['LAYOUT']
for d in ds+[m['STATE_GRAPH']]:
    layout['assert_routes'](d)
    if d in ds:layout['assert_anchors'](d)
    captions=layout['node_labels'](d,m['lines'])
    for id,(x,y,w,h) in captions.items():
        assert not any(x<n.x+n.w and x+w>n.x and y<n.y+n.h and y+h>n.y for n in d.nodes.values()),(d.slug,id,'caption overlaps a node')
        if d in ds:
            n=d.nodes[id];lane_top=140+sum(height for _,height in d.lanes[:n.lane]);lane_bottom=lane_top+d.lanes[n.lane][1]
            assert x>=30+d.header_width+12 and x+w<=d.width-30,(d.slug,id,'caption lacks horizontal margin')
            assert y>=lane_top+16 and y+h<=lane_bottom-16,(d.slug,id,'caption lacks lane margin')
            if n.kind=='endEvent':
                below=y>=n.y+n.h+16
                beside=x>=n.x+n.w+16 or x+w<=n.x-16
                assert below or beside,(d.slug,id,'end event caption must be below or clearly beside it')
    occupied=[(n.x,n.y,n.w,n.h) for n in d.nodes.values()]+list(captions.values())
    wires=[segment for f in d.flows for segment in layout['segments'](f.points)]
    for f in d.flows:
        for a,b in layout['segments'](f.points):
            for n in d.nodes.values():
                if n.id not in [f.a,f.b]:
                    assert not layout['hits'](a,b,(n.x,n.y,n.w,n.h)),(d.slug,f.a,f.b,'foreign node',n.id)
            assert not any(layout['hits'](a,b,box) for box in captions.values()),(d.slug,f.a,f.b,'node caption')
        if not f.label:continue
        assert f.labelpos,(d.slug,f.a,f.b,'missing flow label')
        if d in ds:
            assert ((f.labelpos[0]-f.points[0][0])**2+(f.labelpos[1]-f.points[0][1])**2)**.5<=180,(d.slug,f.a,f.b,'condition too far from gateway')
        box=layout['label_box'](f.label,f.labelpos,m['lines']);x,y,w,h=box
        assert not any(x<ox+ow and x+w>ox and y<oy+oh and y+h>oy for ox,oy,ow,oh in occupied),(d.slug,f.a,f.b,'overlapping flow label')
        assert not any(layout['hits'](a,b,box) for a,b in wires),(d.slug,f.a,f.b,'wire through flow label')
        own=min(layout['point_distance'](f.labelpos,a,b) for a,b in layout['segments'](f.points))
        other=min((layout['point_distance'](f.labelpos,a,b) for g in d.flows if g is not f for a,b in layout['segments'](g.points)),default=float('inf'))
        assert own<=other+1,(d.slug,f.a,f.b,'ambiguous flow label')
        occupied.append(box)
for d in ds:
    d.validate();assert set(d.refs)<=definitions,(d.slug,'unknown requirement')
    for f in d.flows:
        pts=d.route(f)
        if d.nodes[f.b].kind=='endEvent':
            assert ((pts[-1][0]-pts[-2][0])**2+(pts[-1][1]-pts[-2][1])**2)**.5>=40,(d.slug,f.b,'short final approach to end event')
        assert all(a[0]==b[0] or a[1]==b[1] for a,b in zip(pts,pts[1:])),(d.slug,'diagonal connector')
        for n in d.nodes.values():
            if n.id in [f.a,f.b]:continue
            for a,b in zip(pts,pts[1:]):
                hit=(a[0]==b[0] and n.x+2<a[0]<n.x+n.w-2 and max(a[1],b[1])>n.y+2 and min(a[1],b[1])<n.y+n.h-2) or (a[1]==b[1] and n.y+2<a[1]<n.y+n.h-2 and max(a[0],b[0])>n.x+2 and min(a[0],b[0])<n.x+n.w-2)
                assert not hit,(d.slug,f.a,f.b,'connector crosses',n.id)
    root=E.parse(out/(d.slug+'.bpmn')).getroot();ids=[e.get('id') for e in root.iter() if e.get('id')]
    assert len(ids)==len(set(ids)),(d.slug,'duplicate XML ID')
    assert not root.findall('.//bpmn:task',ns),(d.slug,'untyped BPMN task')
    svg=E.parse(out/(d.slug+'.svg')).getroot()
    svg_ns={'svg':'http://www.w3.org/2000/svg'}
    arrow=svg.find(".//svg:marker[@id='arrow']/svg:path",svg_ns)
    assert arrow is not None and arrow.get('fill') not in [None,'none'] and arrow.get('d').strip().upper().endswith('Z'),(d.slug,'sequence flow needs a filled arrowhead')
    assert not root.findall('.//bpmn:messageEventDefinition',ns),(d.slug,'internal shop decisions must not use message events')
    for n in d.nodes.values():
        if n.kind=='eventBasedGateway':
            branches=[f for f in d.flows if f.a==n.id]
            assert len(branches)>=2,(d.slug,n.id,'event gateway needs alternative triggers')
            for f in branches:
                target=d.nodes[f.b]
                assert target.kind=='intermediateCatchEvent' and target.condition,(d.slug,n.id,'missing catch condition')
                assert len([g for g in d.flows if g.b==target.id])==1,(d.slug,target.id,'catch event has extra incoming flow')
                assert not f.label,(d.slug,n.id,'event gateway sequence flow must not carry a condition')
        if n.kind=='intermediateCatchEvent':
            definition=root.find(".//bpmn:intermediateCatchEvent[@id='"+n.id+"']/bpmn:conditionalEventDefinition/bpmn:condition",ns)
            assert definition is not None and definition.text==n.condition,(d.slug,n.id,'conditional event XML differs from model')
            group=next(e for e in svg.iter() if e.get('data-node')==n.id)
            assert any(e.get('data-event-type')=='conditional' for e in group.iter()),(d.slug,n.id,'missing conditional event symbol')
    for n in d.nodes.values():
        if n.kind in m['TASK_KINDS']:continue
        group=next(e for e in svg.iter() if e.get('data-node')==n.id)
        caption=group.find('{http://www.w3.org/2000/svg}text')
        box=layout['node_labels'](d,m['lines'])[n.id]
        assert caption is not None and abs(float(caption.get('x'))-(box[0]+box[2]/2))<.01,(d.slug,n.id,'SVG caption differs from checked layout')
        line_count=len(m['lines'](n.name,box[2],14))
        expected_y=box[1]+box[3]/2+5-(line_count-1)*14*1.3/2
        assert abs(float(caption.get('y'))-expected_y)<.01,(d.slug,n.id,'SVG caption vertical alignment')
    svg_tasks={e.get('data-node'):next(x.get('data-task-type') for x in e if x.get('data-task-type')) for e in svg.iter() if e.get('data-node') and any(x.get('data-task-type') for x in e)}
    expected={n.id:n.kind for n in d.nodes.values() if n.kind in m['TASK_KINDS']}
    assert svg_tasks==expected,(d.slug,'SVG task markers do not match model')
    for id,kind in expected.items():
        assert root.find('.//bpmn:'+kind+"[@id='"+id+"']",ns) is not None,(d.slug,id,'wrong BPMN type')
        group=next(e for e in svg.iter() if e.get('data-node')==id)
        assert any(e.get('data-task-marker')==kind for e in group.iter()),(d.slug,id,'missing icon')
    for flow in root.findall('.//bpmn:sequenceFlow',ns):
        assert flow.get('sourceRef') in d.nodes and flow.get('targetRef') in d.nodes
    assert {s.get('bpmnElement') for s in root.findall('.//bpmndi:BPMNShape',ns)}>=d.nodes.keys()
    if args.schema:
        from lxml import etree
        etree.XMLSchema(etree.parse(str(args.schema))).assertValid(etree.parse(str(out/(d.slug+'.bpmn'))))

# Regenerate into an isolated temporary directory: committed model/SVG outputs must match.
with tempfile.TemporaryDirectory(prefix='storeassist-diagrams-') as name:
    temp=Path(name).resolve();assert temp.parent==Path(tempfile.gettempdir()).resolve()
    m['main'].__globals__['OUT']=temp
    m['main']()
    for p in temp.iterdir():assert p.read_bytes()==(out/p.name).read_bytes(),('stale generated file',p.name)

for p in out.glob('*.svg'):
    svg=E.parse(p).getroot();data=p.with_suffix('.png').read_bytes()
    assert data[:8]==b'\x89PNG\r\n\x1a\n'
    w,h=struct.unpack('>II',data[16:24]);assert (w,h)==(int(svg.get('width'))*2,int(svg.get('height'))*2),(p.name,'PNG dimensions')
assert len(list(out.glob('*.bpmn')))==7 and len(list(out.glob('*.svg')))==8 and len(list(out.glob('*.png')))==8
links=0
for p in ROOT.rglob('*.md'):
    text=p.read_text(encoding='utf-8-sig');assert not re.search(r'^(<<<<<<<|=======|>>>>>>>)',text,re.M)
    for href in re.findall(r'\]\(([^)]+)\)',text):
        if re.match(r'^(?:https?:|mailto:|#)',href):continue
        assert (p.parent/href.split('#')[0]).exists(),(p,href)
        links+=1
print(f'PASS: 8 orthogonal layouts without wire crossings/overlaps or label collisions; 7 BPMN graphs with typed tasks/icons, 8 SVG/PNG pairs, state source, diagram requirements, {links} local links'+(', official OMG XSD' if args.schema else ''))
