import { UNSET } from "../common";
import { DateLabel } from "../datelabel";
import { TreeCanvas } from "../treecanvas";
import { PoplarChart, SelectNodeCallback } from "./poplarcommon";


const TIP_RADIUS = 2.5;
const INNER_RADIUS = 5;
const TAU = Math.PI * 2;

/*
for debugging: identify the nodes that are assigned principal colors
in the poplar tree (but here they will be colored red).
*/
const SHOW_TOPS = true;


export class BaseTreeCanvas extends TreeCanvas {

  selectedNode: number = UNSET;
  labels: DateLabel[] = [];
  topNodes: number[] = [];

  constructor(canvas: HTMLCanvasElement, nodeSelectCallback: SelectNodeCallback) {
    const ctx: CanvasRenderingContext2D = canvas.getContext("2d") as CanvasRenderingContext2D;
    super(canvas, ctx);
    canvas.addEventListener("pointermove", (event:MouseEvent)=>{
      const nodeIndex = this.getNodeAt(event.offsetX, event.offsetY);
      if (nodeIndex !== this.selectedNode) {
        nodeSelectCallback(nodeIndex, PoplarChart.baseTree);
      }
    });
    canvas.addEventListener("pointerleave", () => {
      if (this.selectedNode !== UNSET) {
        nodeSelectCallback(UNSET, PoplarChart.baseTree);
      }
    });
  }

  sizeCanvas(): boolean {
    return super.sizeCanvas();
  }

  setSelectedNode(nodeIndex: number) {
    this.selectedNode = nodeIndex;
    requestAnimationFrame(()=>this.drawHighlight());
  }

  draw(earliest: number, latest: number, dateLabels: DateLabel[]) {
    this.minDate = earliest;
    this.maxDate = latest;
    this.labels = dateLabels;
    this.drawTree();
    this.drawTops();
  }

  drawTops() {
    if (SHOW_TOPS) {
      this.ctx.fillStyle = "red";
      this.ctx.beginPath();
      this.topNodes.forEach(nodeIndex => {
        const [nx, ny] = this.getNodePosition(nodeIndex);
        const actualY = ny + this.timelineSpacing;
        this.ctx.moveTo(nx, actualY);
        this.ctx.arc(nx, actualY, 3, 0, TAU, false);
      });
      this.ctx.fill();
    }
  }


  drawTree() {
    super.draw(this.minDate, this.maxDate, this.labels);
  }

  drawHighlight() {
    const { ctx, selectedNode } = this;
    this.drawTree();
    this.drawTops();
    if (selectedNode !== UNSET) {
      ctx.strokeStyle = 'black';
      this.drawSubtree(selectedNode, ctx, false);
      const [nx, ny] = this.getNodePosition(selectedNode);
      const actualY = ny + this.timelineSpacing;
      const isTip = this.tipCounts[selectedNode] === 1;
      const radius = isTip ? TIP_RADIUS : INNER_RADIUS;
      this.setBranchWeight(selectedNode);
      ctx.beginPath();
      ctx.moveTo(nx, actualY + radius);
      if (isTip) {
        ctx.arc(nx, actualY, radius, 0.25 * TAU, 1.25 * TAU, false);
      } else {
        ctx.arc(nx, actualY, radius, 0.25 * TAU, 0.75 * TAU, false);
      }
      ctx.stroke();
      // ctx.fillStyle = 'black';
      // ctx.fillText(`node index: ${selectedNode}`, 40, 20);
    }
  }

}