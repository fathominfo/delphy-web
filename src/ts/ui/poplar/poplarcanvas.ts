import { HCV, Lab } from "../../util/lab";
import { resizeCanvas, UNSET, DASH_LENGTH, DASH_SPACING, DASH_WEIGHT,
  TREE_DATELINE_COLOR, TREE_DATELINE_COLOR_2, TREE_TEXT_COLOR, TREE_TEXT_COLOR_2,
  TREE_TEXT_FONT, TREE_TEXT_FONT_2, TREE_TEXT_LINE_SPACING, TREE_TEXT_TOP
} from "../common";
import { DateLabel } from "../datelabel";
import { PoplarChart, SelectNodeCallback } from "./poplarcommon";
import { PoplarData, topNodeSources } from "./poplardata";


const PADDING = {
  top: 45,
  bottom: 10,
  left: 20,
  right: 25
};

// const COLORS = [
//   "rgb(145,205,255)",
//   "rgb(119,148,158)",
//   "rgb(0,156,189)",
//   "rgb(0,235,251)",
//   "rgb(111,186,240)",
//   "rgb(65,255,255)",
//   "rgb(52,219,193)",
//   "rgb(83,192,240)"
// ];


/* colors are in HCV */
const CORE_COLORS = [
  [8, 0.33070866141732286, 0.48],
  [19, 0.07874015748031496, 0.21],
  [27, 0.3307086614173228, 0.48],
  [4, 0.14173228346456693, 0.7],
  [59, 0.14173228346456693, 0.4],
  [62, 0.6535433070866141, 0.67],
  [29, 0.16535433070866143, 0.32],
  [33, 0.3543307086614173, 0.58],
  [4, 0.31496062992125984, 0.79],
  [4, 0.5826771653543307, 0.62],
  [28, 0.2755905511811024, 0.24],
  [32, -0, 0.38]
];


const BRANCH_COLOR = "#00000099";
const BRANCH_COLOR_DARK = "#000";
const BRANCH_COLOR_LIGHT = "#999";
const BRANCH_WEIGHT = 0.5;
// const BRANCH_WEIGHT_LIGHT = 0.25;


type ColorInputs = [nodeIndex: number, parentColor: HCV, isLeft: boolean, isRootLeft: boolean];

export class PoplarCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  popData: PoplarData;
  width: number = UNSET;
  height: number = UNSET;
  canvasWidth: number = UNSET;
  canvasHeight: number = UNSET;
  xSpan: number = UNSET;
  ySpan: number = UNSET;
  /* sparse array of colors */
  branchColors: NodeColor[] = [];
  selectedNode: number = UNSET;
  paddingRight: number = PADDING.right;
  paddingLeft: number = PADDING.left;

  treeBuffer: HTMLCanvasElement;
  areaBuffer: HTMLCanvasElement;
  treeBufferCtx: CanvasRenderingContext2D;
  areaBufferCtx: CanvasRenderingContext2D;


  constructor(canvas: HTMLCanvasElement,
    popData: PoplarData,
    nodeSelectCallback: SelectNodeCallback
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.popData = popData;
    this.treeBuffer = document.createElement("canvas") as HTMLCanvasElement;
    this.treeBufferCtx = this.treeBuffer.getContext("2d") as CanvasRenderingContext2D;
    this.areaBuffer = document.createElement("canvas") as HTMLCanvasElement;
    this.areaBufferCtx = this.areaBuffer.getContext("2d") as CanvasRenderingContext2D;
    /*
    kind of a cheat, but maybe it will work? Find the horizontal
    location of the mouse, and for that vertical slice, find the
    closest branch.
    */
    const getClosestNode = (event: MouseEvent) => {
      const { paddingLeft,  xSpan, ySpan } = this;
      const { binCount, branchIndices, drawOrder } = this.popData;
      let bindex = (event.offsetX - paddingLeft) / xSpan * (binCount - 1);
      const yScaled = (event.offsetY - PADDING.top) / ySpan;
      bindex = Math.max(0, Math.min(binCount - 1, Math.round(bindex)));
      let closest = UNSET;
      let nodeIndex: number;
      let top: number;
      let bottom: number;
      /*
      going through the node areas from the root down
      find the nodes with this point in their area.
      we want the smallest one that has its area drawn.
      */
      // console.debug(`\n        find closest `);
      for (let i = 0; i < drawOrder.length; i++) {
        nodeIndex = drawOrder[i];
        if (branchIndices.includes(nodeIndex)) {
          top = this.popData.getPoplarCoordTop(nodeIndex,bindex);
          bottom = this.popData.getPoplarCoordBottom(nodeIndex,bindex);
          if (yScaled >= top && yScaled < bottom) {
            // console.log(i, nodeIndex, top, bottom, branchIndices.includes(nodeIndex));
            closest = nodeIndex;
          }
        }
      }
      return closest;
    };
    canvas.addEventListener("pointermove", (event: MouseEvent) => {
      const closest = getClosestNode(event);
      if (closest !== this.selectedNode) {
        nodeSelectCallback(closest, PoplarChart.poplarTree);
      }
    });
    canvas.addEventListener("pointerleave", () => {
      if (this.selectedNode !== UNSET) {
        nodeSelectCallback(UNSET, PoplarChart.poplarTree);
      }
    });
  }

  resetColors() {
    this.branchColors.length = 0;
    const { minDate, maxDate, minDateAcrossTrees, maxDateAcrossTrees } = this.popData;
    /* how does the data for this tree scale across all trees */
    const totalDateRange = maxDateAcrossTrees - minDateAcrossTrees;
    if (totalDateRange === 0) return;
    const totalXSpan = this.width - PADDING.left - PADDING.right;
    const startPct = (minDate - minDateAcrossTrees) / totalDateRange;
    const endPct = (maxDate - minDateAcrossTrees) / totalDateRange;
    this.setColors();
    this.paddingLeft = PADDING.left + startPct * totalXSpan;
    this.paddingRight = this.width - (PADDING.left + endPct * totalXSpan);
    this.xSpan = this.width - this.paddingLeft - this.paddingRight;
    this.treeBufferCtx.clearRect(0, 0, this.width, this.height);
    this.areaBufferCtx.clearRect(0, 0, this.width, this.height);
    this.drawTree(this.treeBufferCtx, BRANCH_WEIGHT);
    this.drawAreas(this.areaBufferCtx);
  }

  setColors() {
    // const { drawOrder, branchIndices, fileHash, baseTree } = this.popData;
    // const { fileHash, baseTree, topNodes } = this.popData;
    const { baseTree, topNodes, mutCounts } = this.popData;
    if (!baseTree) return;
    const { branchColors } = this;
    // const hashChars = fileHash.toString(16);
    // let hue = parseInt(hashChars.substring(1, 3), 16);
    // let chroma = parseInt(hashChars.substring(3, 5), 16);
    // let value = parseInt(hashChars.substring(5, 7), 16);
    // hue = Math.floor(hue / 255.0 * rangeHue);
    // chroma = chroma / 255.0 * rangeChr;
    // value = value / 255.0 * rangeVal;
    const hcvs: HCV[] = [];
    const stack: ColorInputs[] = [];
    const rootColor = new HCV(0, 0, 1);
    const rootIndex = baseTree.getRootIndex();
    let leftIndex = baseTree.getLeftChildIndexOf(rootIndex);
    const rightIndex = baseTree.getRightChildIndexOf(rootIndex);
    /*
    force the first two nodes in the tree to have specific colors
    */
    if (!topNodes.includes(rightIndex)) {
      topNodes.unshift(rightIndex);
    }
    if (!topNodes.includes(leftIndex)) {
      topNodes.unshift(leftIndex);
    }
    console.debug(`
      setColors: ${topNodes.length} nodes, choosing from ${CORE_COLORS.length} colors
      ${topNodes.join()}
    `);
    hcvs[rootIndex] = getColor(rootColor, true, true, false);
    stack.push([leftIndex, rootColor, true, true]);
    stack.push([rightIndex, rootColor, false, false]);
    let info: ColorInputs;
    let nodeIndex: number;
    let parentColor: HCV;
    let isLeft: boolean;
    let isRootLeft: boolean;
    let hasMutations: boolean;
    let hcv: HCV;
    let colordex = 0;
    while (stack.length > 0) {
      info = stack.shift() as ColorInputs;
      nodeIndex = info[0];
      parentColor = info[1];
      isLeft = info[2];
      isRootLeft = info[3];
      leftIndex = baseTree.getLeftChildIndexOf(nodeIndex);
      hasMutations = mutCounts[nodeIndex] > 0;
      if (topNodes.includes(nodeIndex) && colordex < CORE_COLORS.length) {
        const [h, c, v] = CORE_COLORS[colordex++];
        hcv = new HCV(h, c, v);
      } else {
        hcv = getColor(parentColor, isLeft, hasMutations, isRootLeft);
      }
      hcvs[nodeIndex] = hcv;
      if (leftIndex !== UNSET) {
        stack.push([leftIndex, hcv, true, isRootLeft]);
        stack.push([baseTree.getRightChildIndexOf(nodeIndex), hcv, false, isRootLeft]);
      }
    }


    for (let i = 0; i< hcvs.length; i++) {
      branchColors[i] = new NodeColor(hcvs[i]);
    }


    // let colorIndex = 0;
    // let nodeIndex: number;
    // for (let i = 0; i < drawOrder.length; i++) {
    //   nodeIndex = drawOrder[i];
    //   if (branchIndices.includes(nodeIndex) && branchColors[nodeIndex] === undefined) {
    //     branchColors[nodeIndex] = COLORS[colorIndex];
    //     colorIndex++;
    //     colorIndex %= COLORS.length;
    //   }
    // }
  }

  getNodeFill(nodeIndex: number): string {
    let c = this.branchColors[nodeIndex];
    if (!c) {
      this.setColors();
      c = this.branchColors[nodeIndex];
    }
    return c.fill;
  }

  getNodeStroke(nodeIndex: number): string {
    let c = this.branchColors[nodeIndex];
    if (!c) {
      this.setColors();
      c = this.branchColors[nodeIndex];
    }
    return c.stroke;
  }

  setSelectedNode(nodeIndex: number, src: PoplarChart) {
    this.selectedNode = nodeIndex;
    switch (src) {
    case PoplarChart.baseTree:
      requestAnimationFrame(() => this.drawHighlightTree());
      break;
    case PoplarChart.poplarTree:
      requestAnimationFrame(() => this.drawHighlightArea());
      break;
    }
  }


  sizeCanvas() {
    const { width, height } = resizeCanvas(this.canvas);
    this.width = width;
    this.height = height;
    this.xSpan = this.width - this.paddingLeft - this.paddingRight;
    this.ySpan = this.height - PADDING.top - PADDING.bottom;
    this.ctx.lineWidth = BRANCH_WEIGHT;
    this.canvasWidth = width;
    this.canvasHeight = height;
    let canvasScale = 1;

    if (window.devicePixelRatio > 1) {
      this.canvasWidth *= window.devicePixelRatio;
      this.canvasHeight *= window.devicePixelRatio;
      canvasScale *= window.devicePixelRatio;
    }
    this.treeBuffer.width = this.canvasWidth;
    this.treeBuffer.height = this.canvasHeight;
    this.treeBufferCtx.scale(canvasScale, canvasScale);
    this.treeBufferCtx.lineWidth = BRANCH_WEIGHT;
    this.areaBuffer.width = this.canvasWidth;
    this.areaBuffer.height = this.canvasHeight;
    this.areaBufferCtx.scale(canvasScale, canvasScale);
    this.areaBufferCtx.lineWidth = BRANCH_WEIGHT;
    this.drawTree(this.treeBufferCtx, BRANCH_WEIGHT);
    this.drawAreas(this.areaBufferCtx);
  }

  draw() {
    const { ctx, popData, width, height } = this;
    if (!popData.baseTree) return;
    ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(this.areaBuffer, 0, 0, width, height);
    this.ctx.drawImage(this.treeBuffer, 0, 0, width, height);
    this.drawDates();
    // this.drawPopulationCurve(this.ctx);
  }

  animate() {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);
    this.drawAreas(ctx);
    this.drawTree(ctx, BRANCH_WEIGHT);
    this.drawDates();
  }

  drawAreas(ctx: CanvasRenderingContext2D) {
    const { drawOrder, branchIndices, baseTree } = this.popData;
    if (!baseTree) return;
    let nodeIndex: number;
    for (let i = 0; i < drawOrder.length; i++) {
      nodeIndex = drawOrder[i];
      if (branchIndices.includes(nodeIndex)) {
        ctx.fillStyle = this.getNodeFill(nodeIndex);
        ctx.beginPath();
        this.drawNodeArea(ctx, nodeIndex);
        ctx.fill();
      }
    }
  }

  /* render the tree branches */
  drawTree_monochrome(ctx: CanvasRenderingContext2D, color: string, weight: number) {
    const popData = this.popData;
    const { drawOrder, baseTree } = popData;
    if (!baseTree) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.beginPath();
    let nodeIndex: number;
    let parentIndex: number;
    let currentNodePos: number[];
    let parentNodePos: number[];
    for (let i = 0; i < drawOrder.length; i++) {
      nodeIndex = drawOrder[i];
      parentIndex = baseTree.getParentIndexOf(nodeIndex);
      currentNodePos = popData.getNodePos(nodeIndex);
      parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : popData.getNodePos(parentIndex);
      this.drawNodeBranch(ctx, nodeIndex, currentNodePos, parentNodePos);
    }
    ctx.stroke();
  }


  /* render the tree branches */
  drawTree(ctx: CanvasRenderingContext2D, weight: number) {
    const popData = this.popData;
    const { baseTree, branchIndices, branchDescendants } = popData;
    if (!baseTree) return;
    /*
    for each of the branch indices, color until you reach another branch index
    */
    ctx.lineWidth = weight;
    let nodeIndex: number;
    let color: string;
    let parentIndex: number;
    let currentNodePos: number[];
    let parentNodePos: number[];
    let descendants: number[];
    for (let p = 0; p < branchIndices.length; p++) {
      nodeIndex = branchIndices[p];
      descendants = branchDescendants[p];
      color = this.getNodeStroke(nodeIndex);
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let d=0; d < descendants.length; d++) {
        nodeIndex = descendants[d];
        parentIndex = baseTree.getParentIndexOf(nodeIndex);
        currentNodePos = popData.getNodePos(nodeIndex);
        parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : popData.getNodePos(parentIndex);
        this.drawNodeBranch(ctx, nodeIndex, currentNodePos, parentNodePos);
      }
      ctx.stroke();
    }
  }



  drawDates() {
    const { ctx } = this;
    const { dateLabels, minDateAcrossTrees, maxDateAcrossTrees } = this.popData;
    /* date labels are scaled to time, not to the current bins */
    const xSpan = this.width - PADDING.left - PADDING.right;
    const y1 = TREE_TEXT_TOP;
    const y2 = y1 + TREE_TEXT_LINE_SPACING;
    const bottom = this.height - PADDING.bottom;
    const lineTop = y1 + TREE_TEXT_LINE_SPACING * 2 + DASH_LENGTH - 1;
    ctx.lineWidth = DASH_WEIGHT;
    ctx.font = TREE_TEXT_FONT_2;
    ctx.fillStyle = TREE_TEXT_COLOR_2;
    ctx.textAlign = "center";
    ctx.strokeStyle = TREE_DATELINE_COLOR_2;
    let first = true;
    let dl: DateLabel;
    let x: number;
    let y: number;
    for (let i = 0; i < dateLabels.length; i++) {
      dl = dateLabels[i];
      x = PADDING.left + (dl.index - minDateAcrossTrees) / (maxDateAcrossTrees - minDateAcrossTrees) * xSpan;
      if (dl.index === maxDateAcrossTrees || dl.index < maxDateAcrossTrees - 30) {
        ctx.fillText(dl.label1, x, y1);
        ctx.fillText(dl.label2, x, y2);
      }
      y = lineTop;
      this.ctx.beginPath();
      while (y < bottom) {
        this.ctx.moveTo(x, y);
        y += DASH_LENGTH;
        this.ctx.lineTo(x, y);
        y += DASH_SPACING;
      }
      this.ctx.stroke();
      if (first) {
        first = false;
        this.ctx.strokeStyle = TREE_DATELINE_COLOR;
        ctx.font = TREE_TEXT_FONT;
        ctx.fillStyle = TREE_TEXT_COLOR;
      }
    }
  }

  drawPopulationCurve(ctx: CanvasRenderingContext2D) {
    const { xSpan, ySpan, popData, paddingLeft } = this;
    const pop = popData.populationScale;
    const last = pop.length - 1;
    const cy = PADDING.top + ySpan * 0.5;
    const getY = (y: number, direction: number) => {
      return cy + direction * y * 0.5 * ySpan;
    };

    let i = 0;
    let x: number = paddingLeft;
    let y: number = getY(pop[0], -1)
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (i = 1; i < pop.length; i++) {
      x = paddingLeft + i / last * xSpan;
      y = getY(pop[i], -1);
      ctx.lineTo(x, y);
    }
    for (i = pop.length -1; i >=0; i--) {
      x = paddingLeft + i / last * xSpan;
      y = getY(pop[i], 1);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "black";
    ctx.stroke();
  }





  drawNodeBranch(ctx: CanvasRenderingContext2D,
    nodeIndex: number,
    currentNodePos: number[],
    parentNodePos: number[]
  ) {
    const { xSpan, ySpan, popData, paddingLeft} = this;
    const binCount = popData.binCount;
    const lastIndex = binCount - 1;
    let i = 0;
    let x: number;
    let y: number;
    const [nodeX, nodeY] = currentNodePos;
    const [parentX, parentY] = parentNodePos;
    if (parentX === UNSET) {
      x = paddingLeft;
      y = PADDING.top + ySpan * 0.5;
    } else {
      x = paddingLeft + parentX / lastIndex * xSpan;
      y = PADDING.top + parentY * ySpan;
    }
    ctx.moveTo(x, y);
    const nodeXrender = paddingLeft + nodeX / lastIndex * xSpan;
    const nodeYrender = PADDING.top + nodeY * ySpan;
    let center: number;
    let splitTop: number;
    for (i = 0; i < binCount; i++) {
      center = popData.getPoplarCoordCenter(nodeIndex, i);
      splitTop = popData.getPoplarCoordSplitTop(nodeIndex, i);
      if (center !== UNSET && splitTop === UNSET) {
        x = paddingLeft + i / lastIndex * xSpan;
        y = PADDING.top + center * ySpan;
        if (x < nodeXrender) ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(nodeXrender, nodeYrender);
  }

  drawNodeArea(ctx: CanvasRenderingContext2D,
    nodeIndex: number,
    includeDecendants = true
  ) {
    const { xSpan, ySpan, popData, paddingLeft } = this;
    const binCount = popData.binCount;
    const lastIndex = binCount - 1;
    const paddingTop = PADDING.top;
    let i = 0;
    let drawing = false;
    let x: number;
    let y: number;
    // let firstDrawn = UNSET;
    let bottom: number;
    /* draw along the bottom, from right to left */
    for (i = lastIndex; i >= 0; i--) {
      bottom = popData.getPoplarCoordBottom(nodeIndex, i);
      if (bottom !== UNSET) {
        x = paddingLeft + i / (lastIndex) * xSpan;
        y = paddingTop + bottom * ySpan;
        if (!drawing) {
          ctx.moveTo(x, y);
          drawing = true;
        } else {
          ctx.lineTo(x, y);
        }
        // firstDrawn = i;
      }
    }

    let firstSplit = UNSET;
    let lastDrawn = UNSET;
    let top: number;
    let splitTop: number;
    /* draw along the top, left to right */
    for (i = 0; i < binCount; i++) {
      top = popData.getPoplarCoordTop(nodeIndex, i);
      if (top !== UNSET) {
        x = paddingLeft + i / (lastIndex) * xSpan;
        y = paddingTop + top * ySpan;
        ctx.lineTo(x, y);
        // ctx.ellipse(x, y, 4, 4, Math.PI / 4, 0, 2 * Math.PI);
        lastDrawn = i;
        splitTop = popData.getPoplarCoordSplitTop(nodeIndex, i);
        if (splitTop !== UNSET && firstSplit === UNSET) {
          firstSplit = i;
        }
      }
    }
    if (firstSplit !== UNSET && !includeDecendants) {
      /* draw along the top of the split, right to left */
      for (i = lastDrawn; i >= firstSplit; i--) {
        splitTop = popData.getPoplarCoordSplitTop(nodeIndex, i);
        if (splitTop !== UNSET) {
          x = paddingLeft + i / lastIndex * xSpan;
          y = paddingTop + splitTop * ySpan;
          ctx.lineTo(x, y);
        }
      }
      let splitBottom: number;
      /* draw along the bottom of the split, left to right */
      for (; i <= lastDrawn; i++) {
        splitBottom = popData.getPoplarCoordSplitBottom(nodeIndex, i);
        if (splitBottom !== UNSET) {
          x = paddingLeft + i / lastIndex * xSpan;
          y = paddingTop + splitBottom * ySpan;
          ctx.lineTo(x, y);
        }
      }
    }
  }

  drawHighlightTree() {
    const { ctx, selectedNode, width, height, popData } = this;
    const { baseTree } = popData;
    if (!baseTree) return;
    ctx.clearRect(0, 0, width, height);
    if (selectedNode === UNSET) {
      this.draw();
    } else {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.treeBuffer, 0, 0, width, height);
      ctx.fillStyle = this.getNodeFill(selectedNode);
      /* draw the descendants of the node with transparency */
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      this.drawNodeArea(ctx, selectedNode, true);
      ctx.fill();
      /*
      draw a border around this area the same color as the fill
      but full opacity
      */
      ctx.globalAlpha = 1;
      ctx.strokeStyle = this.getNodeFill(selectedNode);
      ctx.stroke();
      /* draw the single node area (no descendants) at full opacity */
      ctx.beginPath();
      this.drawNodeArea(ctx, selectedNode, false);
      ctx.fill();
      ctx.stroke();
      /* draw the branch of the current node  */
      // ctx.strokeStyle = BRANCH_COLOR;
      ctx.strokeStyle = this.getNodeStroke(selectedNode);
      ctx.beginPath();
      const parentIndex = baseTree.getParentIndexOf(selectedNode);
      const currentNodePos = popData.getNodePos(selectedNode);
      const parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : popData.getNodePos(parentIndex);
      this.drawNodeBranch(ctx, selectedNode, currentNodePos, parentNodePos);
      ctx.stroke();
      this.drawDates();
      this.reportSelected(selectedNode);
      // this.drawPopulationCurve(this.ctx);
    }
  }

  drawHighlightArea() {
    const { ctx, selectedNode, width, height, popData } = this;
    const { baseTree, branchIndices, branchDescendants } = popData;
    if (!baseTree) return;
    ctx.clearRect(0, 0, width, height);
    if (selectedNode === UNSET) {
      this.draw();
    } else {
      // /*
      // draw tree branches from root to tips,
      // but stop at the selected node (which will also
      // exclude all its descendants)
      // */
      // const stack: [number, number][] = [[baseTree.getRootIndex(), -1]];
      // let pair: [number, number];
      // let nodeIndex: number;
      // let parentIndex: number;
      // let currentNodePos: number[];
      // let parentNodePos: number[];
      // let left: number;
      // ctx.strokeStyle = BRANCH_COLOR;
      // ctx.lineWidth = BRANCH_WEIGHT;
      // ctx.globalAlpha = 0.1;
      // ctx.beginPath();
      // while (stack.length > 0) {
      //   pair = stack.shift() as [number, number];
      //   nodeIndex = pair[0];
      //   if (nodeIndex !== selectedNode) {
      //     parentIndex = pair[1];
      //     currentNodePos = popData.getNodePos(nodeIndex);
      //     parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : popData.getNodePos(parentIndex);
      //     this.drawNodeBranch(ctx, nodeIndex, currentNodePos, parentNodePos);
      //     left = baseTree.getLeftChildIndexOf(nodeIndex);
      //     if (left !== UNSET) {
      //       stack.push([left, nodeIndex]);
      //       stack.push([baseTree.getRightChildIndexOf(nodeIndex), nodeIndex]);
      //     }
      //   }
      // }
      // ctx.stroke();
      /*
      draw the fill areas of the whole tree
      transparently over that
      */
      ctx.globalAlpha = 0.15;
      ctx.drawImage(this.areaBuffer, 0, 0, width, height);
      ctx.drawImage(this.treeBuffer, 0, 0, width, height);
      /*
      set the color to a transparent version of the
      fill for the selected node, and draw that over the
      node's descendants
      */
      ctx.fillStyle = this.getNodeFill(selectedNode);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      this.drawNodeArea(ctx, selectedNode, true);
      ctx.fill();
      ctx.strokeStyle = this.getNodeFill(selectedNode);
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      /* draw the tree for the descendants of the selected node */
      ctx.strokeStyle = this.getNodeStroke(selectedNode);
      ctx.lineWidth = BRANCH_WEIGHT;
      let nodeIndex: number;
      let parentIndex: number;
      let descendants: number[];
      let currentNodePos: number[];
      let parentNodePos: number[];

      if (branchIndices.includes(selectedNode)) {
        descendants = branchDescendants[branchIndices.indexOf(selectedNode)];
        ctx.beginPath();
        for (let d = 0; d < descendants.length; d++) {
          nodeIndex = descendants[d];
          parentIndex = baseTree.getParentIndexOf(nodeIndex);
          currentNodePos = popData.getNodePos(nodeIndex);
          parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : popData.getNodePos(parentIndex);
          this.drawNodeBranch(ctx, nodeIndex, currentNodePos, parentNodePos);
        }
        ctx.stroke();
      } else {
        console.warn("you thought `drawHighlightArea` could only be called for branchIndices, but you were wrong");
        let left = baseTree.getLeftChildIndexOf(selectedNode);
        if (left !== UNSET) {
          const stack: [number, number][] = [];
          stack.push([left, selectedNode]);
          stack.push([baseTree.getRightChildIndexOf(selectedNode), selectedNode]);
          let nodeIndex: number;
          let pair: [number, number];
          ctx.beginPath();
          while (stack.length > 0) {
            pair = stack.shift() as [number, number];
            nodeIndex = pair[0];
            parentIndex = pair[1];
            currentNodePos = popData.getNodePos(nodeIndex);
            parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : popData.getNodePos(parentIndex);
            this.drawNodeBranch(ctx, nodeIndex, currentNodePos, parentNodePos);
            left = baseTree.getLeftChildIndexOf(nodeIndex);
            if (left !== UNSET) {
              stack.push([left, nodeIndex]);
              stack.push([baseTree.getRightChildIndexOf(nodeIndex), nodeIndex]);
            }
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      /* draw the fill for the selected node, with the border as the fill color */
      ctx.beginPath();
      ctx.strokeStyle = this.getNodeFill(selectedNode);
      this.drawNodeArea(ctx, selectedNode, false);
      ctx.fill();
      ctx.stroke();
      /* draw the tree for the selected node */
      ctx.strokeStyle = this.getNodeStroke(selectedNode);
      ctx.beginPath();
      parentIndex = baseTree.getParentIndexOf(selectedNode);
      currentNodePos = popData.getNodePos(selectedNode);
      parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : popData.getNodePos(parentIndex);
      this.drawNodeBranch(ctx, selectedNode, currentNodePos, parentNodePos);
      ctx.stroke();
      this.drawDates();
      // this.drawPopulationCurve(this.ctx);
      this.reportSelected(selectedNode);
    }
  }

  reportSelected(selectedNode: number) {
    const ctx = this.ctx;
    const [areaPct, peakPct, exclusivePeakPct, areaScaled, peakScaled, peakScaledAllotted,
      areaScaledAllotted, areaAllottedMutsOnly, nodeSource, column, nodeY] = this.popData.getReadoutData(selectedNode);
    ctx.fillStyle = 'black';
    ctx.textAlign = 'left';
    const y = TREE_TEXT_TOP + TREE_TEXT_LINE_SPACING * 3;
    ctx.fillText(`nodeIndex: ${selectedNode}`, 20, y);
    ctx.fillText(`total area${nodeSource === topNodeSources.AREA ? '*' : ''}: ${(areaPct * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`, 20, y+20);
    ctx.fillText(`area scaled${nodeSource === topNodeSources.AREA_SCALED ? '*' : ''}: ${(areaScaled * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`, 20, y + 40);
    ctx.fillText(`area scaled (exclusive)${nodeSource === topNodeSources.AREA_SCALED_ALLOTED ? '*' : ''}: ${(areaScaledAllotted * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`, 20, y + 60);
    ctx.fillText(`area allotted (muts only)${nodeSource === topNodeSources.AREA_SCALED_ALLOTED_MUTS_ONLY ? '*' : ''}: ${(areaAllottedMutsOnly * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`, 20, y + 80);
    ctx.fillText(`peak${nodeSource === topNodeSources.PEAK ? '*' : ''}: ${(peakPct * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`, 20, y + 100);
    ctx.fillText(`peak (exclusive)${nodeSource === topNodeSources.ALLOTTED ? '*' : ''}: ${(exclusivePeakPct * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`, 20, y + 120);
    ctx.fillText(`peak scaled${nodeSource === topNodeSources.POP_SCALED ? '*' : ''}: ${(peakScaled * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`, 20, y + 140);
    ctx.fillText(`peak scaled (exclusive)${nodeSource === topNodeSources.POP_SCALED_ALLOTTED ? '*' : ''}: ${(peakScaledAllotted * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`, 20, y + 160);
    ctx.fillText(`node position: ${column}, ${nodeY}%`, 20, y + 180);
  }


  startPopScaleAnimation() {
    console.log("start animation");
    const animationInterval = setInterval(()=>{
      this.popData.updateAnimation();
      requestAnimationFrame(()=>this.animate());
      if (this.popData.animationComplete()) {
        clearInterval(animationInterval);
        /* set up buffers for highlights */
        const { areaBufferCtx, treeBufferCtx, width, height } = this;
        areaBufferCtx.clearRect(0, 0, width, height);
        treeBufferCtx.clearRect(0, 0, width, height);
        this.drawTree(treeBufferCtx, BRANCH_WEIGHT);
        this.drawAreas(areaBufferCtx);
      }
    }, 30);
  }


}




const minHue = 0;
const minChr = 0.2;
const minVal = 0.2;

const rangeHue = 64;
const rangeChr = 0.4;
const rangeVal = 0.8;

const stepHue = 1;
const stepChr = 0.1;
const stepVal = 0.2;


const getColor = (parentColor: HCV, isLeft: boolean, hasMutations: boolean, isRootLeft: boolean) : HCV =>{
  let { hue, chroma, value } = parentColor;
  // if (!hasMutations) {
  //   return new HCV(hue, chroma, value);
  // }
  let moveHue, moveChr, moveVal;
  hue -= minHue;
  chroma -= minChr;
  value -= minVal;

  moveHue = stepHue * 2;
  moveChr = stepChr * (isLeft ? 2 : 1);
  moveVal = stepVal * (isLeft ? 1 : 2);
  if (!hasMutations) {
    moveHue *= 0.5;
    moveChr *= 0.5;
    moveVal *= 0.5;
  }

  if (isRootLeft) { moveHue *= -1; }
  if (moveChr > rangeChr * 0.5) { moveChr *= -1; }
  if (moveVal > rangeVal * 0.5) { moveVal *= -1; }

  hue = minHue + ((hue + moveHue) % rangeHue);
  chroma = minChr + ((chroma + moveChr) % rangeChr);
  value = minVal + ((value + moveVal) % rangeVal);
  return new HCV(hue, chroma, value);
};



class NodeColor {
  hcv: HCV;
  lab: Lab;
  fill = '';
  stroke = '';

  constructor(hcv: HCV) {
    this.hcv = hcv;
    this.lab = new Lab(1, 0, 0);
    this.lab.setFromHCV(hcv.hue, hcv.chroma, hcv.value);
    this.fill = this.lab.toRgb();
    const strokeLab = this.lab.copy();
    if (Math.max(Math.abs(strokeLab.ay), Math.abs(strokeLab.be)) >= 64) {
      strokeLab.adjustChroma(0.5);
    }
    strokeLab.adjustChroma(2).mirrorMoveValue(20);
    this.stroke = strokeLab.toRgb();
  }



}