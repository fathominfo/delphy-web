import { SharedState } from "../../sharedstate";
import { TreeCanvas } from "../treecanvas";
import { UIScreen } from "../uiscreen";
import { BaseTreeScrubber } from "./basetreescrubber";
import { PoplarCanvas } from "./poplarcanvas";
import { SelectTreeCallback } from "./poplarcommon";

export class PoplarUI extends UIScreen {
  scrubber: BaseTreeScrubber;
  baseTreeCanvas: TreeCanvas;
  poplarCanvas: PoplarCanvas;

  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector);
    const treeSelectCallback: SelectTreeCallback = (index: number)=>this.handleTreeSelect(index);
    this.scrubber = new BaseTreeScrubber(treeSelectCallback);
    let canvas: HTMLCanvasElement = this.div.querySelector("#poplar--basetree-container canvas") as HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.baseTreeCanvas = new TreeCanvas(canvas, ctx);
    canvas = this.div.querySelector("#poplar--container canvas") as HTMLCanvasElement;
    ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.poplarCanvas = new PoplarCanvas(canvas, ctx);

    this.scrubber.setData(100);

  }

  handleTreeSelect(index: number) {
    this.scrubber.setSelectedTree(index);
  }

}