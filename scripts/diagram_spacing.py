"""Add presentation space while retaining authoring coordinates and readable type."""
from bisect import bisect_right

SCALES={'06-bpmn-search-handover':1.0}

def apply(diagrams,layout,wrap):
    for d in diagrams:
        scale=SCALES.get(d.slug,1.25)
        captions=layout['node_labels'](d,wrap)
        old_lanes=list(d.lanes)
        boundaries=[];bottom=140
        for _,height in old_lanes:bottom+=height;boundaries.append(bottom)
        def fx(x):return 30+(x-30)*scale+100
        def fy(y,lane=None):
            if lane is None:lane=min(bisect_right(boundaries,y),len(old_lanes)-1)
            return 140+(y-140)*scale+72*lane+24
        for n in d.nodes.values():
            n.x=fx(n.x);n.y=fy(n.y,n.lane);n.w*=scale;n.h*=scale
        d.readable_captions={id:(fx(x),fy(y,d.nodes[id].lane),w*scale,h*scale) for id,(x,y,w,h) in captions.items()}
        for f in d.flows:
            f.points=layout['compact']([(fx(x),fy(y)) for x,y in f.points])
            if f.labelpos:f.labelpos=(fx(f.labelpos[0]),fy(f.labelpos[1]))
        d.lanes=[(name,height*scale+72) for name,height in old_lanes]
        d.width=round(fx(d.width)+32)
        d.bottom=140+sum(h for _,h in d.lanes)
        d.height=round(d.bottom+115+len(d.notes)*25)
        d.header_width=200
        refine(d)
        layout['place_labels'](d,d.readable_captions,wrap)

def refine(d):
    if d.slug=='02-bpmn-to-be':
        boundary=140+d.lanes[0][1]
        extra=100
        for n in d.nodes.values():
            if n.lane>0:n.y+=extra
        for id,(x,y,w,h) in list(d.readable_captions.items()):
            if d.nodes[id].lane>0:d.readable_captions[id]=(x,y+extra,w,h)
        for f in d.flows:
            f.points=[(x,y+extra if y>=boundary else y) for x,y in f.points]
        name,height=d.lanes[0];d.lanes[0]=(name,height+extra)
        d.bottom+=extra;d.height+=extra
        n=d.nodes['NoAlternative'];n.y+=80
        x,_,w,h=d.readable_captions[n.id]
        d.readable_captions[n.id]=(x,n.y+n.h+24,w,h)
        for f in d.flows:
            if f.b==n.id:
                # Keep the negative branch under the action with a clear approach.
                source=d.nodes[f.a]
                f.points=[source.pt('B'),(source.x+source.w/2,n.y+n.h/2),n.pt('R')]
    if d.slug in ['04-bpmn-cancellation','05-bpmn-discrepancy']:
        ids=['FinalEnd','StoppedEnd'] if d.slug.startswith('04-') else ['Done']
        for id in ids:
            n=d.nodes[id];x,_,w,h=d.readable_captions[id]
            d.readable_captions[id]=(x,n.y+n.h+24,w,h)
    if d.slug=='06-bpmn-search-handover':
        for id in ['KeepEnd','Done']:
            d.nodes[id].x+=160
            x,y,w,h=d.readable_captions[id]
            d.readable_captions[id]=(x+160,y,w,h)
        d.width+=180
        d.nodes['No'].x+=28
        x,y,w,h=d.readable_captions['No']
        d.readable_captions['No']=(x+28,d.nodes['No'].y+d.nodes['No'].h+24,w,h)
        x,_,w,h=d.readable_captions['KeepEnd']
        d.readable_captions['KeepEnd']=(x,d.nodes['KeepEnd'].y+d.nodes['KeepEnd'].h+24,w,h)
        for f in d.flows:
            if f.b=='KeepEnd':
                a=d.nodes[f.a].pt('R');b=d.nodes[f.b].pt('L')
                f.points=[a,(a[0]+105,a[1]),(a[0]+105,b[1]),b]
            elif f.b=='Done':f.points=[d.nodes[f.a].pt('R'),d.nodes[f.b].pt('L')]
            elif f.b=='No':f.points[-1]=d.nodes['No'].pt('L')
