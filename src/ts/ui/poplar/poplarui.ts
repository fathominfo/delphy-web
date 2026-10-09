import { PhyloTree } from "../../pythia/delphy_api";
import { SharedState } from "../../sharedstate";
import { getTimelineIndices, UNSET } from "../common";
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
  earliestRootDate = UNSET;

  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector);
    const treeSelectCallback: SelectCallback = (index: number)=>this.handleTreeSelect(index);
    const nodeSelectCallback: SelectCallback = (index: number) => this.handleNodeSelect(index);
    this.scrubber = new BaseTreeScrubber(treeSelectCallback);
    let canvas: HTMLCanvasElement = this.div.querySelector("#poplar--basetree-container canvas.poplar--main") as HTMLCanvasElement;
    this.baseTreeCanvas = new BaseTreeCanvas(canvas, nodeSelectCallback);
    canvas = this.div.querySelector("#poplar--container canvas.poplar--main") as HTMLCanvasElement;
    this.poplarData = new PoplarData();
    this.poplarCanvas = new PoplarCanvas(canvas, this.poplarData, nodeSelectCallback);


    const prevalenceThreshold = this.poplarData.threshold * 100;
    const prevInputLabel = this.div.querySelector("#poplar--minlinpct") as HTMLLabelElement;
    const prevInput = prevInputLabel.querySelector("input") as HTMLInputElement;
    prevInput.setAttribute("value", `${prevalenceThreshold}`);
    const prevReadout = prevInputLabel.querySelector(".poplar-value") as HTMLSpanElement;
    prevReadout.textContent = `${prevalenceThreshold}%`;
    prevInput.addEventListener("input", (event)=>{
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
    this.earliestRootDate = Number.MAX_VALUE;
    let tree: PhyloTree;
    let rootIndex: number;
    for (let i = 0; i < numBaseTrees; i++) {
      tree = mcc.getBaseTree(i);
      rootIndex = tree.getRootIndex();
      this.earliestRootDate = Math.min(this.earliestRootDate, tree.getTimeOf(rootIndex));
    }
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
    mccRef.release();
    this.baseTreeCanvas.positionTreeNodes(baseTree);
    /*
    get the y position of nodes in the tree so that the poplar
    canvas can follow it
    */
    const nodeYs = this.baseTreeCanvas.getNodeYs();
    const dateLabels: DateLabel[] = getTimelineIndices(this.earliestRootDate, this.pythia.maxDate);
    this.poplarData.setSelectedTree(index, this.poplarCanvas.xSpan, nodeYs, this.earliestRootDate, this.pythia.maxDate, dateLabels);
    this.poplarCanvas.resetColors();

    requestAnimationFrame(() => {
      if (this.pythia) {
        this.baseTreeCanvas.draw(this.earliestRootDate, this.pythia.maxDate, dateLabels);
        this.poplarCanvas.draw();
      }
    })
  }

  handleNodeSelect(nodeIndex: number) {
    this.poplarCanvas.setSelectedNode(nodeIndex);
    this.baseTreeCanvas.setSelectedNode(nodeIndex);
  }
}