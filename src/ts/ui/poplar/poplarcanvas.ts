import { resizeCanvas, UNSET } from "../common";
import { PoplarData } from "./poplardata";


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
    const { canvas, ctx, popData, width, height, xSpan, ySpan: ySpan } = this;
    ctx.clearRect(0, 0, width, height);
    const { treePoplarCoords, drawOrder, baseTree } = popData;

    if (!baseTree) return;
    ctx.strokeStyle = "black";

    drawOrder.forEach(k => {
      if (!popData.branchIndices.includes(k)) return;
      const row = treePoplarCoords[k];
      const r = Math.random() * 50 + 150;
      const g = Math.random() * 200 + 50;
      ctx.fillStyle = `rgba(${r},${g},60,1.0)`;


      ctx.beginPath();
      let i = 0;
      let drawing = false;

      for (i = row.length - 1; i >= 0; i--) {
        if (row[i].center !== UNSET) {
          const x = PADDING.left + i / (row.length - 1) * xSpan;
          const y = PADDING.top + row[i].bottom * ySpan;
          if (!drawing) {
            ctx.moveTo(x, y);
            drawing = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }

      for (i = 0; i < row.length; i++) {
        if (row[i].center !== UNSET) {
          const x = PADDING.left + i / (row.length - 1) * xSpan;
          const y = PADDING.top + row[i].top * ySpan;
          ctx.lineTo(x, y);
          // ctx.ellipse(x, y, 4, 4, Math.PI / 4, 0, 2 * Math.PI);
        }
      }

      // ctx.stroke();
      ctx.fill();

      ctx.beginPath();
      const parentIndex = baseTree.getParentIndexOf(k);
      const lastIndex = row.length - 1;
      if (parentIndex !== UNSET) {
        const parentCoordRow = treePoplarCoords[parentIndex];
        const lastUnsplitParentCoord = parentCoordRow[lastIndex];
        const lastUnsplitCol = lastUnsplitParentCoord.lastUnsplitCol;
        const x = PADDING.left + lastUnsplitCol / (lastIndex) * xSpan;
        const y = PADDING.top + parentCoordRow[lastUnsplitCol].center * ySpan;
        ctx.moveTo(x, y);
      }

      for (i = 0; i < row.length; i++) {
        if (row[i].center !== UNSET && row[i].splitTop === UNSET) {
          const x = PADDING.left + i / (row.length - 1) * xSpan;
          const y = PADDING.top + row[i].center * ySpan;
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    })
  }
}

