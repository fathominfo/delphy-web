import { Context2d } from "jspdf";
import { PdfCanvas } from "../../util/pdfcanvas";
import { DisplayNode, getCSSValue, getNodeFill, getNodeStroke, getNodeTint, UNSET } from "../common";
import { MccTreeCanvas } from "../mcctreecanvas";
import { NodeComparisonChartData } from "./nodecomparisonchartdata";
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
        dateIndex = date - this.minDate;
      hoverCallback(nodeIndex, dateIndex);
    });
    eventCanvas.addEventListener("pointermove", (event)=>{
      const nodeIndex:number = this.getNodeAt(event.offsetX, event.offsetY),
        date = this.getZoomDate(event.offsetX),
        dateIndex = date - this.minDate;
      hoverCallback(nodeIndex, dateIndex);
    });
    eventCanvas.addEventListener("pointerleave", ()=>{
      hoverCallback(UNSET, UNSET);
    });
    eventCanvas.addEventListener("click", (event)=>{
      const nodeIndex:number = this.getNodeAt(event.offsetX, event.offsetY);
      if (this.nodeAIndex === nodeIndex) {
        selectionCallback(DisplayNode.nodeA, nodeIndex);
      } else if (this.nodeBIndex === nodeIndex) {
        selectionCallback(DisplayNode.nodeB, nodeIndex);
      }

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
    // this.setHoverDate(dateIndex);
    ctx.clearRect(0, 0, this.width, this.height);
    // if (subtreeNode !== UNSET) {
    //   ctx.fillStyle = "rgba(255,255,255,0.85)";
    //   ctx.fillRect(0, 0, this.width, this.height);
    //   const stops = [rootIndex, mrcaIndex, nodeAIndex, nodeBIndex].filter(n=>n !== UNSET && n !== subtreeNode);
    //   const color = subtreeNode === mrcaIndex ? getNodeTint(DisplayNode.mrca)
    //     : subtreeNode === nodeAIndex ? getNodeTint(DisplayNode.nodeA)
    //       : subtreeNode === nodeBIndex ? getNodeTint(DisplayNode.nodeB)
    //         : getNodeTint(DisplayNode.root);
    //   // this.drawSubtree(subtreeNode, ctx, asSuper, color, stops);
    // }
    this.descendants.forEach(nodePair=>this.drawAncestry(nodePair));
    this.drawNode(this.rootIndex, DisplayNode.root);
    this.drawNode(this.mrcaIndex, DisplayNode.mrca);
    this.drawNode(this.nodeAIndex, DisplayNode.nodeA);
    this.drawNode(this.nodeBIndex, DisplayNode.nodeB);

  }

  requestDrawSelection() {
    requestAnimationFrame(()=>this.drawSelection());
  }

  /*
  need a means for the the mccconfig to invoke drawing
  the tree and the highlights when the zoom has changed.
  So we override the default request to draw the tree
  with a version that also draws the highlight nodes.
  */
  // requestDraw(): void {
  //   super.requestDraw();
  //   this.requestDrawTreeHighlights(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex);
  // }

  draw(minDate : number, maxDate: number, timelineIndices: DateLabel[]) {
    super.draw(minDate, maxDate, timelineIndices);
    this.drawSelection();
  }

  highlightNode(node: DisplayNode, dateIndex: number) {
    console.log(`lineagestreecanvas.highlightNode(${node}, ${dateIndex})`);
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

  // drawSubtree(index: number, ctx: CanvasRenderingContext2D, treeCanvas: MccTreeCanvas, color: string, stops: number[]) : void {
  //   ctx.lineWidth  = parseFloat(getCSSValue("--tree-branch-d-stroke-weight"));
  //   ctx.strokeStyle = color;
  //   treeCanvas.drawSubtree(index, ctx, stops);

  // }


  //   handleNodeHighlight(node: DisplayNode, dateIndex: number) {
  //     /*
  //     for the tree, push back most of the tree,
  //     and draw the highlighted subtree on the highlight canvas
  //     */
  //     this.mccTreeCanvas.setFade(node !== UNSET);
  //     super.requestTreeDraw();
  //     let subtreeIndex = UNSET;
  //     switch(node) {
  //     case DisplayNode.root: {
  //       subtreeIndex = this.rootIndex;
  //       this.handleHint(TreeHint.HoverRoot);
  //     }
  //       break;
  //     case DisplayNode.mrca: {
  //       subtreeIndex = this.mrcaIndex;
  //       this.handleHint(TreeHint.HoverMrca);
  //     }
  //       break;
  //     case DisplayNode.nodeA: {
  //       subtreeIndex = this.nodeAIndex;
  //       this.handleHint(TreeHint.HoverNodeA);
  //     }
  //       break;
  //     case DisplayNode.nodeB: {
  //       subtreeIndex = this.nodeBIndex;
  //       if (this.nodeAIndex !== UNSET) {
  //         this.handleHint(TreeHint.HoverNodeBDescendant);
  //       } else {
  //         this.handleHint(TreeHint.HoverNodeBCousin);
  //       }
  //     }
  //       break;
  //     default: {
  //       if (this.nodeAIndex !== UNSET && this.nodeBIndex !== UNSET) {
  //         this.handleHint(TreeHint.MaxSelections);
  //       } else {
  //         this.handleHint(TreeHint.Hover);
  //       }
  //     }
  //       break;
  //     }
  //     /* draw on the hover canvas for the mcc tree */
  //     this.requestDrawTreeHighlights(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex, subtreeIndex, dateIndex);


  //   }


}