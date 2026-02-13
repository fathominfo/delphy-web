import { Context2d } from "jspdf";
import { PdfCanvas } from "../../util/pdfcanvas";
import { getCSSValue, UNSET } from "../common";
import { MccTreeCanvas } from "../mcctreecanvas";
import { SummaryTree } from "../../pythia/delphy_api";
import { TreeSelectCallback, NodePair, TreeHoverCallback, } from "./lineagescommon";
import { DateLabel } from "../datelabel";
import { DisplayNode } from "./displaynode";

const INFERRED_NODE_RADIUS = 4;
const SELECTED_NODE_RADIUS = 5.5;



export class LineagesTreeCanvas extends MccTreeCanvas {
  nodes: DisplayNode[] = [];
  descendants: NodePair[] = [];
  subtreeNode: DisplayNode | null = null;
  highlightedNode: DisplayNode | null = null;
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


  setNodes(nodes: DisplayNode [],
    descendants: NodePair[]) {
    this.nodes = nodes;
    this.descendants = descendants;
  }


  private drawSelection() {
    const ctx = this.highlightCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.descendants.forEach(nodePair=>this.drawAncestry(nodePair));
    this.nodes.forEach(n=>this.drawNode(n));
  }


  requestDrawSelection() {
    requestAnimationFrame(()=>this.drawSelection());
  }

  draw(minDate : number, maxDate: number, timelineIndices: DateLabel[]) {
    super.draw(minDate, maxDate, timelineIndices);
    this.drawSelection();
  }

  highlightNode(node: DisplayNode, date: number) {
    this.highlightCtx.clearRect(0, 0, this.width, this.height);
    this.highlightedNode = node;
    this.highlightedDate = date;
    this.subtreeNode = node;
    if (node.index !== UNSET) {
      const others: DisplayNode[] = this.nodes.filter(n=>n!==node)
      this.highlightCtx.globalAlpha = 0.5;
      this.renderSubtree();
      this.descendants.forEach(nodePair=>this.drawAncestry(nodePair));
      others.forEach(n=>this.drawNode(n));
      this.highlightCtx.globalAlpha = 1.0;
      this.drawNode(this.subtreeNode);
    } else {
      this.highlightCtx.globalAlpha = 1.0;
      this.descendants.forEach(nodePair=>this.drawAncestry(nodePair));
      this.nodes.forEach(n=>this.drawNode(n));
    }
    this.setHoverDate(date);
  }


  drawAncestry(pair: NodePair): void {
    const ctx = this.highlightCtx;
    const highlightNode = this.highlightedNode;
    const {ancestor, descendant} = pair;
    const mcc = this.tree as SummaryTree;
    let parentIndex = descendant.index;
    let x = this.getZoomX(mcc.getTimeOf(parentIndex)),
      y = this.getZoomY(parentIndex);
    let py, px;
    ctx.globalAlpha = highlightNode === null || descendant === highlightNode ? 1 : 0.5;
    ctx.strokeStyle = descendant.getStroke();
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


  drawNode(displayNode: DisplayNode | null): void {
    if (displayNode === null) return;
    const index = displayNode.index;
    if (index === UNSET) return;
    const ctx = this.highlightCtx;
    const highlightNode = this.highlightedNode;
    const mcc = this.tree as SummaryTree,
      x = this.getZoomX(mcc.getTimeOf(index)),
      y = this.getZoomY(index);
    const radius = displayNode.isInferred ? INFERRED_NODE_RADIUS : SELECTED_NODE_RADIUS;
    let fillColor: string;
    let outlining = false;
    if (displayNode.isInferred) {
      fillColor = displayNode.getStroke();
    } else {
      fillColor = displayNode.getFill();
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
    if (!this.subtreeNode || this.subtreeNode.index === UNSET) return;
    this.highlightCtx.lineWidth  = parseFloat(getCSSValue("--tree-branch-d-stroke-weight"));
    const stops: number[] = this.nodes.map(n=>n.index);
    let color = "rgba(0,0,0,0)";
    if (this.subtreeNode) {
      color = this.subtreeNode.getTint();
    }
    this.highlightCtx.strokeStyle = color;
    super.drawSubtree(this.subtreeNode.index, this.highlightCtx, stops);
  }

}