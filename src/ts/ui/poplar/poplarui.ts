import { SharedState } from "../../sharedstate";
import { DateLabel } from "../datelabel";
import { UIScreen } from "../uiscreen";
import { BaseTreeCanvas } from "./basetreecanvas";
import { BaseTreeScrubber } from "./basetreescrubber";
import { PoplarCanvas } from "./poplarcanvas";
import { SelectCallback } from "./poplarcommon";
import { PoplarData } from "./poplardata";

export class PoplarUI extends UIScreen {
  scrubber: BaseTreeScrubber;
  baseTreeCanvas: BaseTreeCanvas;
  poplarCanvas: PoplarCanvas;
  poplarData: PoplarData;
  selectedTree = 0;

  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector);
    const treeSelectCallback: SelectCallback = (index: number)=>this.handleTreeSelect(index);
    const nodeSelectCallback: SelectCallback = (index: number) => this.handleNodeSelect(index);
    this.scrubber = new BaseTreeScrubber(treeSelectCallback);
    let canvas: HTMLCanvasElement = this.div.querySelector("#poplar--basetree-container canvas.poplar--main") as HTMLCanvasElement;
    let highlightCanvas: HTMLCanvasElement = this.div.querySelector("#poplar--basetree-container canvas.poplar--highlight") as HTMLCanvasElement;
    this.baseTreeCanvas = new BaseTreeCanvas(canvas, highlightCanvas, nodeSelectCallback);
    canvas = this.div.querySelector("#poplar--container canvas.poplar--main") as HTMLCanvasElement;
    highlightCanvas = this.div.querySelector("#poplar--container canvas.poplar--highlight") as HTMLCanvasElement;
    this.poplarData = new PoplarData();
    this.poplarCanvas = new PoplarCanvas(canvas, highlightCanvas, this.poplarData, nodeSelectCallback);

    const prevInputLabel = this.div.querySelector("#poplar--minlinpct") as HTMLLabelElement;
    const prevInput = prevInputLabel.querySelector("input") as HTMLInputElement;
    const prevReadout = prevInputLabel.querySelector(".poplar-value") as HTMLSpanElement;
    prevInput.addEventListener("input", ()=>{
      const value = parseInt(prevInput.value);
      this.poplarData.setPrevalenceThreshold(value/100);
      requestAnimationFrame(()=>{
        prevReadout.textContent = `${value}%`;
        this.poplarCanvas.draw();
      });
    });

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
    /*
    get the y position of nodes in the tree so that the poplar
    canvas can follow it
    */
    const nodeYs = this.baseTreeCanvas.getNodeYs();
    this.poplarData.setSelectedTree(index, this.poplarCanvas.xSpan, nodeYs);
    const dateLabels: DateLabel[] = [];
    requestAnimationFrame(() => {
      if (this.pythia) {
        this.baseTreeCanvas.draw(minDate, this.pythia.maxDate, dateLabels);
        this.poplarCanvas.draw();
      }
    })
  }

  handleNodeSelect(nodeIndex: number) {
    this.poplarCanvas.setSelectedNode(nodeIndex);
    this.baseTreeCanvas.setSelectedNode(nodeIndex);
  }
}