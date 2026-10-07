import { resizeCanvas, UNSET } from "../common";
import { PoplarData } from "./poplardata";


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
    const { drawOrder, branchIndices, baseTree, nodePos, numBins } = popData;

    if (!baseTree) return;
    ctx.strokeStyle = "black";
    drawOrder.forEach((nodeIndex, i) => {
      if (!branchIndices.includes(nodeIndex)) return;
      ctx.fillStyle = this.getColor(i);
      this.drawTreeArea(ctx, nodeIndex, numBins);
    });
    ctx.strokeStyle = "black";
    ctx.beginPath();
    drawOrder.forEach((nodeIndex) => {
      const parentIndex = baseTree.getParentIndexOf(nodeIndex);
      const curretNodePos = nodePos[nodeIndex];
      const parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : nodePos[parentIndex];
      this.drawTreeBranch(ctx, nodeIndex, numBins, curretNodePos, parentNodePos);
    });
    ctx.stroke();
  }

  drawTreeBranch(ctx: CanvasRenderingContext2D,
    nodeIndex: number,
    numBins: number,
    currentNodePos: number[],
    parentNodePos: number[]
  ) {
    const { xSpan, ySpan, popData } = this;
    const lastIndex = numBins - 1;
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
      const center = popData.getPoplarCoordCenter(nodeIndex, i);
      const splitTop = popData.getPoplarCoordSplitTop(nodeIndex, i);
      if (center !== UNSET && splitTop === UNSET) {
        x = PADDING.left + i / lastIndex * xSpan;
        y = PADDING.top + center * ySpan;
        if (x < nodeXrender) ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(nodeXrender, nodeYrender);
  }

  drawTreeArea(ctx: CanvasRenderingContext2D,
    nodeIndex: number,
    numBins: number,
    includeDecendants = true
  ) {
    const { xSpan, ySpan, popData } = this;
    const binCount = numBins - 1;
    let i = 0;
    let drawing = false;
    let x: number;
    let y: number;
    let firstDrawn = UNSET;
    ctx.beginPath();
    /* draw along the bottom, from right to left */
    for (i = binCount; i >= 0; i--) {
      const bottom = popData.getPoplarCoordBottom(nodeIndex, i);
      if (bottom !== UNSET) {
        x = PADDING.left + i / (binCount) * xSpan;
        y = PADDING.top + bottom * ySpan;
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
    for (i = firstDrawn; i < numBins; i++) {
      const top = popData.getPoplarCoordTop(nodeIndex, i);
      if (top !== UNSET) {
        x = PADDING.left + i / (binCount) * xSpan;
        y = PADDING.top + top * ySpan;
        ctx.lineTo(x, y);
        // ctx.ellipse(x, y, 4, 4, Math.PI / 4, 0, 2 * Math.PI);
        lastDrawn = i;
        const splitTop = popData.getPoplarCoordSplitTop(nodeIndex, i);
        if (splitTop !== UNSET && firstSplit === UNSET) {
          firstSplit = i;
        }
      }
    }
    if (firstSplit !== UNSET && !includeDecendants) {
      /* draw along the top of the split, right to left */
      for (i = lastDrawn; i >= firstSplit; i--) {
        const splitTop = popData.getPoplarCoordSplitTop(nodeIndex, i);
        x = PADDING.left + i / binCount * xSpan;
        y = PADDING.top + splitTop * ySpan;
        ctx.lineTo(x, y);
      }
      /* draw along the bottom of the split, left to right */
      for (; i <= lastDrawn; i++) {
        const splitBottom = popData.getPoplarCoordSplitBottom(nodeIndex, i);
        x = PADDING.left + i / binCount * xSpan;
        y = PADDING.top + splitBottom * ySpan;
        ctx.lineTo(x, y);
      }
    }
    ctx.fill();
  }
}
