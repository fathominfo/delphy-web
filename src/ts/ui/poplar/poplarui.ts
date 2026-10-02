import { Pythia } from "../../pythia/pythia";
import { SharedState } from "../../sharedstate";
import { UNSET } from "../common";
import { DateLabel } from "../datelabel";
import { TreeCanvas } from "../treecanvas";
import { UIScreen } from "../uiscreen";
import { BaseTreeScrubber } from "./basetreescrubber";
import { PoplarCanvas } from "./poplarcanvas";
import { SelectTreeCallback } from "./poplarcommon";
import { PoplarData } from "./poplardata";

export class PoplarUI extends UIScreen {
  scrubber: BaseTreeScrubber;
  baseTreeCanvas: TreeCanvas;
  poplarCanvas: PoplarCanvas;
  poplarData: PoplarData;
  selectedTree: number = UNSET;

  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector);
    const treeSelectCallback: SelectTreeCallback = (index: number)=>this.handleTreeSelect(index);
    this.scrubber = new BaseTreeScrubber(treeSelectCallback);
    let canvas: HTMLCanvasElement = this.div.querySelector("#poplar--basetree-container canvas") as HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.baseTreeCanvas = new TreeCanvas(canvas, ctx);
    canvas = this.div.querySelector("#poplar--container canvas") as HTMLCanvasElement;
    ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.poplarData = new PoplarData();
    this.poplarCanvas = new PoplarCanvas(canvas, ctx, this.poplarData);
    this.selectedTree = 0;
  }

  activate() {
    super.activate();
    if (!this.pythia) return;
    this.resize();
    const mccRef = this.pythia.getMcc();
    const mcc = mccRef.getMcc();
    const numBaseTrees = mcc.getNumBaseTrees();
    mccRef.release();
    this.scrubber.setData(numBaseTrees);
    this.poplarData.setPythia(this.pythia);
    this.handleTreeSelect(this.selectedTree);
  }


  resize() {
    this.baseTreeCanvas.sizeCanvas();
    this.poplarCanvas.sizeCanvas();
    this.handleTreeSelect(this.selectedTree);
  }


  handleTreeSelect(index: number) {
    if (!this.pythia) return;
    this.scrubber.setSelectedTree(index);
    const mccRef = this.pythia.getMcc();
    const mcc = mccRef.getMcc();
    const baseTree = mcc.getBaseTree(index);
    const minDate = mcc.getTimeOf(baseTree.getRootIndex());
    mccRef.release();
    this.baseTreeCanvas.positionTreeNodes(baseTree);
    this.poplarData.setSelectedTree(index, this.poplarCanvas.xSpan);
    const dateLabels: DateLabel[] = [];
    requestAnimationFrame(() => {
      if (this.pythia) {
        this.baseTreeCanvas.draw(minDate, this.pythia.maxDate, dateLabels);
        this.poplarCanvas.draw();
      }
    })
  }
}