import { Context2d } from "jspdf";
import { PdfCanvas } from "../../util/pdfcanvas";
import { MccTreeCanvas } from "../mcctreecanvas";
import { UNSET } from "../common";
import { HoverNodeFnc } from "./runcommon";
import { SummaryTree } from "../../pythia/delphy_api";


const HIGHLIGHT_RADIUS = 2;
const TAU = Math.PI * 2;

export class RunTree extends MccTreeCanvas {

  highlightCanvas: HTMLCanvasElement;
  highlightCtx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement | PdfCanvas,
    ctx: CanvasRenderingContext2D | Context2d,
    hoverCallback: HoverNodeFnc
  ) {
    super(canvas, ctx);
    this.highlightCanvas = document.createElement('canvas');
    this.highlightCanvas.classList.add("mcc_highlight");
    this.highlightCtx = this.highlightCanvas.getContext('2d') as CanvasRenderingContext2D;
    canvas.parentNode?.appendChild(this.highlightCanvas);
    if (canvas instanceof HTMLCanvasElement) {
      canvas.addEventListener("pointerenter", (event)=>{
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

      canvas.addEventListener("pointermove", async (event)=>{
        const ni = this.getNodeAt(event.offsetX, event.offsetY);
        sendAnother = ni !== nodeIndex;
        nodeIndex = ni;
        if (sendAnother && throttleTimer === UNSET) {
          sendUpdate();
        }
      });
      canvas.addEventListener("pointerleave", ()=>{
        nodeIndex = UNSET;
        if (throttleTimer !== UNSET) {
          clearTimeout(throttleTimer);
          throttleTimer = UNSET;
        }
        hoverCallback(nodeIndex);
      });
    }
  }


  sizeCanvas() {
    super.sizeCanvas();
    const { width, height } = this;
    const highlightCanvas = this.highlightCanvas as HTMLCanvasElement;
    const highlightCtx = this.highlightCtx as CanvasRenderingContext2D;
    if (highlightCanvas) {
      if (window.devicePixelRatio > 1) {
        highlightCanvas.width = Math.round(window.devicePixelRatio * width);
        highlightCanvas.height = Math.round(window.devicePixelRatio * height);
        highlightCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
      } else {
        highlightCanvas.width = width;
        highlightCanvas.height = height;
        highlightCtx.scale(1, 1);
      }
    }
  }


  handleHover(nodeIndex: number, tree: SummaryTree) : void {
    this.highlightCtx.clearRect(0, 0, this.width, this.height);
    if (nodeIndex === UNSET) {
      this.highlightCanvas.classList.remove("highlighting");
    } else {
      this.highlightCanvas.classList.add("highlighting");
      if (this.tree) {
        const ctx = this.highlightCtx;
        const nodeX = this.getZoomX(tree.getTimeOf(nodeIndex));
        const nodeY = this.getZoomY(nodeIndex);
        ctx.beginPath();
        ctx.fillStyle = "#094e77";
        ctx.moveTo(nodeX + HIGHLIGHT_RADIUS, nodeY);
        ctx.arc(nodeX, nodeY, HIGHLIGHT_RADIUS, 0, TAU);
        this.highlightCtx.fill();
      }
    }
  }
}
