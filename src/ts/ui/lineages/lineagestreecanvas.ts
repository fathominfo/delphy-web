import { Context2d } from "jspdf";
import { PdfCanvas } from "../../util/pdfcanvas";
import { ColorOption, getCSSValue, UNSET } from "../common";
import { MccTreeCanvas } from "../mcctreecanvas";
import { SummaryTree } from "../../pythia/delphy_api";
import { NodeCallback, NodePair } from "./lineagescommon";
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
  configuredRootNode: number = UNSET;
  useMetadataColor = true;


  constructor(canvas: HTMLCanvasElement | PdfCanvas,
    ctx: CanvasRenderingContext2D | Context2d,
    highlightCanvas: HTMLCanvasElement,
    highlightCtx: CanvasRenderingContext2D,
    hoverCallback: NodeCallback,
    selectionCallback: NodeCallback
  ) {
    super(canvas, ctx);
    this.highlightCanvas = highlightCanvas;
    this.highlightCtx = highlightCtx;
    const eventCanvas = this.canvas as HTMLCanvasElement;
    // need to handle dragging when zoomed
    eventCanvas.addEventListener("pointerenter", (event)=>{
      const nodeIndex:number = this.getNodeAt(event.offsetX, event.offsetY);
      hoverCallback(nodeIndex);
    });
    let nodeIndex: number = UNSET;
    let throttleTimer = UNSET;
    let sendAnother = false;
    const THROTTLE_TIME = 1000 / 60;

    const sendUpdate = ()=>{
      hoverCallback(nodeIndex);
      throttleTimer = setTimeout(()=>{
        if (sendAnother) {
          sendAnother = false;
          sendUpdate();
        } else {
          throttleTimer = UNSET;
        }
      }, THROTTLE_TIME);
    }

    eventCanvas.addEventListener("pointermove", async (event)=>{
      if (this.isDragging) {
        this.handlePointerMove(event);
      } else {
        const ni = this.getNodeAt(event.offsetX, event.offsetY);
        sendAnother = ni !== nodeIndex;
        nodeIndex = ni;
        if (sendAnother && throttleTimer === UNSET) {
          sendUpdate();
        }
      }
    });
    eventCanvas.addEventListener("pointerleave", ()=>{
      nodeIndex = UNSET;
      if (throttleTimer !== UNSET) {
        clearTimeout(throttleTimer);
        throttleTimer = UNSET;
      }
      hoverCallback(nodeIndex);
    });
    eventCanvas.addEventListener("click", (event)=>{
      if (!this.hasDragged) {
        const nodeIndex:number = this.getNodeAt(event.offsetX, event.offsetY);
        selectionCallback(nodeIndex);
      }
    });


  }


  setNodes(nodes: DisplayNode [], descendants: NodePair[], configuredRootNode: number) {
    this.nodes = nodes;
    this.descendants = descendants;
    if (this.configuredRootNode !== configuredRootNode) {
      this.configuredRootNode = configuredRootNode;
      this.setRootNode(configuredRootNode);
      // const [ minDate, maxDate ] = this.getDateRange();
      // const timlineIndices = getTimelineIndices(minDate, maxDate);
      this.draw();
    }
  }

  private drawSelection() {
    const ctx = this.highlightCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    // this.descendants.forEach(nodePair=>this.drawAncestry(nodePair));
    this.nodes.forEach(n=>this.drawNode(n));
  }


  requestDrawSelection() {
    requestAnimationFrame(()=>this.drawSelection());
  }

  draw() {
    super.draw();
    this.useMetadataColor = !this.mccConfig || this.mccConfig.colorOption === ColorOption.metadata;
    this.drawSelection();
  }

  /*
  This is invoked when a highlight is created from a component
  _other_ than the tree.

  However! The DisplayNode object that gets passed in ultimately
  comes from CoreLineagesData, and it is a persistent object
  whose inner data changes. So whether it's 1) passing in an
  object, or 2) checking whether the highlightedNode has a
  match in this.nodes, both are misleading. Not sure if we can
  get away with just passing in a nodeIndex for the highlightNode,
  but that might be a less misleading implementation [mark 260505]

  TODO: refactor highlightNode to either
  a) pass in just the nodeIndex of the highlighted node, or
  b) since the passed in node is (probably? need to check)
  always the same node, don't pass in the node, just alert
  this class that a value _to which it already has a reference_
  has been updated.
  */
  highlightNode(node: DisplayNode, date: number) {
    // console.log('   highlightNode', node?.index)
    this.highlightCtx.clearRect(0, 0, this.width, this.height);
    this.highlightedNode = node;
    this.highlightedDate = date;
    this.subtreeNode = node;
    if (node.index !== UNSET) {
      const others: DisplayNode[] = this.nodes.filter(n=>n!==node);
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
    const highlightedNode = this.highlightedNode;
    const {ancestor, descendant} = pair;
    const mcc = this.tree as SummaryTree;
    let x = this.getZoomX(mcc.getTimeOf(descendant.index)),
      y = this.getZoomY(descendant.index);
    let py, px;
    ctx.globalAlpha = highlightedNode === null || highlightedNode.index === UNSET || descendant.index === highlightedNode.index ? 1 : 0.5;
    if (this.useMetadataColor) {
      ctx.strokeStyle = this.nodeColors[descendant.index];
    } else {
      ctx.strokeStyle = descendant.getStroke();
    }
    ctx.lineWidth = parseFloat(getCSSValue("--lineages-tree-descent-stroke-weight"));
    ctx.beginPath();
    ctx.moveTo(x, y);
    let parentIndex = mcc.getParentIndexOf(descendant.index);
    /* we need to draw up to the ancestor, but not beyond */
    const limitIndex = mcc.getParentIndexOf(ancestor.index)
    while (parentIndex !== limitIndex && parentIndex !== UNSET) {
      px = this.getZoomX(mcc.getTimeOf(parentIndex));
      py = this.getZoomY(parentIndex);
      ctx.lineTo(px, y);
      ctx.lineTo(px, py);
      x = px;
      y = py;
      parentIndex = mcc.getParentIndexOf(parentIndex);
    }
    ctx.stroke();
  }


  drawNode(displayNode: DisplayNode | null): void {
    if (displayNode === null) return;
    const index = displayNode.index;
    if (index === UNSET) return;
    const ctx = this.highlightCtx;
    const highlightedNode = this.highlightedNode;
    const mcc = this.tree as SummaryTree,
      x = this.getZoomX(mcc.getTimeOf(index)),
      y = this.getZoomY(index);
    const radius = displayNode.isInferred ? INFERRED_NODE_RADIUS : SELECTED_NODE_RADIUS;
    let fillColor: string;
    let outlining = false;
    if (this.useMetadataColor) {
      fillColor = this.nodeColors[index];
    } else if (displayNode.isInferred) {
      fillColor = displayNode.getStroke();
    } else {
      fillColor = displayNode.getFill();
      outlining = true;
    }
    const strokeColor = displayNode.getStroke();
    ctx.globalAlpha = highlightedNode === null || highlightedNode.index === UNSET || displayNode.index === highlightedNode.index ? 1 : 0.5;
    // console.log('drawing ', index, ctx.globalAlpha, displayNode === highlightNode)
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