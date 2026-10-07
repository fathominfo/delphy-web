import { PhyloTree } from "../../pythia/delphy_api";
import { Pythia } from "../../pythia/pythia";
import { UNSET } from "../common";

const DEFAULT_PREVALENCE = 0.1;


export type PoplarCoord = {
  center: number,        // vertical center of the branch
  top: number,           // top of the branch area
  bottom: number,        // bottom of the branch area
  splitTop: number,      // top of the lower branch area (if it is split)
  splitBottom: number,   // bottom of the lower branch area (if it is split)
  childTop: number,      // start y-position for the current child, used and updated during layout
};


export class PoplarData {
  pythia: Pythia | null = null;
  baseTree: PhyloTree | null = null;
  baseTreeNodeYs: number[] = [];
  minDate: number = UNSET;
  maxDate: number = UNSET;
  branchPrevalence: number[][] = [];
  branchIndices: number[] = [];
  threshold: number = DEFAULT_PREVALENCE;
  treePoplarCoords: PoplarCoord[][] = [];
  drawOrder: number[] = [];
  nodePos: number[][] = [];
  nodeCount: number = UNSET;
  binCount: number = UNSET;

  setPythia(pythia: Pythia) {
    this.pythia = pythia;
  }


  setSelectedTree(treeIndex: number, resolution: number, nodeYs: number[]) {
    if (!this.pythia) return;
    // console.log(`setting selected tree... index: ${treeIndex}`)
    this.baseTreeNodeYs = nodeYs;
    this.nodeCount = nodeYs.length;
    /*
    treeIndex is taken from the MCC, but getPoplarPrevalenceData
    takes the absolute index (including burn-in)
    */
    const absoluteIndex = treeIndex + this.pythia.kneeIndex;
    // resolution = 20;
    const { minDate, maxDate, tree, branchPrevalence } = this.pythia.getPoplarPrevalenceData(absoluteIndex, resolution);
    // console.log(minDate, maxDate, tree, branchPrevalence);
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.branchPrevalence = branchPrevalence;
    this.baseTree = tree;
    this.prepareLayout();
    this.setNodePositions();
    this.findBranchesExceedPrevalenceThreshold();
  }

  setPrevalenceThreshold(threshold: number) {
    this.threshold = threshold;
    this.findBranchesExceedPrevalenceThreshold();
  }

  findBranchesExceedPrevalenceThreshold() {
    if (!this.baseTree) return;
    const { branchPrevalence, threshold, branchIndices } = this;
    branchIndices.length = 0;
    const rootIndex = this.baseTree.getRootIndex();
    branchPrevalence.forEach((row, i) => {
      if (i === rootIndex) return;
      for (let j = 0; j < row.length; j++) {
        if (row[j] >= threshold) {
          branchIndices.push(i);
          break;
        }
      }
    })
  }

  setNodePositions() {
    const { baseTree, treePoplarCoords, minDate, maxDate } = this;
    if (!baseTree) return;
    const numBins = treePoplarCoords[0].length - 1;
    treePoplarCoords.forEach((row, i) => {
      const nodeTime = baseTree.getTimeOf(i);
      const timePercent = (nodeTime - minDate) / (maxDate - minDate);
      const column = timePercent * numBins;
      const column1 = Math.floor(column);
      const fraction = column - column1;

      const y1 = row[column1].center;
      const y2 = column1 === numBins ? y1 : row[column1 + 1].center;
      let nodeY = UNSET;

      if (y1 === UNSET) {
        nodeY = y2;
      } else {
        if (y2 === UNSET) {
          nodeY = y1;
        } else {
          nodeY = y1 + fraction * (y2 - y1);
        }
      }
      this.nodePos[i] = [column, nodeY];
    })
  }


  prepareLayout() {
    const { baseTree, branchPrevalence, baseTreeNodeYs } = this;
    if (!baseTree) return;
    if (branchPrevalence.length === 0 || branchPrevalence[0].length === 0) return;
    /*
    how much area is allotted to each branch, minus
    the space allotted to its children?
    */
    this.binCount = branchPrevalence[0].length;
    const rootIndex = baseTree.getRootIndex();
    const allottedArea = branchPrevalence.map(row => row.slice(0));
    const drawOrder = [rootIndex];
    let i = 0;
    while (i < drawOrder.length) {
      const index = drawOrder[i] as number;
      const row = allottedArea[index];
      const leftIndex = baseTree.getLeftChildIndexOf(index);
      if (leftIndex !== UNSET) {
        const rightIndex = baseTree.getRightChildIndexOf(index);
        const leftRow = allottedArea[leftIndex];
        const rightRow = allottedArea[rightIndex];
        for (let col = 0; col < row.length; col++) {
          row[col] -= leftRow[col] + rightRow[col];
        }
        if (baseTreeNodeYs[leftIndex] < baseTreeNodeYs[rightIndex]) {
          drawOrder.push(leftIndex);
          drawOrder.push(rightIndex);
        } else {
          drawOrder.push(rightIndex);
          drawOrder.push(leftIndex);
        }
      }
      i++;
    }
    // console.assert(nodeYs.length === drawOrder.length);
    // console.log(rootIndex);
    // console.log(allottedArea[rootIndex].join());
    // console.log(branchPrevalence[rootIndex].join());

    /*
    we could probably combine this with the first iteration,
    but gonna see what works before taking on that optimization
    */
    const rowCount = baseTreeNodeYs.length;
    const colCount = allottedArea[0].length;
    const poplarCoords: PoplarCoord[][] = new Array(rowCount);
    for (let i = 0; i < rowCount; i++) {
      poplarCoords[i] = [];
    }

    for (let c = 0; c < colCount; c++) {
      for (let i = 0; i < rowCount; i++) {
        const index = drawOrder[i];
        const parent = baseTree.getParentIndexOf(index);
        const total = branchPrevalence[index][c];
        const allotted = allottedArea[index][c];
        const isSplit = allotted < total;
        let center: number = UNSET;
        let top: number = UNSET;
        let bottom: number = UNSET;
        let splitTop: number = UNSET;
        let splitBottom: number = UNSET;
        let childTop: number = UNSET;
        if (parent === UNSET) { /* root */
          center = 0.5;
          top = 0;
          bottom = 1.0;
        } else if (total > 0) {
          const parentCoords = poplarCoords[parent][c];
          top = parentCoords.childTop;
          bottom = top + total;
          center = (top + bottom) / 2;
          parentCoords.childTop += total;
        }
        if (total > 0 && isSplit) {
          splitTop = top + allotted / 2;
          splitBottom = bottom - allotted / 2;
          childTop = splitTop;
        }
        try {
          poplarCoords[index][c] = { center, top, bottom, splitTop, splitBottom, childTop };
        } catch (err) {
          console.warn(`poplar[${index}][${c}]`, err);
        }
      }
    }
    this.treePoplarCoords = poplarCoords;
    this.drawOrder = drawOrder;
  }
}