import { resizeCanvas, UNSET } from "../common";
import { DateLabel } from "../datelabel";
import { TreeCanvas } from "../treecanvas";
import { SelectCallback } from "./poplarcommon";


const TIP_RADIUS = 2.5;
const INNER_RADIUS = 5;
const TAU = Math.PI * 2;


export class BaseTreeCanvas extends TreeCanvas {

  selectedNode: number = UNSET;
  labels: DateLabel[] = [];

  constructor(canvas: HTMLCanvasElement, nodeSelectCallback: SelectCallback) {
    const ctx: CanvasRenderingContext2D = canvas.getContext("2d") as CanvasRenderingContext2D;
    super(canvas, ctx);
    canvas.addEventListener("pointermove", (event:MouseEvent)=>{
      const nodeIndex = this.getNodeAt(event.offsetX, event.offsetY);
      if (nodeIndex !== this.selectedNode) {
        nodeSelectCallback(nodeIndex);
      }
    });
    canvas.addEventListener("pointerleave", () => {
      if (this.selectedNode !== UNSET) {
        nodeSelectCallback(UNSET);
      }
    });
  }

  sizeCanvas(): void {
    super.sizeCanvas();
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
  }

  drawTree() {
    super.draw(this.minDate, this.maxDate, this.labels);
  }

  drawHighlight() {
    const { ctx, selectedNode } = this;
    this.drawTree();
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