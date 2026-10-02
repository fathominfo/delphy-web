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
  ySPan: number = UNSET;

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
    this.ySPan = this.height - PADDING.top - PADDING.bottom;
  }


  draw() {
    const { canvas, ctx, popData, width, height } = this;
    ctx.clearRect(0, 0, width, height);

  }
}

