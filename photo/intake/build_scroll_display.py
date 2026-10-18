"""Build a simplified visual contour ground, independent of musical geometry."""
from pathlib import Path
import sys
import json
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'experiment/vendor'))
import cv2
import numpy as np

def build(source,out,minimum=55):
    original=cv2.imdecode(np.fromfile(source,dtype=np.uint8),cv2.IMREAD_COLOR)
    gray=cv2.cvtColor(original,cv2.COLOR_BGR2GRAY)
    # Work at a coarser scale: roof hatching, foliage and paper texture
    # should not have the same visual weight as bridge and building edges.
    h=720;w=round(gray.shape[1]*h/gray.shape[0])
    gray=cv2.resize(gray,(w,h),interpolation=cv2.INTER_AREA)
    gray=cv2.bilateralFilter(gray,7,14,5)
    gray=cv2.bilateralFilter(gray,7,14,5)
    gray=cv2.createCLAHE(clipLimit=1.6,tileGridSize=(24,8)).apply(gray)
    gray=cv2.GaussianBlur(gray,(3,3),.8)
    edges=cv2.Canny(gray,28,65)
    n,labels,stats,_=cv2.connectedComponentsWithStats(edges,8)
    keep=np.zeros(n,np.uint8)
    # Long connected silhouettes survive; isolated engraving flecks do not.
    keep[1:]=(stats[1:,cv2.CC_STAT_AREA]>=minimum)*255
    edges=keep[labels]
    rgba=np.zeros((h,w,4),np.uint8);rgba[:,:,:3]=(55,75,62);rgba[:,:,3]=edges*0.78
    cv2.imencode('.png',rgba)[1].tofile(out)
    preview=np.full((h,w,3),(221,237,241),np.uint8)
    alpha=rgba[:,:,3:4].astype(float)/255
    preview=(preview*(1-alpha)+rgba[:,:,:3]*alpha).astype(np.uint8)
    report=dict(size=[w,h],components=int(np.count_nonzero(keep)),pixels=int(np.count_nonzero(edges)),explanation='Display-only coarse bilateral + Canny + connected-component filtering; musical data unchanged')
    (out.with_suffix('.json')).write_text(json.dumps(report,indent=2),encoding='utf8')
    print(report)
    return preview

def main():
    preview=build(ROOT/'web/museum/scroll/hongqiao.jpg',ROOT/'web/museum/scroll/major-contours.png')
    cv2.imencode('.png',preview)[1].tofile(ROOT/'scroll-work/major-contours-preview.png')

if __name__=='__main__':main()
