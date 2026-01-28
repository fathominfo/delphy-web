import { Context2d } from "jspdf";
import { PdfCanvas } from "../../util/pdfcanvas";
import { DisplayNode, getCSSValue, getNodeFill, getNodeStroke, getNodeTint, UNSET } from "../common";
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
  rootIndex: number = UNSET;
  mrcaIndex: number = UNSET;
  nodeAIndex: number = UNSET;
  nodeBIndex: number = UNSET;
  descendants: NodePair[] = [];
  subtreeIndex: number = UNSET;
  highlightedNode: DisplayNode = DisplayNode.UNSET;
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
        date = this.getZoomDate(event.offsetX),
        dateIndex = Math.round(date - this.minDate);
      hoverCallback(nodeIndex, dateIndex);
    });
    eventCanvas.addEventListener("pointermove", (event)=>{
      const nodeIndex:number = this.getNodeAt(event.offsetX, event.offsetY),
        date = this.getZoomDate(event.offsetX),
        dateIndex = Math.round(date - this.minDate);
      hoverCallback(nodeIndex, dateIndex);
    });
    eventCanvas.addEventListener("pointerleave", ()=>{
      hoverCallback(UNSET, UNSET);
    });
    eventCanvas.addEventListener("click", (event)=>{
      const nodeIndex:number = this.getNodeAt(event.offsetX, event.offsetY);
      selectionCallback(nodeIndex);
    });
  }


  setNodes(rootIndex: DisplayNode, mrcaIndex: DisplayNode, nodeAIndex: DisplayNode,
    nodeBIndex: DisplayNode, descendants: NodePair[]) {
    this.rootIndex = rootIndex;
    this.mrcaIndex = mrcaIndex;
    this.nodeAIndex = nodeAIndex;
    this.nodeBIndex = nodeBIndex;
    this.descendants = descendants;
  }

  private drawSelection() {
    const ctx = this.highlightCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.descendants.forEach(nodePair=>this.drawAncestry(nodePair));
    this.drawNode(this.rootIndex, DisplayNode.root);
    this.drawNode(this.mrcaIndex, DisplayNode.mrca);
    this.drawNode(this.nodeAIndex, DisplayNode.nodeA);
    this.drawNode(this.nodeBIndex, DisplayNode.nodeB);
  }


  requestDrawSelection() {
    requestAnimationFrame(()=>this.drawSelection());
  }

  draw(minDate : number, maxDate: number, timelineIndices: DateLabel[]) {
    super.draw(minDate, maxDate, timelineIndices);
    this.drawSelection();
  }

  highlightNode(node: DisplayNode, dateIndex: number) {
    this.highlightCtx.clearRect(0, 0, this.width, this.height);
    this.highlightedNode = node;
    this.highlightedDate = dateIndex;
    this.subtreeIndex = UNSET;
    const others: [number, DisplayNode][] = [];
    [
      [this.rootIndex, DisplayNode.root],
      [this.mrcaIndex, DisplayNode.mrca],
      [this.nodeAIndex, DisplayNode.nodeA],
      [this.nodeBIndex, DisplayNode.nodeB],
    ].filter(([index, _nodeType])=>index !== UNSET) // eslint-disable-line @typescript-eslint/no-unused-vars
      .forEach(([index, nodeType])=>{
        if (nodeType === node) {
          this.subtreeIndex = index;
        } else {
          others.push([index, nodeType]);
        }
      });
    if (this.subtreeIndex === UNSET) {
      this.highlightCtx.globalAlpha = 1.0;
      this.descendants.forEach(nodePair=>this.drawAncestry(nodePair));
      others.forEach(([index, displayNode])=>{
        this.drawNode(index, displayNode);
      });
    } else {
      this.highlightCtx.globalAlpha = 0.5;
      this.renderSubtree();
      this.descendants.forEach(nodePair=>this.drawAncestry(nodePair));
      others.forEach(([index, displayNode])=>{
        this.drawNode(index, displayNode);
      });
      this.highlightCtx.globalAlpha = 1.0;
      this.drawNode(this.subtreeIndex, node);
    }
    this.setHoverDate(dateIndex);
  }


  drawAncestry(pair: NodePair): void {
    const ctx = this.highlightCtx;
    const highlightNode = this.highlightedNode;
    const {index1, index2} = pair;
    if (index2 === UNSET) return;
    let displayNode: DisplayNode = DisplayNode.root;
    switch(pair.pairType) {
    case NodePairType.rootToMrca:
      displayNode = DisplayNode.mrca;
      break;
    case NodePairType.rootToNodeA:
    case NodePairType.mrcaToNodeA:
    case NodePairType.nodeBToNodeA:
      displayNode = DisplayNode.nodeA;
      break;
    case NodePairType.rootToNodeB:
    case NodePairType.mrcaToNodeB:
    case NodePairType.nodeAToNodeB:
      displayNode = DisplayNode.nodeB;
      break;
    }

    const mcc = this.tree as SummaryTree;
    let parentIndex = index2;
    let x = this.getZoomX(mcc.getTimeOf(index2)),
      y = this.getZoomY(index2);
    let py, px;
    ctx.globalAlpha = highlightNode === UNSET || displayNode === highlightNode ? 1 : 0.5;
    ctx.strokeStyle = getNodeStroke(displayNode);
    ctx.lineWidth = parseFloat(getCSSValue("--lineages-tree-descent-stroke-weight"));
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (parentIndex !== index1 && parentIndex !== UNSET) {
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


  drawNode(index: number, displayNode: DisplayNode): void {
    if (index === UNSET) return;
    const ctx = this.highlightCtx;
    const highlightNode = this.highlightedNode;
    const mcc = this.tree as SummaryTree,
      x = this.getZoomX(mcc.getTimeOf(index)),
      y = this.getZoomY(index);
    let radius: number;
    let fillColor: string;
    if (displayNode === DisplayNode.root || displayNode === DisplayNode.mrca) {
      fillColor = getNodeStroke(displayNode);
      radius = DisplayNodeSizes.root; // same as mrca
    } else {
      fillColor = getNodeFill(displayNode);
      radius = DisplayNodeSizes.nodeA; // same as nodeB
    }
    const strokeColor = getNodeStroke(displayNode);
    ctx.globalAlpha = highlightNode === UNSET || displayNode === highlightNode ? 1 : 0.5;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    if (displayNode === DisplayNode.nodeA || displayNode === DisplayNode.nodeB) {
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
  }


  renderSubtree() : void {
    this.highlightCtx.lineWidth  = parseFloat(getCSSValue("--tree-branch-d-stroke-weight"));
    const stops = [this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex].filter(n=>n !== UNSET && n !== this.subtreeIndex);
    let color = "rgba(0,0,0,0)";
    switch (this.subtreeIndex) {
    case this.rootIndex: color = getNodeTint(DisplayNode.root); break;
    case this.mrcaIndex:  color = getNodeTint(DisplayNode.mrca); break;
    case this.nodeAIndex: color = getNodeTint(DisplayNode.nodeA); break;
    case this.nodeBIndex: color = getNodeTint(DisplayNode.nodeB); break;
    }
    this.highlightCtx.strokeStyle = color;
    super.drawSubtree(this.subtreeIndex, this.highlightCtx, stops);
  }

}