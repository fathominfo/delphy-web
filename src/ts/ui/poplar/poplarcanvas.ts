import { resizeCanvas, UNSET } from "../common";
import { SelectCallback } from "./poplarcommon";
import { PoplarCoord, PoplarData } from "./poplardata";


const PADDING = {
  top: 5,
  bottom: 5,
  left: 5,
  right: 5
};

const COLORS = [
  "rgb(145,205,255)",
  // "rgb(0,86,129)",
  "rgb(119,148,158)",
  // "rgb(0,96,106)",
  "rgb(0,156,189)",
  "rgb(0,235,251)",
  "rgb(111,186,240)",
  // "rgb(0,81,151)",
  // "rgb(0,111,204)",
  "rgb(65,255,255)",
  "rgb(52,219,193)",
  "rgb(83,192,240)"
];

export class PoplarCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  highlightCanvas: HTMLCanvasElement;
  highlightCtx: CanvasRenderingContext2D;
  popData: PoplarData;
  width: number = UNSET;
  height: number = UNSET;
  xSpan: number = UNSET;
  ySpan: number = UNSET;
  /* sparse array of colors */
  branchColors: string[] = [];
  selectedNode: number = UNSET;

  constructor(canvas: HTMLCanvasElement,
    highlightCanvas: HTMLCanvasElement,
    popData: PoplarData,
    nodeSelectCallback: SelectCallback
  ) {
    this.canvas = canvas;
    this.highlightCanvas = highlightCanvas;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.highlightCtx = highlightCanvas.getContext("2d") as CanvasRenderingContext2D;
    this.popData = popData;
    /*
    kind of a cheat, but maybe it will work? Find the horizontal
    location of the mouse, and for that vertical slice, find the
    closest branch.
    */
    const getClosestNode = (event: MouseEvent) => {
      const { binCount, branchIndices, drawOrder } = this.popData;
      let bindex = (event.offsetX - PADDING.left) / this.xSpan * (binCount - 1);
      const yScaled = (event.offsetY - PADDING.top) / this.ySpan;
      bindex = Math.max(0, Math.min(binCount - 1, Math.round(bindex)));
      let closest = UNSET;
      let nodeIndex: number;
      let top: number;
      let bottom: number;
      /*
      going through the node areas from the root down
      find the nodes with this point in their area.
      we want the smallest one that has its area drawn.
      */
      console.debug(`\n        find closest `);
      for (let i = 0; i < drawOrder.length; i++) {
        nodeIndex = drawOrder[i];
        if (branchIndices.includes(nodeIndex)) {
          top = this.popData.treePoplarCoords[nodeIndex][bindex].top;
          bottom = this.popData.treePoplarCoords[nodeIndex][bindex].bottom;
          if (yScaled >= top && yScaled < bottom) {
            console.log(i, nodeIndex, top, bottom, branchIndices.includes(nodeIndex));
            closest = nodeIndex;
          }
        }
      }
      return closest;
    };
    canvas.addEventListener("pointermove", (event: MouseEvent) => {
      const closest = getClosestNode(event);
      if (closest !== this.selectedNode) {
        nodeSelectCallback(closest);
      }
    });
    canvas.addEventListener("pointerleave", () => {
      if (this.selectedNode !== UNSET) {
        nodeSelectCallback(UNSET);
      }
    });
  }

  resetColors() {
    this.branchColors.length = 0;
  }

  setColors() {
    const { drawOrder, branchIndices } = this.popData;
    const { branchColors } = this;
    let colorIndex = 0;
    drawOrder.forEach((nodeIndex, i)=>{
      if (branchIndices.includes(nodeIndex) && branchColors[nodeIndex] === undefined) {
        branchColors[nodeIndex] = COLORS[colorIndex];
        console.log(nodeIndex, i, branchColors[nodeIndex], [91,84].includes(nodeIndex)? '--------' : '');
        colorIndex++;
        colorIndex %= COLORS.length;
      }
    });
  }

  setSelectedNode(nodeIndex: number) {
    this.selectedNode = nodeIndex;
    requestAnimationFrame(() => this.drawHighlight());
  }


  getColor(nodeIndex: number): string {
    let c = this.branchColors[nodeIndex];
    if (!c) {
      this.setColors();
      c = this.branchColors[nodeIndex];
    }
    return c;
  }

  sizeCanvas() {
    const { width, height } = resizeCanvas(this.canvas);
    this.width = width;
    this.height = height;
    this.xSpan = this.width - PADDING.left - PADDING.right;
    this.ySpan = this.height - PADDING.top - PADDING.bottom;
    resizeCanvas(this.highlightCanvas);
    this.ctx.lineWidth = 0.5;
  }

  draw() {
    const { ctx, popData, width, height } = this;
    ctx.clearRect(0, 0, width, height);
    const { treePoplarCoords, drawOrder, branchIndices, baseTree, nodePos } = popData;

    if (!baseTree) return;
    drawOrder.forEach((nodeIndex) => {
      if (!branchIndices.includes(nodeIndex)) return;
      const row = treePoplarCoords[nodeIndex];
      ctx.fillStyle = this.getColor(nodeIndex);
      ctx.beginPath();
      this.drawTreeArea(ctx, row);
      ctx.fill();
    });
    ctx.strokeStyle = "black";
    ctx.beginPath();
    drawOrder.forEach((nodeIndex) => {
      const row = treePoplarCoords[nodeIndex];
      const parentIndex = baseTree.getParentIndexOf(nodeIndex);
      const curretNodePos = nodePos[nodeIndex];
      const parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : nodePos[parentIndex];
      this.drawTreeBranch(ctx, row, curretNodePos, parentNodePos);
    });
    ctx.stroke();
  }

  drawTreeBranch(ctx: CanvasRenderingContext2D,
    row: PoplarCoord[],
    currentNodePos: number[],
    parentNodePos: number[]
  ) {
    const { xSpan, ySpan } = this;
    const lastIndex = row.length - 1;
    let i = 0;
    let x: number;
    let y: number;
    const [nodeX, nodeY] = currentNodePos;
    const [parentX, parentY] = parentNodePos;
    if (parentX === UNSET) {
      x = PADDING.left;
      y = PADDING.top + ySpan * 0.5;
    } else {
      x = PADDING.left + parentX / lastIndex * xSpan;
      y = PADDING.top + parentY * ySpan;
    }
    ctx.moveTo(x, y);
    const nodeXrender = PADDING.left + nodeX / lastIndex * xSpan;
    const nodeYrender = PADDING.top + nodeY * ySpan;
    for (i = 0; i < row.length; i++) {
      if (row[i].center !== UNSET && row[i].splitTop === UNSET) {
        x = PADDING.left + i / (row.length - 1) * xSpan;
        y = PADDING.top + row[i].center * ySpan;
        if (x < nodeXrender) ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(nodeXrender, nodeYrender);
  }

  drawTreeArea(ctx: CanvasRenderingContext2D,
    row: PoplarCoord[],
    includeDecendants = true,
    // parentRow: null | PoplarCoord[]
  ) {
    const { xSpan, ySpan } = this;
    const binCount = row.length - 1;
    let i = 0;
    let drawing = false;
    let x: number;
    let y: number;
    // let firstDrawn = UNSET;
    /* draw along the bottom, from right to left */
    for (i = binCount; i >= 0; i--) {
      if (row[i].center !== UNSET) {
        x = PADDING.left + i / (binCount) * xSpan;
        y = PADDING.top + row[i].bottom * ySpan;
        if (!drawing) {
          ctx.moveTo(x, y);
          drawing = true;
        } else {
          ctx.lineTo(x, y);
        }
        // firstDrawn = i;
      }
    }

    let firstSplit = UNSET;
    let lastDrawn = UNSET;
    /* draw along the top, left to right */
    for (i = 0; i < row.length; i++) {
      if (row[i].center !== UNSET) {
        x = PADDING.left + i / (binCount) * xSpan;
        y = PADDING.top + row[i].top * ySpan;
        ctx.lineTo(x, y);
        // ctx.ellipse(x, y, 4, 4, Math.PI / 4, 0, 2 * Math.PI);
        lastDrawn = i;
        if (row[i].splitTop !== UNSET && firstSplit === UNSET) {
          firstSplit = i;
        }
      }
    }
    if (firstSplit !== UNSET && !includeDecendants) {
      /* draw along the top of the split, right to left */
      for (i = lastDrawn; i >= firstSplit; i--) {
        if (row[i].splitTop !== UNSET) {
          x = PADDING.left + i / binCount * xSpan;
          y = PADDING.top + row[i].splitTop * ySpan;
          ctx.lineTo(x, y);
        }
      }
      /* draw along the bottom of the split, left to right */
      for (; i <= lastDrawn; i++) {
        if (row[i].splitBottom !== UNSET) {
          x = PADDING.left + i / binCount * xSpan;
          y = PADDING.top + row[i].splitBottom * ySpan;
          ctx.lineTo(x, y);
        }
      }
    }
  }

  drawHighlight() {
    const { ctx, selectedNode, width, height } = this;
    const { treePoplarCoords, baseTree, nodePos, drawOrder } = this.popData;
    if (!baseTree) return;
    if (selectedNode === UNSET) {
      this.draw();
    } else {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = "black";
      ctx.beginPath();
      drawOrder.forEach((nodeIndex) => {
        const row = treePoplarCoords[nodeIndex];
        const parentIndex = baseTree.getParentIndexOf(nodeIndex);
        const curretNodePos = nodePos[nodeIndex];
        const parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : nodePos[parentIndex];
        this.drawTreeBranch(ctx, row, curretNodePos, parentNodePos);
      });
      ctx.stroke();
      ctx.strokeStyle = this.getColor(selectedNode);
      ctx.fillStyle = this.getColor(selectedNode);
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      this.drawTreeArea(ctx, treePoplarCoords[selectedNode], true);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.beginPath();
      this.drawTreeArea(ctx, treePoplarCoords[selectedNode], false);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "black";
      ctx.beginPath();
      const row = treePoplarCoords[selectedNode];
      const parentIndex = baseTree.getParentIndexOf(selectedNode);
      const curretNodePos = nodePos[selectedNode];
      const parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : nodePos[parentIndex];
      this.drawTreeBranch(ctx, row, curretNodePos, parentNodePos);
      ctx.stroke();
    }

  }
}
