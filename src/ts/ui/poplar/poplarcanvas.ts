import { resizeCanvas, UNSET } from "../common";
import { PoplarCoord, PoplarData } from "./poplardata";


const PADDING = {
  top: 5,
  bottom: 5,
  left: 5,
  right: 5
};


export class PoplarCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  popData: PoplarData;
  width: number = UNSET;
  height: number = UNSET;
  xSpan: number = UNSET;
  ySpan: number = UNSET;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, popData: PoplarData) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.popData = popData;
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
    const { treePoplarCoords, drawOrder, branchIndices, baseTree, nodePos } = popData;

    if (!baseTree) return;
    ctx.strokeStyle = "black";
    drawOrder.forEach((k, i) => {
      if (!branchIndices.includes(k)) return;
      const r = Math.random() * 50 + 150;
      const g = Math.random() * 200 + 50;
      ctx.fillStyle = `rgba(${r},${g},60,1.0)`;
      const row = treePoplarCoords[k];
      this.drawTreeArea(ctx, row);
    });
    ctx.strokeStyle = "black";
    ctx.beginPath();
    drawOrder.forEach((nodeIndex, i) => {
      const row = treePoplarCoords[nodeIndex];
      const parentIndex = baseTree.getParentIndexOf(nodeIndex);
      // const parentRow = parentIndex === UNSET ? null : treePoplarCoords[parentIndex];
      const curretNodePos = nodePos[nodeIndex];
      const parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : nodePos[parentIndex];
      this.drawTreeBranch(ctx, row, curretNodePos, parentNodePos, i);
    });
    ctx.stroke();
  }

  drawTreeBranch(ctx: CanvasRenderingContext2D,
    row: PoplarCoord[],
    currentNodePos: number[],
    parentNodePos: number[],
    rowIndex: number
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
