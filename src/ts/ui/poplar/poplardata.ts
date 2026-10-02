import { PhyloTree } from "../../pythia/delphy_api";
import { Pythia } from "../../pythia/pythia";
import { UNSET } from "../common";

const DEFAULT_PREVALENCE = 0.3;

export class PoplarData {
  pythia: Pythia | null = null;
  baseTree: PhyloTree | null = null;
  minDate: number = UNSET;
  maxDate: number = UNSET;
  branchPrevalence: number[][] = [];
  branchIndices: number[] = [];
  threshold: number = DEFAULT_PREVALENCE;

  setPythia(pythia: Pythia) {
    this.pythia = pythia;
  }


  setSelectedTree(treeIndex: number, resolution: number) {
    if (!this.pythia) return;
    /*
    treeIndex is taken from the MCC, but getPoplarPrevalenceData
    takes the absolute index (including burn-in)
    */
    const absoluteIndex = treeIndex + this.pythia.kneeIndex;
    resolution = 20;
    const { minDate, maxDate, tree, branchPrevalence } = this.pythia.getPoplarPrevalenceData(absoluteIndex, resolution);
    console.log(minDate, maxDate, tree, branchPrevalence);
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.branchPrevalence = branchPrevalence;
    this.baseTree = tree;
    this.findBranchesExceedPrevalenceThreshold();
  }


  findBranchesExceedPrevalenceThreshold() {
    this.branchIndices.length = 0;
    this.branchPrevalence.forEach((branchPrevalence: number[], index) => {
      if (Math.max(...branchPrevalence) >= this.threshold) {
        this.branchIndices.push(index);
      }
    });
    console.log("branch indexes above threshold: ",this.branchIndices, this.branchPrevalence);
  }


}