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
  allottedArea: number[][] = [];
  numBins: number = UNSET;
  treePoplarCoords: PoplarCoord[][] = [];
  drawOrder: number[] = [];
  nodePos: number[][] = [];
  branchIndices: number[] = [];
  threshold: number = DEFAULT_PREVALENCE;

  setPythia(pythia: Pythia) {
    this.pythia = pythia;
  }


  setSelectedTree(treeIndex: number, resolution: number, nodeYs: number[]) {
    if (!this.pythia) return;
    // console.log(`setting selected tree... index: ${treeIndex}`)
    this.baseTreeNodeYs = nodeYs;
    /*
    treeIndex is taken from the MCC, but getPoplarPrevalenceData
    takes the absolute index (including burn-in)
    */
    const absoluteIndex = treeIndex + this.pythia.kneeIndex;
    const { minDate, maxDate, tree, branchPrevalence } = this.pythia.getPoplarPrevalenceData(absoluteIndex, resolution);
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.baseTree = tree;
    this.branchPrevalence = branchPrevalence;
    if (branchPrevalence[0].length > this.numBins) {
      this.numBins = branchPrevalence[0].length;
      this.initializeStorage();
    }
    this.prepareLayout();
    this.setNodePositions();
    this.findBranchesExceedPrevalenceThreshold();
  }

  initializeStorage() {
    const nodeCount = this.baseTreeNodeYs.length;
    const numBins = this.numBins;
    if (this.nodePos.length === 0) {
      this.nodePos = new Array(nodeCount);
      this.allottedArea = new Array(nodeCount);
      this.treePoplarCoords = new Array(nodeCount);
      for (let i = 0; i < nodeCount; i++) {
        this.nodePos[i] = [UNSET, UNSET];
        this.allottedArea[i] = new Array(numBins);
        this.treePoplarCoords[i] = new Array(numBins);
        for (let b = 0; b < numBins; b++) {
          this.treePoplarCoords[i][b] = {
            center: UNSET,
            top: UNSET,
            bottom: UNSET,
            splitTop: UNSET,
            splitBottom: UNSET,
            childTop: UNSET
          };
        }
      }
    } else {
      const currentBins = this.allottedArea[0].length;
      const newBins = numBins - currentBins;
      for (let i = 0; i < nodeCount; i++) {
        for (let b = 0; b < newBins; b++) {
          this.allottedArea[i].push(UNSET);
          this.treePoplarCoords[i].push({
            center: UNSET,
            top: UNSET,
            bottom: UNSET,
            splitTop: UNSET,
            splitBottom: UNSET,
            childTop: UNSET
          });
        }
      }
    }
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
    const { baseTree, treePoplarCoords, minDate, maxDate, numBins } = this;
    if (!baseTree) return;
    const lastBin = numBins - 1;
    treePoplarCoords.forEach((row, i) => {
      const nodeTime = baseTree.getTimeOf(i);
      const timePercent = (nodeTime - minDate) / (maxDate - minDate);
      const column = timePercent * lastBin;
      const column1 = Math.floor(column);
      const fraction = column - column1;
      const y1 = row[column1].center;
      const y2 = column1 === lastBin ? y1 : row[column1 + 1].center;
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
      this.nodePos[i][0] = column;
      this.nodePos[i][1] = nodeY;
    })
  }


  prepareLayout() {
    const { baseTree, branchPrevalence, baseTreeNodeYs, drawOrder, treePoplarCoords, numBins, allottedArea } = this;
    if (!baseTree) return;
    if (branchPrevalence.length === 0 || branchPrevalence[0].length === 0) return;
    /*
    how much area is allotted to each branch, minus
    the space allotted to its children?
    */
    const rootIndex = baseTree.getRootIndex();
    const nodeCount = branchPrevalence.length;
    for (let r = 0; r < nodeCount; r++) {
      const src = branchPrevalence[r];
      const row = allottedArea[r];
      for (let b = 0; b < numBins; b++) {
        row[b] = src[b];
      }
    }
    // const allottedArea = branchPrevalence.map(row => row.slice(0));
    drawOrder.length = 0;
    drawOrder.push(rootIndex);
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

    const rowCount = baseTreeNodeYs.length;
    const colCount = numBins;

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
          const parentCoords = treePoplarCoords[parent][c];
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
          treePoplarCoords[index][c].center = center;
          treePoplarCoords[index][c].top = top;
          treePoplarCoords[index][c].bottom = bottom;
          treePoplarCoords[index][c].splitTop = splitTop;
          treePoplarCoords[index][c].splitBottom = splitBottom;
          treePoplarCoords[index][c].childTop = childTop;
        } catch (err) {
          console.warn(`poplar[${index}][${c}]`, treePoplarCoords, err);
        }
      }
    }
  }
}