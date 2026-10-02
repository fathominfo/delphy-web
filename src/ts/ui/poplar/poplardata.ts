import { PhyloTree } from "../../pythia/delphy_api";
import { Pythia } from "../../pythia/pythia";
import { UNSET } from "../common";

export class PoplarData {
  pythia: Pythia | null = null;
  baseTree: PhyloTree | null = null;
  minDate: number = UNSET;
  maxDate: number = UNSET;
  branchPrevalence: number[][] = [];

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
    const { minDate, maxDate, tree, branchPrevalence } = this.pythia.getPoplarPrevalenceData(absoluteIndex, resolution);
    console.log(minDate, maxDate, tree, branchPrevalence);
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.branchPrevalence = branchPrevalence;
    this.baseTree = tree;
  }



}