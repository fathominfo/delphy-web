import { resizeCanvas, UNSET, DASH_LENGTH, DASH_SPACING, DASH_WEIGHT,
  TREE_DATELINE_COLOR, TREE_DATELINE_COLOR_2, TREE_TEXT_COLOR, TREE_TEXT_COLOR_2,
  TREE_TEXT_FONT, TREE_TEXT_FONT_2, TREE_TEXT_LINE_SPACING, TREE_TEXT_TOP
} from "../common";
import { DateLabel } from "../datelabel";
import { SelectCallback } from "./poplarcommon";
import { PoplarData } from "./poplardata";


const PADDING = {
  top: 45,
  bottom: 10,
  left: 20,
  right: 25
};

const COLORS = [
  "rgb(145,205,255)",
  // "rgb(0,86,129)",
  "rgb(119,148,158)",
  // "rgb(0,96,106)",
  "rgb(0,156,189)",
  "rgb(0,235,251)",
  "rgb(111,186,240)",
  // "rgb(0,81,151)",
  // "rgb(0,111,204)",
  "rgb(65,255,255)",
  "rgb(52,219,193)",
  "rgb(83,192,240)"
];

export class PoplarCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  popData: PoplarData;
  width: number = UNSET;
  height: number = UNSET;
  xSpan: number = UNSET;
  ySpan: number = UNSET;
  /* sparse array of colors */
  branchColors: string[] = [];
  selectedNode: number = UNSET;
  paddingRight: number = PADDING.right;
  paddingLeft: number = PADDING.left;

  constructor(canvas: HTMLCanvasElement,
    popData: PoplarData,
    nodeSelectCallback: SelectCallback
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.popData = popData;
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
        nodeSelectCallback(closest);
      }
    });
    canvas.addEventListener("pointerleave", () => {
      if (this.selectedNode !== UNSET) {
        nodeSelectCallback(UNSET);
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
    this.paddingLeft = PADDING.left + startPct * totalXSpan;
    this.paddingRight = this.width - (PADDING.left + endPct * totalXSpan);
    this.xSpan = this.width - this.paddingLeft - this.paddingRight;
  }

  setColors() {
    const { drawOrder, branchIndices } = this.popData;
    const { branchColors } = this;
    let colorIndex = 0;
    let nodeIndex: number;
    for (let i = 0; i < drawOrder.length; i++) {
      nodeIndex = drawOrder[i];
      if (branchIndices.includes(nodeIndex) && branchColors[nodeIndex] === undefined) {
        branchColors[nodeIndex] = COLORS[colorIndex];
        // console.log(nodeIndex, i, branchColors[nodeIndex], [91,84].includes(nodeIndex)? '--------' : '');
        colorIndex++;
        colorIndex %= COLORS.length;
      }
    }
  }

  getColor(nodeIndex: number): string {
    let c = this.branchColors[nodeIndex];
    if (!c) {
      this.setColors();
      c = this.branchColors[nodeIndex];
    }
    return c;
  }

  setSelectedNode(nodeIndex: number) {
    this.selectedNode = nodeIndex;
    requestAnimationFrame(() => this.drawHighlight());
  }


  sizeCanvas() {
    const { width, height } = resizeCanvas(this.canvas);
    this.width = width;
    this.height = height;
    this.xSpan = this.width - this.paddingLeft - this.paddingRight;
    this.ySpan = this.height - PADDING.top - PADDING.bottom;
    this.ctx.lineWidth = 0.5;
  }

  draw() {
    const { ctx, popData, width, height } = this;
    ctx.clearRect(0, 0, width, height);
    const { drawOrder, branchIndices, baseTree, nodePos } = popData;
    if (!baseTree) return;
    let nodeIndex: number;
    for (let i = 0; i < drawOrder.length; i++) {
      nodeIndex = drawOrder[i];
      if (branchIndices.includes(nodeIndex)) {
        ctx.fillStyle = this.getColor(nodeIndex);
        ctx.beginPath();
        this.drawTreeArea(ctx, nodeIndex);
        ctx.fill();
      }
    }
    ctx.strokeStyle = "black";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    let parentIndex: number;
    let currentNodePos: number[];
    let parentNodePos: number[];
    for (let i = 0; i < drawOrder.length; i++) {
      nodeIndex = drawOrder[i];
      parentIndex = baseTree.getParentIndexOf(nodeIndex);
      currentNodePos = nodePos[nodeIndex];
      parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : nodePos[parentIndex];
      this.drawTreeBranch(ctx, nodeIndex, currentNodePos, parentNodePos);
    }
    ctx.stroke();
    this.drawDates();
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


  drawTreeBranch(ctx: CanvasRenderingContext2D,
    nodeIndex: number,
    currentNodePos: number[],
    parentNodePos: number[]
  ) {
    const { xSpan, ySpan, popData } = this;
    const binCount = popData.binCount;
    const lastIndex = binCount - 1;
    let i = 0;
    let x: number;
    let y: number;
    const [nodeX, nodeY] = currentNodePos;
    const [parentX, parentY] = parentNodePos;
    if (parentX === UNSET) {
      x = this.paddingLeft;
      y = PADDING.top + ySpan * 0.5;
    } else {
      x = this.paddingLeft + parentX / lastIndex * xSpan;
      y = PADDING.top + parentY * ySpan;
    }
    ctx.moveTo(x, y);
    const nodeXrender = this.paddingLeft + nodeX / lastIndex * xSpan;
    const nodeYrender = PADDING.top + nodeY * ySpan;
    let center: number;
    let splitTop: number;
    for (i = 0; i < binCount; i++) {
      center = popData.getPoplarCoordCenter(nodeIndex, i);
      splitTop = popData.getPoplarCoordSplitTop(nodeIndex, i);
      if (center !== UNSET && splitTop === UNSET) {
        x = this.paddingLeft + i / lastIndex * xSpan;
        y = PADDING.top + center * ySpan;
        if (x < nodeXrender) ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(nodeXrender, nodeYrender);
  }

  drawTreeArea(ctx: CanvasRenderingContext2D,
    nodeIndex: number,
    includeDecendants = true
  ) {
    const { xSpan, ySpan, popData } = this;
    const binCount = popData.binCount;
    const lastIndex = binCount - 1;
    let i = 0;
    let drawing = false;
    let x: number;
    let y: number;
    let firstDrawn = UNSET;
    let bottom: number;
    /* draw along the bottom, from right to left */
    for (i = lastIndex; i >= 0; i--) {
      bottom = popData.getPoplarCoordBottom(nodeIndex, i);
      if (bottom !== UNSET) {
        x = this.paddingLeft + i / (lastIndex) * xSpan;
        y = PADDING.top + bottom * ySpan;
        if (!drawing) {
          ctx.moveTo(x, y);
          drawing = true;
        } else {
          ctx.lineTo(x, y);
        }
        firstDrawn = i;
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
        x = this.paddingLeft + i / (lastIndex) * xSpan;
        y = PADDING.top + top * ySpan;
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
          x = this.paddingLeft + i / lastIndex * xSpan;
          y = PADDING.top + splitTop * ySpan;
          ctx.lineTo(x, y);
        }
      }
      let splitBottom: number;
      /* draw along the bottom of the split, left to right */
      for (; i <= lastDrawn; i++) {
        splitBottom = popData.getPoplarCoordSplitBottom(nodeIndex, i);
        if (splitBottom !== UNSET) {
          x = this.paddingLeft + i / lastIndex * xSpan;
          y = PADDING.top + splitBottom * ySpan;
          ctx.lineTo(x, y);
        }
      }
    }
  }

  drawHighlight() {
    const { ctx, selectedNode, width, height } = this;
    const { baseTree, nodePos, drawOrder } = this.popData;
    if (!baseTree) return;
    if (selectedNode === UNSET) {
      this.draw();
    } else {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = "black";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      let nodeIndex: number;
      let parentIndex: number;
      let currentNodePos: number[];
      let parentNodePos: number[];
      for (let i = 0; i < drawOrder.length; i++) {
        nodeIndex = drawOrder[i];
        parentIndex = baseTree.getParentIndexOf(nodeIndex);
        currentNodePos = nodePos[nodeIndex];
        parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : nodePos[parentIndex];
        this.drawTreeBranch(ctx, nodeIndex, currentNodePos, parentNodePos);
      }
      ctx.stroke();
      ctx.strokeStyle = this.getColor(selectedNode);
      ctx.fillStyle = this.getColor(selectedNode);
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      this.drawTreeArea(ctx, selectedNode, true);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.beginPath();
      this.drawTreeArea(ctx, selectedNode, false);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "black";
      ctx.beginPath();
      parentIndex = baseTree.getParentIndexOf(selectedNode);
      currentNodePos = nodePos[selectedNode];
      parentNodePos = parentIndex === UNSET ? [UNSET, UNSET] : nodePos[parentIndex];
      this.drawTreeBranch(ctx, selectedNode, currentNodePos, parentNodePos);
      ctx.stroke();
      this.drawDates();
    }

  }
}
