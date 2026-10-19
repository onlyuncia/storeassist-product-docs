"""Orthogonal diagram routing with separate ports and collision checks."""
import heapq,itertools,math,random,json,runpy,time
from pathlib import Path

def compact(points):
    out=[]
    for p in points:
        p=tuple(p)
        if out and p==out[-1]:continue
        if len(out)>1 and (out[-2][0]==out[-1][0]==p[0] or out[-2][1]==out[-1][1]==p[1]):out[-1]=p
        else:out.append(p)
    return out

def hits(a,b,box,pad=0):
    x,y,w,h=box;x-=pad;y-=pad;w+=2*pad;h+=2*pad
    if a[0]==b[0]:return x<a[0]<x+w and max(a[1],b[1])>y and min(a[1],b[1])<y+h
    return y<a[1]<y+h and max(a[0],b[0])>x and min(a[0],b[0])<x+w

def segments(points):return list(zip(points,points[1:]))

def crossing(a,b,c,d):
    if a[0]==b[0] and c[0]==d[0]:
        return a[0]==c[0] and min(max(a[1],b[1]),max(c[1],d[1]))>max(min(a[1],b[1]),min(c[1],d[1]))
    if a[1]==b[1] and c[1]==d[1]:
        return a[1]==c[1] and min(max(a[0],b[0]),max(c[0],d[0]))>max(min(a[0],b[0]),min(c[0],d[0]))
    if a[0]!=b[0]:a,b,c,d=c,d,a,b
    return min(a[1],b[1])<=c[1]<=max(a[1],b[1]) and min(c[0],d[0])<=a[0]<=max(c[0],d[0])

def conflict(a,b,c,d,allowed=()):
    if not crossing(a,b,c,d):return False
    # Only a single shared endpoint on a common node may meet. Never hide overlaps.
    if (a[0]==b[0]) != (c[0]==d[0]):
        common=set([tuple(a),tuple(b)]) & set([tuple(c),tuple(d)])
        if common & set(map(tuple,allowed)):return False
    return True

def common_anchors(diagram,f,g):
    shared=set([f.a,f.b]) & set([g.a,g.b])
    return [port(diagram.nodes[id],side) for id in shared for side in 'LRTB']

def assert_anchors(d):
    for f in d.flows:
        for node,point in [(d.nodes[f.a],f.points[0]),(d.nodes[f.b],f.points[-1])]:
            anchors=[port(node,side) for side in 'LRTB']
            assert tuple(point) in anchors,(d.slug,f.a,f.b,'off-center attachment',node.id,point)
        for a,b in segments(f.points):
            for node in d.nodes.values():
                assert not hits(a,b,(node.x,node.y,node.w,node.h)),(d.slug,f.a,f.b,'line enters node',node.id)
        for node,point,adjacent in [(d.nodes[f.a],f.points[0],f.points[1]),(d.nodes[f.b],f.points[-1],f.points[-2])]:
            if node.kind.endswith('Task'):
                side=next(s for s in 'LRTB' if tuple(point)==port(node,s))
                direction=DIR[side]
                assert (adjacent[0]-point[0])*direction[0]+(adjacent[1]-point[1])*direction[1]>0,(d.slug,node.id,'tangent attachment to task')

def node_labels(d,wrap):
    if hasattr(d,'readable_captions'):return d.readable_captions
    labels={}
    for n in d.nodes.values():
        if not n.name:continue
        if n.kind.endswith('Task') or n.kind=='task' or n.kind=='state':continue
        size=14
        if 'Gateway' in n.kind:
            width=178;cy=n.y+n.h+65
        else:
            width=min(162,2*(d.width-25-n.x-17));cy=n.y+(85 if n.kind=='startEvent' else 60)
            if n.kind=='startEvent':width=min(width,140)
        count=len(wrap(n.name,width,size));height=count*size*1.3+6
        if 'Gateway' not in n.kind:cy=n.y+n.h+18+height/2
        if hasattr(d,'lanes'):
            lane_bottom=140+sum(h for _,h in d.lanes[:n.lane+1])
            if cy+height/2>lane_bottom-4:cy=n.y-height/2-18
        cy=getattr(n,'caption_y',cy)
        labels[n.id]=(getattr(n,'caption_x',n.x+n.w/2)-width/2,cy-height/2-5,width,height)
    return labels

def port(n,side,offset=0):
    cx=n.x+n.w/2;cy=n.y+n.h/2
    if side in 'LR':
        y=cy+offset
        if 'Gateway' in n.kind:dx=n.w/2-abs(offset)
        elif n.kind.endswith('Event') or n.kind in ['initial','final']:dx=math.sqrt(max(0,(n.w/2)**2-offset**2))
        else:dx=n.w/2
        return (round(cx+(-dx if side=='L' else dx),2),y)
    x=cx+offset
    if 'Gateway' in n.kind:dy=n.h/2-abs(offset)
    elif n.kind.endswith('Event') or n.kind in ['initial','final']:dy=math.sqrt(max(0,(n.h/2)**2-offset**2))
    else:dy=n.h/2
    return (x,round(cy+(-dy if side=='T' else dy),2))

DIR={'L':(-1,0),'R':(1,0),'T':(0,-1),'B':(0,1)}

def route_all(d,wrap,attempts=30):
    """Route on a sparse visibility grid; existing edges are also obstacles."""
    if any('Gateway' in n.kind for n in d.nodes.values()):return route_anchored(d,wrap,attempts)
    labels=node_labels(d,wrap)
    boxes={n.id:(n.x,n.y,n.w,n.h) for n in d.nodes.values()}
    # The caption of a gateway is an obstacle, just like its diamond.
    obstacles=list(boxes.values())+list(labels.values())
    obstacles+=getattr(d,'extra_obstacles',[])
    left=getattr(d,'left',180)
    preferred=[(f.sa,f.sb) for f in d.flows]
    edge_count=len(d.flows)
    last_label_error=None;route_errors=0
    for trial in range(attempts):
        used=[];occupied={};result={};rng=random.Random(911+trial)
        order=list(range(edge_count))
        if trial:
            rng.shuffle(order)
            # Long returns first on alternate trials; alternate topological orders.
            if trial%2==0:order.sort(key=lambda i:-abs(d.nodes[d.flows[i].a].x-d.nodes[d.flows[i].b].x))
        failed=False
        for fi in order:
            f=d.flows[fi];a=d.nodes[f.a];b=d.nodes[f.b]
            candidates=[];direct=[]
            sides=['R','B','L','T']
            for sa in sides:
                for sb in ['L','T','R','B']:
                    offsets=[(0,0),(-12,12),(12,-12),(-18,-18),(18,18)]
                    if sa in 'LR' and sb in 'LR':
                        low=max(a.y+min(20,a.h*.2),b.y+min(20,b.h*.2));high=min(a.y+a.h-min(20,a.h*.2),b.y+b.h-min(20,b.h*.2))
                        if low<=high:
                            shared=(low+high)/2;offsets.insert(0,(shared-a.y-a.h/2,shared-b.y-b.h/2))
                    for oa,ob in offsets:
                        if a.id==b.id and sa==sb and oa==ob:continue
                        if a.kind.endswith('Event') and abs(oa)>=min(a.w,a.h)/2:continue
                        if b.kind.endswith('Event') and abs(ob)>=min(b.w,b.h)/2:continue
                        p=port(a,sa,oa);q=port(b,sb,ob)
                        # Adjacent ports must remain visibly separated.
                        if any(math.dist(p,v)<13 for v in occupied.get(a.id,[])) or any(math.dist(q,v)<13 for v in occupied.get(b.id,[])):continue
                        forward=(p[1]==q[1] and ((sa=='R' and sb=='L' and p[0]<q[0]) or (sa=='L' and sb=='R' and p[0]>q[0]))) or (p[0]==q[0] and ((sa=='B' and sb=='T' and p[1]<q[1]) or (sa=='T' and sb=='B' and p[1]>q[1])))
                        if a.id!=b.id and forward and not any(hits(p,q,box,5) for id,box in boxes.items() if id not in [a.id,b.id]) and not any(hits(p,q,box,4) for box in labels.values()) and not any(crossing(p,q,c,e) for c,e in used):direct.append((math.dist(p,q)+abs(oa)+abs(ob),[p,q],p,q))
                        da=DIR[sa];db=DIR[sb];s=(p[0]+da[0]*28,p[1]+da[1]*28);t=(q[0]+db[0]*28,q[1]+db[1]*28)
                        if not (left<s[0]<d.width-35 and 150<s[1]<d.bottom-12 and left<t[0]<d.width-35 and 150<t[1]<d.bottom-12):continue
                        if any(hits(p,s,box,5) for id,box in boxes.items() if id!=a.id) or any(hits(q,t,box,5) for id,box in boxes.items() if id!=b.id):continue
                        if any(hits(p,s,box,4) or hits(q,t,box,4) for box in labels.values()):continue
                        if any(crossing(p,s,c,e) or crossing(q,t,c,e) for c,e in used):continue
                        score=abs(s[0]-t[0])+abs(s[1]-t[1])+(sa!=preferred[fi][0])*35+(sb!=preferred[fi][1])*35+(abs(oa)+abs(ob))*3
                        # Prefer exits pointing towards the destination rather than backwards.
                        score+=max(0,-(b.x-a.x)*da[0])*0.2+max(0,-(b.y-a.y)*da[1])*0.2
                        candidates.append((score,sa,sb,p,q,s,t))
            candidates.sort(key=lambda c:c[0]);best=min(direct) if direct else None
            for base,sa,sb,p,q,s,t in ([] if direct else candidates[:24]):
                path=grid_path(s,t,obstacles,used,d.width,d.bottom,left)
                if path is not None:
                    pts=compact([p]+path+[q]);cost=sum(math.dist(x,y) for x,y in segments(pts))+100*(len(pts)-2)+base*.1
                    if best is None or cost<best[0]:best=(cost,pts,p,q)
                    if len(pts)<=4:break
            if best is None:failed=True;route_errors+=1;break
            pts=best[1];result[fi]=pts;used+=segments(pts)
            occupied.setdefault(a.id,[]).append(best[2]);occupied.setdefault(b.id,[]).append(best[3])
        if not failed:
            for i,f in enumerate(d.flows):f.points=result[i]
            try:place_labels(d,labels,wrap)
            except AssertionError as e:last_label_error=str(e);continue
            return {'attempts':trial+1,'edges':edge_count}
    raise AssertionError((d.slug,'Cannot route without crossings; move blocks',fi,d.flows[fi].a,d.flows[fi].b,'route errors',route_errors,'last label error',last_label_error))

def route_anchored(d,wrap,attempts=50):
    originals=[]
    for f in d.flows:
        pts=list(d.route(f))
        for reverse,node in [(False,d.nodes[f.a]),(True,d.nodes[f.b])]:
            if reverse:pts.reverse()
            p,q=pts[:2]
            if tuple(p) in [port(node,side) for side in 'LRTB']:
                if reverse:pts.reverse()
                continue
            side=('R' if q[0]>p[0] else 'L') if p[1]==q[1] else ('B' if q[1]>p[1] else 'T')
            anchor=port(node,side)
            if len(pts)==2 and anchor!=p:
                if side in 'LR':pts=[anchor,((anchor[0]+q[0])/2,anchor[1]),((anchor[0]+q[0])/2,q[1]),q]
                else:pts=[anchor,(anchor[0],(anchor[1]+q[1])/2),(q[0],(anchor[1]+q[1])/2),q]
            else:
                pts[0]=anchor
                pts[1]=(q[0],anchor[1]) if side in 'LR' else (anchor[0],q[1])
            if reverse:pts.reverse()
        originals.append(compact(pts))
    captions=node_labels(d,wrap)
    boxes={n.id:(n.x,n.y,n.w,n.h) for n in d.nodes.values()}
    obstacles=list(boxes.values())+list(captions.values())
    for trial in range(attempts):
        order=list(range(len(d.flows)))
        if trial:random.Random(trial+322).shuffle(order)
        done={};failed=False
        for index in order:
            f=d.flows[index];a=d.nodes[f.a];b=d.nodes[f.b]
            allowed=[port(n,side) for n in [a,b] for side in 'LRTB']
            used=[seg for pts in done.values() for seg in segments(pts)]
            def legal(pts):
                for p,q in segments(pts):
                    if any(hits(p,q,box) for id,box in boxes.items() if id not in [a.id,b.id]):return False
                    if any(hits(p,q,box) for box in captions.values()):return False
                    if any(conflict(p,q,c,e,allowed) for c,e in used):return False
                return True
            if legal(originals[index]):done[index]=originals[index];continue
            candidates=[]
            for sa in 'RBLT':
                for sb in 'LTRB':
                    p=port(a,sa);q=port(b,sb)
                    adirs=[DIR[sa]]+([DIR[s] for s in ('TB' if sa in 'LR' else 'LR')] if 'Gateway' in a.kind else [])
                    bdirs=[DIR[sb]]+([DIR[s] for s in ('TB' if sb in 'LR' else 'LR')] if 'Gateway' in b.kind else [])
                    for da in adirs:
                        for db in bdirs:
                            alen=22 if da==DIR[sa] else (a.h/2+22 if sa in 'LR' else a.w/2+22)
                            blen=22 if db==DIR[sb] else (b.h/2+22 if sb in 'LR' else b.w/2+22)
                            s=(p[0]+da[0]*alen,p[1]+da[1]*alen);t=(q[0]+db[0]*blen,q[1]+db[1]*blen)
                            if not all(180<x<d.width-35 and 150<y<d.bottom-12 for x,y in [s,t]):continue
                            if not legal([p,s]) or not legal([t,q]):continue
                            # A tangent is legal at a vertex, but the next bend stays outside all nodes.
                            if any(x<pt[0]<x+w and y<pt[1]<y+h for pt in [s,t] for x,y,w,h in boxes.values()):continue
                            score=math.dist(p,originals[index][0])+math.dist(q,originals[index][-1])+abs(s[0]-t[0])+abs(s[1]-t[1])
                            score+=50*((da!=DIR[sa])+(db!=DIR[sb]))
                            candidates.append((score,p,q,s,t))
            candidates.sort();best=None
            for score,p,q,s,t in candidates[:40]:
                route=grid_path(s,t,obstacles,used,d.width,d.bottom,180)
                if route is None:continue
                pts=compact([p]+route+[q])
                if not legal(pts):continue
                cost=sum(math.dist(x,y) for x,y in segments(pts))+100*(len(pts)-2)+score*.1
                if best is None or cost<best[0]:best=(cost,pts)
                if len(pts)<=4:break
            if best is None:failed=True;break
            done[index]=best[1]
        if failed:
            continue
        for i,f in enumerate(d.flows):f.points=done[i]
        try:
            assert_routes(d)
            place_labels(d,captions,wrap)
        except AssertionError as error:
            continue
        assert_anchors(d)
        return {'attempts':trial+1,'edges':len(d.flows)}
    raise AssertionError((d.slug,'repair failed'))


def align_rows(d):
    for lane in range(len(d.lanes)):
        nodes=sorted([n for n in d.nodes.values() if n.lane==lane],key=lambda n:n.y+n.h/2)
        groups=[]
        for n in nodes:
            if not groups or n.y+n.h/2-(groups[-1][0].y+groups[-1][0].h/2)>30:groups.append([])
            groups[-1].append(n)
        for group in groups:
            cy=round(sum(n.y+n.h/2 for n in group)/len(group)/10)*10
            for n in group:n.y=cy-n.h/2

def grid_path(s,t,obstacles,used,width,bottom,left):
    # Endpoint coordinates are included, so no tiny diagonal or staircase stubs are needed.
    xs=sorted(set(range(int(left)+10,int(width)-34,35))|{s[0],t[0]})
    ys=sorted(set(range(155,int(bottom)-11,35))|{s[1],t[1]})
    si=(xs.index(s[0]),ys.index(s[1]));ti=(xs.index(t[0]),ys.index(t[1]))
    blocked=set()
    for x,y,w,h in obstacles:
        for ix,vx in enumerate(xs):
            if x-12<vx<x+w+12:
                for iy,vy in enumerate(ys):
                    if y-12<vy<y+h+12:blocked.add((ix,iy))
    blocked.discard(si);blocked.discard(ti)
    cache={}
    def clear(a,b):
        key=(a,b) if a<b else (b,a)
        if key not in cache:
            pa=(xs[a[0]],ys[a[1]]);pb=(xs[b[0]],ys[b[1]])
            cache[key]=not any(hits(pa,pb,box,10) for box in obstacles) and not any(crossing(pa,pb,c,e) for c,e in used)
        return cache[key]
    queue=[];counter=itertools.count();dist={(*si,-1):0};parent={};heapq.heappush(queue,(0,next(counter),(*si,-1)))
    while queue:
        _,_,state=heapq.heappop(queue);ix,iy,axis=state
        if (ix,iy)==ti:
            path=[]
            while state in parent:path.append((xs[state[0]],ys[state[1]]));state=parent[state]
            return [s]+list(reversed(path))
        cost=dist[state]
        for dx,dy,na in [(1,0,0),(-1,0,0),(0,1,1),(0,-1,1)]:
            jx,jy=ix+dx,iy+dy
            if not (0<=jx<len(xs) and 0<=jy<len(ys)) or (jx,jy) in blocked:continue
            if not clear((ix,iy),(jx,jy)):continue
            nc=cost+abs(xs[jx]-xs[ix])+abs(ys[jy]-ys[iy])+(110 if axis not in [-1,na] else 0)
            key=(jx,jy,na)
            if nc<dist.get(key,float('inf')):
                dist[key]=nc;parent[key]=state
                h=abs(xs[jx]-t[0])+abs(ys[jy]-t[1]);heapq.heappush(queue,(nc+h,next(counter),key))
    return None

def label_box(label,center,wrap):
    ls=wrap(label,146,14);w=min(156,max(len(v) for v in ls)*8+14);h=len(ls)*18+8
    return (center[0]-w/2,center[1]-h/2,w,h)

def point_distance(p,a,b):
    if a[0]==b[0]:return math.hypot(p[0]-a[0],max(min(a[1],b[1])-p[1],0,p[1]-max(a[1],b[1])))
    return math.hypot(p[1]-a[1],max(min(a[0],b[0])-p[0],0,p[0]-max(a[0],b[0])))

def place_labels(d,node_boxes,wrap):
    occupied=[(n.x,n.y,n.w,n.h) for n in d.nodes.values()]+list(node_boxes.values())
    wires=[seg for f in d.flows for seg in segments(f.points)]
    for f in d.flows:
        if not f.label:continue
        candidates=[]
        for order,(a,b) in enumerate(segments(f.points)):
            for ratio in [.35,.65,.5,.15,.85,.05,.95]:
                x=a[0]+(b[0]-a[0])*ratio;y=a[1]+(b[1]-a[1])*ratio
                box=label_box(f.label,(x,y),wrap)
                if a[1]==b[1]:centers=[(x,y+sign*(box[3]/2+gap)) for gap in [4,8,22,40,65] for sign in [-1,1]]
                else:centers=[(x+sign*(box[2]/2+gap),y) for gap in [9,22,40,65] for sign in [1,-1]]
                for center in centers:
                    rect=label_box(f.label,center,wrap);rx,ry,rw,rh=rect
                    if rx<getattr(d,'left',180) or ry<143 or rx+rw>d.width-30 or ry+rh>d.bottom-8:continue
                    if any(rx<ox+ow+5 and rx+rw>ox-5 and ry<oy+oh+5 and ry+rh>oy-5 for ox,oy,ow,oh in occupied):continue
                    if any(hits(c,e,rect,3) for c,e in wires):continue
                    own=min(point_distance(center,c,e) for c,e in segments(f.points))
                    other=min((point_distance(center,c,e) for g in d.flows if g is not f for c,e in segments(g.points)),default=float('inf'))
                    if other<own-1:continue
                    # Conditions belong beside the departure from a gateway, not at
                    # the middle of a long return path. State labels keep their layout.
                    score=(math.dist(center,f.points[0])+order*4 if hasattr(d,'refs') else order*60+abs(ratio-.5))
                    candidates.append((score+math.dist(center,(x,y))*.5,center,rect))
        if not candidates:raise AssertionError((d.slug,f.a,f.b,'No collision-free label position'))
        _,f.labelpos,rect=min(candidates);occupied.append(rect)

def assert_routes(d):
    for i,f in enumerate(d.flows):
        points=compact(f.points)
        assert points==f.points,(d.slug,'redundant bends',i)
        assert all(a[0]==b[0] or a[1]==b[1] for a,b in segments(points))
        for g in d.flows[:i]:
            allowed=common_anchors(d,f,g)
            assert not any(conflict(a,b,c,e,allowed) for a,b in segments(points) for c,e in segments(g.points)),(d.slug,'edge crossing',f.a,f.b,g.a,g.b)

def apply_layouts(diagrams,path):
    data=json.loads(Path(path).read_text(encoding='utf-8'))
    for d in diagrams:
        align_rows(d)
        entry=data[d.slug]
        assert set(entry['nodes'])==set(d.nodes),(d.slug,'layout needs rebuilding after node edit')
        for id,(x,y,w,h) in entry['nodes'].items():
            n=d.nodes[id];assert (w,h)==(n.w,n.h),(d.slug,id,'layout needs rebuilding after size edit')
            n.x=x;n.y=y
        assert len(entry['flows'])==len(d.flows)
        for f,g in zip(d.flows,entry['flows']):
            assert [f.a,f.b,f.label]==g['key'],(d.slug,'layout needs rebuilding after flow edit')
            f.points=[tuple(p) for p in g['points']];f.labelpos=tuple(g['labelpos']) if g['labelpos'] else None
        assert_routes(d)

def main():
    root=Path(__file__).resolve().parents[1]
    m=runpy.run_path(str(root/'scripts/build-diagrams.py'),init_globals={'AUTHORING_LAYOUT':True})
    r=m['LAYOUT'];result={};workpath=root/'scripts/diagram-layout.work.json'
    cache=json.loads(workpath.read_text(encoding='utf-8')) if workpath.exists() else {}
    diagrams=m['DIAGRAMS']+([m['STATE_GRAPH']] if 'STATE_GRAPH' in m else [])
    for d in diagrams:
        r['align_rows'](d)
        snapshot={n.id:[n.x,n.y,n.w,n.h] for n in d.nodes.values()};captions=r['node_labels'](d,m['lines'])
        old=cache.get(d.slug)
        if old and old['nodes']==snapshot and old.get('captions')=={k:list(v) for k,v in captions.items()}:
            result[d.slug]=old;print(d.slug,'reuse validated layout',flush=True);continue
        start=time.time();stats=r['route_all'](d,m['lines']);r['assert_routes'](d)
        result[d.slug]={'nodes':{n.id:[n.x,n.y,n.w,n.h] for n in d.nodes.values()},'flows':[{'key':[f.a,f.b,f.label],'points':f.points,'labelpos':f.labelpos} for f in d.flows]}
        result[d.slug]['captions']=captions
        cache.update(result);workpath.write_text(json.dumps(cache,ensure_ascii=False,indent=2),encoding='utf-8')
        print(d.slug,stats,'seconds',round(time.time()-start,1),flush=True)
    (root/'scripts/diagram-layout.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Saved routing source for',len(diagrams),'diagrams.')
if __name__=='__main__':main()
