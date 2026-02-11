import { Context2d } from "jspdf";
import { PdfCanvas } from "../../util/pdfcanvas";
import { DisplayNodeClass, getCSSValue, UNSET } from "../common";
import { MccTreeCanvas } from "../mcctreecanvas";
import { SummaryTree } from "../../pythia/delphy_api";
import { TreeSelectCallback, NodePair, NodePairType, TreeHoverCallback, } from "./lineagescommon";
import { DateLabel } from "../datelabel";

enum DisplayNodeSizes {
  root = 4,
  mrca = 4,
  nodeA = 5.5,
  nodeB = 5.5
}



export class LineagesTreeCanvas extends MccTreeCanvas {
  rootNode: DisplayNodeClass | null = null;
  mrcaNode: DisplayNodeClass | null = null;
  nodeANode: DisplayNodeClass | null = null;
  nodeBNode: DisplayNodeClass | null = null;
  descendants: NodePair[] = [];
  subtreeNode: DisplayNodeClass | null = null;
  highlightedNode: DisplayNodeClass | null = null;
  highlightedDate: number = UNSET;
  highlightCanvas: HTMLCanvasElement;
  highlightCtx: CanvasRenderingContext2D;


  constructor(canvas: HTMLCanvasElement | PdfCanvas,
    ctx: CanvasRenderingContext2D | Context2d,
    highlightCanvas: HTMLCanvasElement,
    highlightCtx: CanvasRenderingContext2D,
    hoverCallback: TreeHoverCallback,
    selectionCallback: TreeSelectCallback
  ) {
    super(canvas, ctx);
    this.highlightCanvas = highlightCanvas;
    this.highlightCtx = highlightCtx;
    const eventCanvas = this.canvas as HTMLCanvasElement;
    // need to handle dragging when zoomed
    eventCanvas.addEventListener("pointerenter", (event)=>{
      const nodeIndex:number = this.getNodeAt(event.offsetX, event.offsetY),
        date = this.getZoomDate(event.offsetX);
      hoverCallback(nodeIndex, date);
    });
    eventCanvas.addEventListener("pointermove", (event)=>{
      const nodeIndex:number = this.getNodeAt(event.offsetX, event.offsetY),
        date = this.getZoomDate(event.offsetX);
      hoverCallback(nodeIndex, date);
    });
    eventCanvas.addEventListener("pointerleave", ()=>{
      hoverCallback(UNSET, UNSET);
    });
    eventCanvas.addEventListener("click", (event)=>{
      const nodeIndex:number = this.getNodeAt(event.offsetX, event.offsetY);
      selectionCallback(nodeIndex);
    });
  }


  setNodes(rootIndex: number, mrcaIndex: number, nodeAIndex: number,
    nodeBIndex: number, descendants: NodePair[]) {
    if (rootIndex === UNSET) {
      if (this.rootNode !== null) {
        this.rootNode.deactivate();
        this.rootNode = null;
      }
    } else if (this.rootNode === null) {
      this.rootNode = new DisplayNodeClass(0);
      this.rootNode.setIndex(rootIndex);
    } else if (rootIndex !== this.rootNode.index) {
      this.rootNode.setIndex(rootIndex);
    }

    if (mrcaIndex === UNSET) {
      if (this.mrcaNode !== null) {
        this.mrcaNode.deactivate();
        this.mrcaNode = null;
      }
    } else if (this.mrcaNode === null) {
      this.mrcaNode = new DisplayNodeClass(0);
      this.mrcaNode.setIndex(mrcaIndex);
    } else if (mrcaIndex !== this.mrcaNode.index) {
      this.mrcaNode.setIndex(mrcaIndex);
    }

    if (nodeAIndex === UNSET) {
      if (this.nodeANode !== null) {
        this.nodeANode.deactivate();
        this.nodeANode = null;
      }
    } else if (this.nodeANode === null) {
      this.nodeANode = new DisplayNodeClass(0);
      this.nodeANode.setIndex(nodeAIndex);
    } else if (nodeAIndex !== this.nodeANode.index) {
      this.nodeANode.setIndex(nodeAIndex);
    }

    if (nodeBIndex === UNSET) {
      if (this.nodeBNode !== null) {
        this.nodeBNode.deactivate();
        this.nodeBNode = null;
      }
    } else if (this.nodeBNode === null) {
      this.nodeBNode = new DisplayNodeClass(0);
      this.nodeBNode.setIndex(nodeBIndex);
    } else if (nodeBIndex !== this.nodeBNode.index) {
      this.nodeBNode.setIndex(nodeBIndex);
    }


    this.descendants = descendants;
  }


  private drawSelection() {
    const ctx = this.highlightCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.descendants.forEach(nodePair=>this.drawAncestry(nodePair));
    this.drawNode(this.rootNode);
    this.drawNode(this.mrcaNode);
    this.drawNode(this.nodeANode);
    this.drawNode(this.nodeBNode);
  }


  requestDrawSelection() {
    requestAnimationFrame(()=>this.drawSelection());
  }

  draw(minDate : number, maxDate: number, timelineIndices: DateLabel[]) {
    super.draw(minDate, maxDate, timelineIndices);
    this.drawSelection();
  }

  highlightNode(node: DisplayNodeClass | null, date: number) {
    this.highlightCtx.clearRect(0, 0, this.width, this.height);
    this.highlightedNode = node;
    this.highlightedDate = date;
    this.subtreeNode = null;
    const others: DisplayNodeClass[] = [];
    [
      this.rootNode,
      this.mrcaNode,
      this.nodeANode,
      this.nodeBNode,
    ].filter((node)=>node !== null) // eslint-disable-line @typescript-eslint/no-unused-vars
      .forEach((displayNode)=>{
        if (displayNode === node) {
          this.subtreeNode = displayNode;
        } else if (displayNode !== null) {
          others.push(displayNode);
        }
      });
    if (this.subtreeNode === UNSET) {
      this.highlightCtx.globalAlpha = 1.0;
      this.descendants.forEach(nodePair=>this.drawAncestry(nodePair));
      others.forEach((displayNode)=>{
        this.drawNode(displayNode);
      });
    } else {
      this.highlightCtx.globalAlpha = 0.5;
      this.renderSubtree();
      this.descendants.forEach(nodePair=>this.drawAncestry(nodePair));
      others.forEach((displayNode)=>{
        this.drawNode(displayNode);
      });
      this.highlightCtx.globalAlpha = 1.0;
      this.drawNode(this.subtreeNode);
    }
    this.setHoverDate(date);
  }


  drawAncestry(pair: NodePair): void {
    const ctx = this.highlightCtx;
    const highlightNode = this.highlightedNode;
    const {ancestor, descendant} = pair;
    let displayNode: DisplayNodeClass | null = this.rootNode;
    switch(pair.pairType) {
    case NodePairType.rootToMrca:
      displayNode = this.mrcaNode;
      break;
    case NodePairType.rootToNodeA:
    case NodePairType.mrcaToNodeA:
    case NodePairType.nodeBToNodeA:
      displayNode = this.nodeANode;
      break;
    case NodePairType.rootToNodeB:
    case NodePairType.mrcaToNodeB:
    case NodePairType.nodeAToNodeB:
      displayNode = this.nodeBNode;
      break;
    }
    if (!displayNode) return;
    const mcc = this.tree as SummaryTree;
    let parentIndex = descendant.index;
    let x = this.getZoomX(mcc.getTimeOf(parentIndex)),
      y = this.getZoomY(parentIndex);
    let py, px;
    ctx.globalAlpha = highlightNode === null || displayNode === highlightNode ? 1 : 0.5;
    ctx.strokeStyle = displayNode?.getStroke();
    ctx.lineWidth = parseFloat(getCSSValue("--lineages-tree-descent-stroke-weight"));
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (parentIndex !== ancestor.index && parentIndex !== UNSET) {
      parentIndex = mcc.getParentIndexOf(parentIndex);
      px = this.getZoomX(mcc.getTimeOf(parentIndex));
      py = this.getZoomY(parentIndex);
      ctx.lineTo(px, y);
      ctx.lineTo(px, py);
      x = px;
      y = py;
    }
    ctx.stroke();
  }


  drawNode(displayNode: DisplayNodeClass | null): void {
    if (displayNode === null) return;
    const index = displayNode.index;
    const typeName = displayNode.className;
    const ctx = this.highlightCtx;
    const highlightNode = this.highlightedNode;
    const mcc = this.tree as SummaryTree,
      x = this.getZoomX(mcc.getTimeOf(index)),
      y = this.getZoomY(index);
    let radius: number;
    let fillColor: string;
    let outlining = false;
    if (typeName === 'root' || typeName === 'mrca') {
      fillColor = displayNode.getStroke();
      radius = DisplayNodeSizes.root; // same as mrca
    } else {
      fillColor = displayNode.getFill();
      radius = DisplayNodeSizes.nodeA; // same as nodeB
      outlining = true;
    }
    const strokeColor = displayNode.getStroke();
    ctx.globalAlpha = highlightNode === null || displayNode === highlightNode ? 1 : 0.5;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    if (outlining) {
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
  }


  renderSubtree() : void {
    if (!this.subtreeNode) return;
    this.highlightCtx.lineWidth  = parseFloat(getCSSValue("--tree-branch-d-stroke-weight"));
    const stops = [this.rootNode, this.mrcaNode, this.nodeANode, this.nodeBNode].filter(n=>n !== null && n !== this.subtreeNode).map(n=>n?.index) as number[];
    let color = "rgba(0,0,0,0)";
    if (this.subtreeNode) {
      color = this.subtreeNode.getTint();
    }
    this.highlightCtx.strokeStyle = color;
    super.drawSubtree(this.subtreeNode.index, this.highlightCtx, stops);
  }

}