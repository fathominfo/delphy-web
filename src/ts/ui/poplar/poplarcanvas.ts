import { resizeCanvas, UNSET } from "../common";
import { PoplarCoord, PoplarData } from "./poplardata";


const PADDING = {
  top: 5,
  bottom: 5,
  left: 5,
  right: 5
};

const COLORS = [
  "#71FFF7",
  "#FD6498",
  "#FFDB6C",
  "#FCFF70",
  "#FD6E6D",
  "#6E63FF",
  "#7F62FF",
  "#7DFF6A",
  "#6FC7FF",
  "#FFC76C",
  "#B85FFF",
  "#FC61CD",
  "#C1FF6C",
  "#6B83FF",
  "#AFFF6E",
];

export class PoplarCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  popData: PoplarData;
  width: number = UNSET;
  height: number = UNSET;
  xSpan: number = UNSET;
  ySpan: number = UNSET;
  branchColors = new Map<number, string>();

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, popData: PoplarData) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.popData = popData;
  }


  getColor(k: number): string {
    let c = this.branchColors.get(k);
    if (!c) {
      c = COLORS[k % COLORS.length];
      this.branchColors.set(k, c);
    }
    return c;
  }

  sizeCanvas() {
    const { width, height } = resizeCanvas(this.canvas);
    this.width = width;
    this.height = height;
    this.xSpan = this.width - PADDING.left - PADDING.right;
    this.ySpan = this.height - PADDING.top - PADDING.bottom;
  }

  draw() {
    const { ctx, popData, width, height } = this;
    ctx.clearRect(0, 0, width, height);
    const { treePoplarCoords, drawOrder, branchIndices, baseTree, nodePos, numBins } = popData;

    if (!baseTree) return;
    ctx.strokeStyle = "black";
    drawOrder.forEach((k, i) => {
      if (!branchIndices.includes(k)) return;
      ctx.fillStyle = this.getColor(i);
      const row = treePoplarCoords[k];
      this.drawTreeArea(ctx, row, numBins);
    });
    ctx.strokeStyle = "black";
    ctx.beginPath();
    drawOrder.forEach((nodeIndex, i) => {
      const row = treePoplarCoords[nodeIndex];
      const parentIndex = baseTree.getParentIndexOf(nodeIndex);
      const curretNodePos = nodePos[nodeIndex];
      const parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : nodePos[parentIndex];
      this.drawTreeBranch(ctx, row, numBins, curretNodePos, parentNodePos);
    });
    ctx.stroke();
  }

  drawTreeBranch(ctx: CanvasRenderingContext2D,
    row: PoplarCoord[],
    numBins: number,
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
    for (i = 0; i < numBins; i++) {
      if (row[i].center !== UNSET && row[i].splitTop === UNSET) {
        x = PADDING.left + i / lastIndex * xSpan;
        y = PADDING.top + row[i].center * ySpan;
        if (x < nodeXrender) ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(nodeXrender, nodeYrender);
  }

  drawTreeArea(ctx: CanvasRenderingContext2D,
    row: PoplarCoord[],
    numBins: number,
    includeDecendants = true
  ) {
    const { xSpan, ySpan } = this;
    const binCount = numBins - 1;
    let i = 0;
    let drawing = false;
    let x: number;
    let y: number;
    let firstDrawn = UNSET;
    ctx.beginPath();
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
        firstDrawn = i;
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
        x = PADDING.left + i / binCount * xSpan;
        y = PADDING.top + row[i].splitTop * ySpan;
        ctx.lineTo(x, y);
      }
      /* draw along the bottom of the split, left to right */
      for (; i <= lastDrawn; i++) {
        x = PADDING.left + i / binCount * xSpan;
        y = PADDING.top + row[i].splitBottom * ySpan;
        ctx.lineTo(x, y);
      }
    }
    ctx.fill();
  }
}
