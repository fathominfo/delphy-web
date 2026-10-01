import { PhyloTree } from "../../pythia/delphy_api";
import { Pythia } from "../../pythia/pythia";

export class PoplarData {
  pythia: Pythia | null = null;
  baseTree: PhyloTree | null = null;


  constructor() {

  }


  setPythia(pythia: Pythia) {
    this.pythia = pythia;
  }


  setSelectedTree(treeIndex: number) {
    if (!this.pythia) return;
    /*
    treeIndex is taken from the MCC, but getPoplarPrevalenceData
    takes the absolute index (including burn-in)
    */
    const absoluteIndex = treeIndex + this.pythia.kneeIndex;
    const { minDate, maxDate, tree, branchPrevalence } = this.pythia.getPoplarPrevalenceData(absoluteIndex);
    console.log(minDate, maxDate, tree, branchPrevalence);


  }

}