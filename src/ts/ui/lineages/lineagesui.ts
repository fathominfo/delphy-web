import { Mutation, SummaryTree } from '../../pythia/delphy_api';
import { Pythia } from '../../pythia/pythia';
import { MutationDistribution } from '../../pythia/mutationdistribution';
import { MccUI } from '../mccui';
import { TreeCanvas } from '../treecanvas';
import { CHART_TEXT_FONT, DataResolveType, DisplayNode, Screens,
  TREE_PADDING_BOTTOM,
  TREE_PADDING_LEFT,
  TREE_PADDING_RIGHT,
  TREE_TEXT_LINE_SPACING, TREE_TEXT_TOP, TREE_TIMELINE_SPACING, UNSET,
  getNodeColor, getNodeTypeName, getNodeClassName } from '../common';
import { SharedState } from '../../sharedstate';
import { NodeRelationChart } from './noderelationchart';
import { NodePairType, NodePair, NodeComparisonData,
  NodeCallback, DismissCallback, NodeDisplay, getAncestorType, getDescendantType } from './lineagescommon';
import { NodeListDisplay } from './nodelistdisplay';
import { MutationFunctionType, NodeComparison, setComparisons } from './nodecomparison';
import { NodePrevalenceCanvas } from './nodeprevalencecanvas';
import { isTip } from '../../util/treeutils';
import autocomplete from 'autocompleter';
import { PdfCanvas } from '../../util/pdfcanvas';
import { FieldTipCount, NodeMetadata } from '../nodemetadata';


type KeyEventHandler = (event: KeyboardEvent)=>void;


// const HOVER_COLOR = 'rgb(0, 70, 148)';

const AC_SUGGESTION_TEMPLATE = document.querySelector(".autocomplete-suggestion") as HTMLElement;
AC_SUGGESTION_TEMPLATE.remove();


const CLICK_TIME = 300;
const DRAG_DIST = 15;
const DRAG_DIST_2 = DRAG_DIST * DRAG_DIST;
// const SCROLLBAR_W = 10;

const enum TreeHint {
  Hover,

  HoverRoot,
  HoverMrca,
  HoverNode1,
  HoverNode2Descendant,
  HoverNode2Cousin,

  PreviewNode1,
  PreviewNode2Descendant,
  PreviewNode2Cousin,

  MaxSelections,

  Zoom
}

const TREE_HINT_CLASSES = [
  "hover",

  "hover-root",
  "hover-mrca",
  "hover-node1",
  "hover-node2-descendant",
  "hover-node2-cousin",

  "preview-node1",
  "preview-node2-descendant",
  "preview-node2-cousin",

  "max-selections",

  "zoom"
]


const PREVALENCE_PCT_DAYS = .20;


export class LineagesUI extends MccUI {
  node1Index = UNSET;
  node2Index = UNSET;
  mrcaIndex = UNSET;
  rootIndex = UNSET;

  nodeChildCount: number[];

  maxVal = 0;


  nodeRelationChart: NodeRelationChart;
  nodeListDisplay: NodeListDisplay;
  nodeComparisons: NodeComparison[];


  highlightNode: DisplayNode | typeof UNSET;

  canvasDownHandler: (event:MouseEvent)=>void; // eslint-disable-line no-unused-vars
  canvasMoveHandler: (event:MouseEvent)=>void; // eslint-disable-line no-unused-vars
  canvasLeaveHandler: ()=>void;
  keyupHandler: KeyEventHandler;

  nodeHighlightCallback: NodeCallback;

  prevMcc: SummaryTree | null;

  nodePrevalenceCanvas: NodePrevalenceCanvas;

  currentHover: number;
  selectable: boolean;

  constrainHoverByCredibility: boolean;

  treeHints: HTMLElement[];

  resetZoomButton: HTMLButtonElement;


  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector, "#lineages--mcc-canvas");
    const dismissCallback: DismissCallback = node=>this.handleNodeDismiss(node);
    const nodeZoomCallback: NodeCallback = node=>this.handleNodeZoom(node);
    const nodeHighlightCallback: NodeCallback = node=>this.handleNodeHighlight(node);
    this.nodeRelationChart = new NodeRelationChart(nodeHighlightCallback);
    this.nodeListDisplay = new NodeListDisplay(dismissCallback, nodeHighlightCallback, nodeZoomCallback);
    this.nodeComparisons = [];
    this.constrainHoverByCredibility = false;
    {
      let startTime = 0,
        startX = UNSET,
        startY = UNSET,
        selectionX = UNSET,
        selectionY = UNSET,
        dragging = false,
        dragged = false,
        canvas: HTMLCanvasElement | PdfCanvas;
      const drawSelection = ()=>{
        const ctx = this.highlightCtx,
          treeCanvas = this.mccTreeCanvas;
        ctx.clearRect(0, 0, treeCanvas.width, treeCanvas.height);
        ctx.fillStyle = 'rgba(240,240,240,0.8)';
        ctx.fillRect(0, 0, treeCanvas.width, treeCanvas.height);
        ctx.clearRect(startX, startY, selectionX - startX, selectionY - startY);
        this.drawHighlightNode(this.rootIndex, DisplayNode.root, ctx, treeCanvas);
        this.drawHighlightNode(this.mrcaIndex, DisplayNode.mrca, ctx, treeCanvas);
        this.drawHighlightNode(this.node1Index, DisplayNode.node1, ctx, treeCanvas);
        this.drawHighlightNode(this.node2Index, DisplayNode.node2, ctx, treeCanvas);
        ctx.fillStyle = "rgb(84,84,84)";
        ctx.textBaseline = "top";
        ctx.font = CHART_TEXT_FONT;
        ctx.fillText("Zoom to selection", startX, Math.max(startY, selectionY) + 3);
      }
      this.canvasDownHandler = (event: MouseEvent)=>{
        canvas = this.mccTreeCanvas.getCanvas();
        event.preventDefault();
        lookupInput.blur();
        if (!(canvas instanceof HTMLCanvasElement)) return;

        startTime = Date.now();
        dragging = true;
        dragged = false;
        startX = event.offsetX;
        startY = event.offsetY;
        // this.sharedState.mccConfig.startDrag();
        canvas.addEventListener('pointerup', canvasUpHandler);
        canvas.setPointerCapture((event as PointerEvent).pointerId);
      };
      this.canvasMoveHandler = (event: MouseEvent)=>{
        if (!dragging) {
          this.hoverCallback(event);
          return;
        }

        const dx = event.offsetX - startX,
          dy = event.offsetY - startY,
          d2 = dx * dx + dy * dy;
        if (d2 > DRAG_DIST_2) {
          dragged = true;
        }
        if (dragged) {
          selectionX = event.offsetX;
          selectionY = event.offsetY;
          drawSelection();
          this.setHint(TreeHint.Zoom);
          this.mccTreeCanvas.setNoding(false, false);
        }
      };
      const canvasUpHandler = (event: MouseEvent)=>{
        if (canvas instanceof HTMLCanvasElement) {
          dragging = false;
          canvas.removeEventListener('pointerup', canvasUpHandler);
          if (dragged) {
            const left = TREE_PADDING_LEFT,
              right = this.mccTreeCanvas.width - TREE_PADDING_RIGHT,
              top = TREE_TIMELINE_SPACING,
              bottom = this.mccTreeCanvas.height - TREE_PADDING_BOTTOM,
              height = bottom - top,
              width = right - left;
            startX = Math.min(right, Math.max(left, startX));
            startY = Math.min(bottom, Math.max(top, startY));
            selectionX = Math.min(right, Math.max(left, selectionX));
            selectionY = Math.min(bottom, Math.max(top, selectionY));
            const h = Math.abs(selectionY - startY),
              w = Math.abs(selectionX - startX),
              vZoom = height / h * this.mccTreeCanvas.verticalZoom,
              hZoom = width / w * this.mccTreeCanvas.horizontalZoom,
              cy = ((selectionY + startY) / 2 - TREE_TIMELINE_SPACING) / height,
              cx = 1 - ((selectionX + startX) / 2 - TREE_PADDING_LEFT) / width,
              zY = this.mccTreeCanvas.zoomCenterY + (cy - 0.5) / this.mccTreeCanvas.verticalZoom,
              zX = this.mccTreeCanvas.zoomCenterX + (cx - 0.5) / this.mccTreeCanvas.horizontalZoom;
            this.sharedState.mccConfig.setZoom(hZoom, vZoom, zX, zY);
          } else if (Date.now() - startTime < CLICK_TIME) {
            const nodeIndex:number = this.mccTreeCanvas.getNodeAt(startX, startY);
            if (!this.constrainHoverByCredibility || this.mccTreeCanvas.creds[nodeIndex] >= this.sharedState.mccConfig.confidenceThreshold) {
              this.selectNode(nodeIndex);
            }
          }
          canvas.releasePointerCapture((event as PointerEvent).pointerId);
        }
      };
      this.canvasLeaveHandler = ()=>{
        this.exitCallback();
        if (this.selectable) {
          this.setHint(TreeHint.Hover);
        } else {
          this.setHint(TreeHint.MaxSelections);
        }
      }
      this.keyupHandler = (event: KeyboardEvent)=>{
        if (dragging && event.key === 'Escape') {
          dragging = false;
          dragged = false;
          this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index);
        }
      };
    }
    this.nodeChildCount = [];
    this.prevMcc = null;
    this.highlightNode = UNSET;
    this.nodeHighlightCallback = nodeHighlightCallback;

    this.nodePrevalenceCanvas = new NodePrevalenceCanvas([[[]]], [], UNSET, UNSET, nodeHighlightCallback);
    this.currentHover = UNSET;
    this.selectable = true;

    this.treeHints = Array.from(this.div.querySelectorAll(".tree-hint") as NodeListOf<HTMLElement>);

    this.resetZoomButton = this.div.querySelector(".mcc-zoom-button.reset") as HTMLButtonElement;

    const lookupForm = document.querySelector(".id-lookup form") as HTMLFormElement;
    lookupForm.addEventListener("submit", e => e.preventDefault());

    const constrainHoverByCredibilityInput = document.querySelector("#lineages--constrain-selection") as HTMLInputElement;
    constrainHoverByCredibilityInput.addEventListener('change', ()=>{
      this.constrainHoverByCredibility = constrainHoverByCredibilityInput.checked;
    });

    const lookupInput = document.querySelector(".id-lookup--input") as HTMLInputElement;
    autocomplete({
      input: lookupInput,
      emptyMsg: "No sequences found",
      minLength: 1,
      fetch: (text, update) => {
        text = text.toLowerCase();
        let suggestions: {label: string, value: string}[] = [];
        const allIds = sharedState.getTipIds();
        const selectedIds = [this.node1Index, this.node2Index].map(index => {
          if (index === UNSET) return null;
          const metadata = sharedState.mccConfig.nodeMetadata?.getNodeMetadata(index);
          if (!metadata) return null;
          const id = metadata.id?.value;
          if (!id) return null;
          return id;
        });
        if (allIds) {
          suggestions = allIds.filter(id => {
            return id.toLowerCase().includes(text);
          })
            .filter(id => !selectedIds.includes(id))
            .map(id => {
              return {
                label: id,
                value: id
              }
            });
        }
        update(suggestions);
      },
      render: (item) => {
        const el = AC_SUGGESTION_TEMPLATE.cloneNode(true) as HTMLDivElement;
        if (item.label) {
          el.innerText = item.label;
        }
        return el;
      },
      onSelect: (item) => {
        if (item.label) {
          lookupInput.value = item.label;
          const nodeIndex = this.sharedState.getTipIndexFromId(item.label);
          if (nodeIndex !== undefined && nodeIndex !== UNSET) {
            this.selectNode(nodeIndex);
          }
          lookupInput.value = "";
        }
      },
      preventSubmit: true
    });
  }


  activate() {
    super.activate();
    const canvas = this.mccTreeCanvas.getCanvas();
    if (canvas instanceof HTMLCanvasElement) {
      canvas.addEventListener('pointerdown', this.canvasDownHandler);
      canvas.addEventListener('pointermove', this.canvasMoveHandler);
      canvas.addEventListener('pointerleave', this.canvasLeaveHandler);
      document.addEventListener('keyup', this.keyupHandler);
    }
  }

  deactivate() {
    super.deactivate();
    const canvas = this.mccTreeCanvas.getCanvas();
    if (canvas instanceof HTMLCanvasElement) {
      canvas.removeEventListener('pointerdown', this.canvasDownHandler);
      canvas.removeEventListener('pointermove', this.canvasMoveHandler);
      canvas.removeEventListener('pointerleave', this.canvasLeaveHandler);
      document.removeEventListener('keyup', this.keyupHandler);
    }
    const nodes = [ this.node1Index, this.node2Index].filter(n=>n!==UNSET);
    if (nodes.length > 0) {
      this.sharedState.setNodeSelection(nodes);
    }
  }


  resize(): void {
    super.resize();
    this.nodeComparisons.forEach(nc => nc.resize());
    this.nodePrevalenceCanvas.resize();
    this.nodePrevalenceCanvas.requestDraw();
  }




  handleConfigChange(): void {
    super.handleConfigChange();
    this.updateNodeData();
  }


  protected updateData(): Promise<SummaryTree> {
    const prom = new Promise((resolve: DataResolveType)=>{
      super.updateData()
        .then((summary:SummaryTree)=>{
          this.updateNodeData();
          this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index);
          this.requestDrawNodeRelationChart();
          resolve(summary);
        })
    });
    return prom;
  }

  private updateNodeData() : void {
    if (this.pythia) {
      const mccRef = this.pythia.getMcc(),
        summaryTree = this.mccTreeCanvas.tree as SummaryTree;
      if (summaryTree !== this.prevMcc) {
        const rootIndex = summaryTree.getRootIndex(),
          nodeCount = summaryTree.getSize(),
          childCounts = new Array(nodeCount),
          rootConfidence = this.mccTreeCanvas.creds[rootIndex];
        childCounts.fill(0);
        for (let i = 0; i < nodeCount; i++) {
          if (isTip(summaryTree,i)) {
            /* this is a tip */
            let ii = i;
            while (ii !== UNSET) {
              childCounts[ii]++;
              ii = summaryTree.getParentIndexOf(ii);
            }
          }
        }
        this.rootIndex = rootIndex;
        this.node1Index = UNSET;
        this.node2Index = UNSET;
        this.mrcaIndex = UNSET;
        if (this.sharedState.nodeList.length > 0) {
          this.node1Index = this.sharedState.nodeList[0];
          if (this.sharedState.nodeList.length > 1) {
            this.node2Index = this.sharedState.nodeList[1];
            this.mrcaIndex = this.checkMRCA(this.node1Index, this.node2Index);
          }
        }
        this.nodeChildCount = childCounts;
        this.nodeListDisplay.setRoot(rootConfidence, this.nodeChildCount[rootIndex], this.sharedState.mccConfig.nodeMetadata?.getNodeMetadata(rootIndex), rootIndex);
        this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index);
        this.requestDrawNodeRelationChart();
        this.setChartData(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index);

      }
      mccRef.release();
    }
  }



  hoverCallback(event:MouseEvent):void {
    const rootIndex = this.rootIndex;
    let mrcaIndex = this.mrcaIndex,
      node1Index = this.node1Index,
      node2Index = this.node2Index;

    const nodeIndex:number = this.mccTreeCanvas.getNodeAt(event.offsetX, event.offsetY);

    if (this.constrainHoverByCredibility) {
      // if lower than threshold, don't do anything
      if (this.mccTreeCanvas.creds[nodeIndex] < this.sharedState.mccConfig.confidenceThreshold) {
        return;
      }
    }

    if (nodeIndex === this.currentHover) {
      // already hovering
      const onNode = nodeIndex !== UNSET;
      const onExistingNode = onNode && (nodeIndex === rootIndex || nodeIndex === mrcaIndex || nodeIndex === node1Index || nodeIndex === node2Index);

      const isNoding = (this.selectable && onNode) || (!this.selectable && onExistingNode);
      const isSelectable = this.selectable && !onExistingNode;

      this.mccTreeCanvas.setNoding(isNoding, isSelectable);

      return;
    }

    this.currentHover = nodeIndex;
    let displayNode: DisplayNode = DisplayNode.UNSET;
    if (nodeIndex === UNSET) {
      /* if hovering didn't result in a new node, then clear the hover */
      this.exitCallback();
      this.setHint(TreeHint.Zoom);
    } else if (nodeIndex === rootIndex || nodeIndex === mrcaIndex || nodeIndex === node1Index || nodeIndex === node2Index) {
      /* new hover on existing node */
      this.requestDrawHighlights(rootIndex, mrcaIndex, node1Index, node2Index, nodeIndex);
      switch (nodeIndex) {
      case rootIndex: {
        displayNode = DisplayNode.root;
        this.setHint(TreeHint.HoverRoot);
        break;
      }
      case mrcaIndex: {
        displayNode = DisplayNode.mrca;
        this.setHint(TreeHint.HoverMrca);
        break;
      }
      case node1Index: {
        displayNode = DisplayNode.node1;
        this.setHint(TreeHint.HoverNode1);
        break;
      }
      case node2Index: {
        displayNode = DisplayNode.node2;
        if (mrcaIndex === UNSET) {
          this.setHint(TreeHint.HoverNode2Descendant);
        } else {
          this.setHint(TreeHint.HoverNode2Cousin);
        }
        break;
      }
      default: break;
      }
      this.handleNodeHighlight(displayNode);
      this.setChartData(this.rootIndex, mrcaIndex, node1Index, node2Index);
    } else if (node1Index !== UNSET && node2Index !== UNSET ) {
      /* if both the settable nodes are locked, then skip */
      this.exitCallback();
      this.setHint(TreeHint.Zoom);
    } else {
      if (node1Index === UNSET && nodeIndex !== node2Index) {
        /* selecting node 1 */
        node1Index = nodeIndex;
        displayNode = DisplayNode.node1;
        if (node2Index !== UNSET) {
          mrcaIndex = this.checkMRCA(node1Index, node2Index);
        }
        this.setHint(TreeHint.PreviewNode1);
        // console.log("metadata tip counts at this node", this.mccTreeCanvas.metadataNodeValues[node1Index], this.mccTreeCanvas.metadataNodeValueOptions[node1Index]);
        // console.log("metadata", this.sharedState.mccConfig.nodeMetadata?.nodeValues[node1Index]);
      } else if (node2Index === UNSET && nodeIndex !== node1Index) {
        /* selecting node 2 */
        node2Index = nodeIndex;
        mrcaIndex = this.checkMRCA(node1Index, node2Index);
        displayNode = DisplayNode.node2;
        if (mrcaIndex === UNSET) {
          this.setHint(TreeHint.PreviewNode2Descendant);
        } else {
          this.setHint(TreeHint.PreviewNode2Cousin);
        }
      }
      this.requestDrawHighlights(this.rootIndex, mrcaIndex, node1Index, node2Index, nodeIndex);
      this.requestDrawNodeRelationChart();
      this.setChartData(this.rootIndex, mrcaIndex, node1Index, node2Index);
    }

    this.nodeListDisplay.highlightNode(displayNode);
    this.nodeRelationChart.highlightNode(displayNode);
    this.nodePrevalenceCanvas.highlightNode(displayNode);
    this.nodeComparisons.forEach((nc: NodeComparison)=>{
      nc.highlightNode(displayNode);
    });
  }


  selectNode(nodeIndex: number): void {
    if (nodeIndex === this.node1Index || nodeIndex === this.node2Index) {
      /* clicking on an already selected node */
      return;
    }

    if (this.node1Index === UNSET) {
      this.node1Index = nodeIndex;
      this.setHint(TreeHint.HoverNode1);
    } else if (this.node2Index === UNSET) {
      this.node2Index = nodeIndex;
    }

    if (this.node1Index !== UNSET && this.node2Index !== UNSET) {
      this.mrcaIndex = this.checkMRCA(this.node1Index, this.node2Index);
      this.setSelectable(false);
      if (nodeIndex === this.node2Index) {
        if (this.mrcaIndex === UNSET) {
          this.setHint(TreeHint.HoverNode2Descendant);
        } else {
          this.setHint(TreeHint.HoverNode2Cousin);
        }
      }
    } else {
      this.setSelectable(true);
    }

    this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index, nodeIndex);
    this.requestDrawNodeRelationChart();
    this.setChartData(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index);
  }

  getMRCA(index1: number, index2: number): number {
    /* check for a common ancestor that is not root */
    let mrcaIndex = UNSET;
    const mcc = this.mccTreeCanvas.tree as SummaryTree,
      root = mcc.getRootIndex();
    let i1 = index1,
      i2 = index2,
      steps = 0;
    while (i1 !== i2 && i1 !== root && i2 !== root) {
      /*
      the mrca will always have more tips
      so if we aren't matched yet, then take the
      parent of the node that has fewer tips.
      */
      const size1 = this.nodeChildCount[i1],
        size2 = this.nodeChildCount[i2];
      if (size1 < size2) {
        i1 = mcc.getParentIndexOf(i1);
      } else {
        i2 = mcc.getParentIndexOf(i2);
      }
      steps++;
      if (steps >= 1000) {
        console.warn(`we had a problem on ${index1} and ${index2}, setting mrca to root`)
        mrcaIndex = root;
        break;
      }
    }
    if (i1 === i2) {
      mrcaIndex = i1;
    } else if (i1 === root || i2 === root) {
      mrcaIndex = root;
    }
    return mrcaIndex;
  }


  checkMRCA(index1: number, index2: number): number {
    const mrca = this.getMRCA(index1, index2);
    if (mrca === this.rootIndex || mrca === index1 || mrca === index2) {
      return UNSET;
    }
    return mrca;
  }

  exitCallback():void {
    this.handleNodeHighlight(UNSET);
    this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index);
    this.setChartData(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index);
  }


  setChartData(rootIndex:number, mrcaIndex:number, node1Index:number, node2Index:number): void {
    const pythia = this.pythia
    if (pythia) {

      const mccRef = pythia.getMcc(),
        src: NodeComparisonData[] = [],
        minDate = pythia.getBaseTreeMinDate(),
        maxDate = pythia.maxDate,
        nodeConfidence = this.mccTreeCanvas.creds,
        summaryTree = this.mccTreeCanvas.tree as SummaryTree,
        nodeMetadata = this.sharedState.mccConfig.nodeMetadata,
        tipIds = this.sharedState.getTipIds();
      if (node1Index === UNSET && node2Index === UNSET) {
        /* we clear all but the root node */
        this.nodeListDisplay.clearNode1();
        this.nodeListDisplay.clearNode2();
        this.nodeListDisplay.clearMRCA();
        const nodePair = this.assembleNodePair(rootIndex, UNSET, NodePairType.rootOnly, pythia),
          node1Times = pythia.getNodeTimeDistribution(rootIndex, summaryTree),
          node2Times: number[] = [],
          overlapCount = 0;
        src.push({ nodePair, node1Times, node2Times, overlapCount});
        this.setSelectable(true);
      } else {
        let nodePair: NodePair,
          node1Times: number[],
          node2Times: number[];
        const node1Locked = node1Index === this.node1Index,
          node2Locked = node2Index === this.node2Index,
          overlapCount = 0;
        if (mrcaIndex === UNSET) {
          /* if there is no mrca, then we connect the root directly to the other nodes */
          if (node1Index === UNSET) {
            this.nodeListDisplay.clearNode1();
            if (node2Index !== UNSET) {
              this.nodeListDisplay.setNode2(nodeConfidence[node2Index], this.nodeChildCount[node2Index], node2Locked, getNodeMetadata(node2Index, nodeMetadata, tipIds), node2Index);
              nodePair = this.assembleNodePair(rootIndex, node2Index, NodePairType.rootToNode2, pythia);
              node1Times = pythia.getNodeTimeDistribution(rootIndex, summaryTree);
              node2Times = pythia.getNodeTimeDistribution(node2Index, summaryTree);
              src.push({nodePair, node1Times, node2Times, overlapCount });
            } else {
              this.nodeListDisplay.clearNode2();
            }
            this.setSelectable(true);
          } else if (node2Index === UNSET || node2Index === node1Index) {
            /* we have node 1 without node 2 */
            this.nodeListDisplay.setNode1(nodeConfidence[node1Index], this.nodeChildCount[node1Index], node1Locked, getNodeMetadata(node1Index, nodeMetadata, tipIds), node1Index);
            nodePair = this.assembleNodePair(rootIndex, node1Index, NodePairType.rootToNode1, pythia);
            node1Times = pythia.getNodeTimeDistribution(rootIndex, summaryTree);
            node2Times = pythia.getNodeTimeDistribution(node1Index, summaryTree);
            src.push({nodePair, node1Times, node2Times, overlapCount });
            this.nodeListDisplay.clearNode2();
            this.setSelectable(true);
          } else {
            /*
              we have both node 1 and node 2, but no mrca.
              this could mean both are descended from root,
              or one is descended from the other
              */
            const mrca = this.getMRCA(node1Index, node2Index),
              pairs: NodePairType[] = [],
              indices:[number, number][] = [];
            if (mrca === rootIndex) {
              pairs[0] = NodePairType.rootToNode1;
              indices[0] = [rootIndex, node1Index];
              pairs[1] = NodePairType.rootToNode2;
              indices[1] = [rootIndex, node2Index];
            } else if (mrca === node1Index) {
              pairs[0] = NodePairType.rootToNode1;
              indices[0] = [rootIndex, node1Index];
              pairs[1] = NodePairType.node1ToNode2;
              indices[1] = [node1Index, node2Index];
            } else {
              pairs[0] = NodePairType.rootToNode2;
              indices[0] = [rootIndex, node2Index];
              pairs[1] = NodePairType.node2ToNode1;
              indices[1] = [node2Index, node1Index];
            }

            this.nodeListDisplay.setNode1(nodeConfidence[node1Index], this.nodeChildCount[node1Index], node1Locked, getNodeMetadata(node1Index, nodeMetadata, tipIds), node1Index);
            this.nodeListDisplay.setNode2(nodeConfidence[node2Index], this.nodeChildCount[node2Index], node2Locked, getNodeMetadata(node2Index, nodeMetadata, tipIds), node2Index);

            nodePair = this.assembleNodePair(indices[0][0], indices[0][1], pairs[0], pythia);
            node1Times = pythia.getNodeTimeDistribution(indices[0][0], summaryTree);
            node2Times = pythia.getNodeTimeDistribution(indices[0][1], summaryTree);
            src.push({nodePair, node1Times, node2Times, overlapCount });


            nodePair = this.assembleNodePair(indices[1][0], indices[1][1], pairs[1], pythia);
            node1Times = pythia.getNodeTimeDistribution(indices[1][0], summaryTree);
            node2Times = pythia.getNodeTimeDistribution(indices[1][1], summaryTree);
            src.push({nodePair, node1Times, node2Times, overlapCount });
            // this.disableSelections();
          }
          this.nodeListDisplay.clearMRCA();
        } else {
          this.nodeListDisplay.setNode1(nodeConfidence[node1Index], this.nodeChildCount[node1Index], node1Locked, getNodeMetadata(node1Index, nodeMetadata, tipIds), node1Index);
          this.nodeListDisplay.setNode2(nodeConfidence[node2Index], this.nodeChildCount[node2Index], node2Locked, getNodeMetadata(node2Index, nodeMetadata, tipIds), node2Index);
          this.nodeListDisplay.setMRCA(nodeConfidence[mrcaIndex], this.nodeChildCount[mrcaIndex], false, getNodeMetadata(mrcaIndex, nodeMetadata, tipIds), mrcaIndex);
          nodePair = this.assembleNodePair(rootIndex, mrcaIndex, NodePairType.rootToMrca, pythia);
          node1Times = pythia.getNodeTimeDistribution(rootIndex, summaryTree);
          node2Times = pythia.getNodeTimeDistribution(mrcaIndex, summaryTree);
          src.push({nodePair, node1Times, node2Times, overlapCount });
          node1Times = node2Times;
          nodePair = this.assembleNodePair(mrcaIndex, node1Index, NodePairType.mrcaToNode1, pythia);
          node2Times = pythia.getNodeTimeDistribution(node1Index, summaryTree);
          src.push({nodePair, node1Times, node2Times, overlapCount });
          nodePair = this.assembleNodePair(mrcaIndex, node2Index, NodePairType.mrcaToNode2, pythia);
          node2Times = pythia.getNodeTimeDistribution(node2Index, summaryTree);
          src.push({nodePair, node1Times, node2Times, overlapCount });
          // this.disableSelections();
        }
      }
      let nodes: NodeDisplay[] = [rootIndex, mrcaIndex, node1Index, node2Index].map(getNodeDisplay);
      nodes = nodes.filter(({index})=>index>=0);

      const nodeIndices = nodes.map(({index})=>index),
        nodePrevalenceData = pythia.getPopulationNodeDistribution(nodeIndices, minDate, maxDate, summaryTree),
        nodeDistributions = nodePrevalenceData.series,
        overlap = nodePrevalenceData.overlap;


      /*
      the list `nodes` has an indicator of whether the node in question is Root, MRCA, Selection A or B.
      Because the `overlap` list was built from a list that does not have that information, and where unset
      nodes were removed. The `index1` and `index2` attributes of each item in the `overlap` list reference index
      positions of the nodes list. Combine them now in order to find which node pair `index1` and `index2` are referring to,
      then track the overlap on the NodeComparisonData item.
      */
      overlap.forEach(oItem=>{
        const node1Type = nodes[oItem.index1].type,
          node2Type = nodes[oItem.index2].type;
        src.forEach((ncd:NodeComparisonData)=>{
          const pairType = ncd.nodePair.pairType,
            n1 = getAncestorType(pairType),
            n2 = getDescendantType(pairType);
          if (n1 === node1Type && n2 === node2Type) {
            ncd.overlapCount = oItem.count;
          }
        });
      });
      nodes.unshift({ index: UNSET, color: 'rgb(240,240,240)', label: 'other', type: DisplayNode.UNSET, className: "" });

      let [zoomMinDate, zoomMaxDate] = this.mccTreeCanvas.getZoomedDateRange(); // eslint-disable-line prefer-const
      // const zoomDateRange = zoomMaxDate - zoomMinDate;
      // zoomMinDate += Math.round(PREVALENCE_PCT_DAYS * zoomDateRange);

      this.nodeComparisons = setComparisons(src, minDate, maxDate, this.goToMutations, this.nodeHighlightCallback,
        this.isApobecEnabled, zoomMinDate, zoomMaxDate);
      const node1IsUpper = this.mccTreeCanvas.getZoomY(node1Index) < this.mccTreeCanvas.getZoomY(node2Index);
      this.nodeRelationChart.setData(src, [rootIndex, mrcaIndex, node1Index, node2Index], node1IsUpper);
      // const nodeColors = nodes.map(({color})=>color),
      //   nodeLabels = nodes.map(({label}) => label);
      /* we want the default distribution to come first */
      nodeDistributions.forEach(treeSeries=>treeSeries.unshift(treeSeries.pop() as number[]));
      // this.nodePrevalenceCanvas.setData(nodeDistributions, nodes, minDate, maxDate, zoomMinDate, zoomMaxDate);
      this.nodePrevalenceCanvas.setData(nodeDistributions, nodes, minDate, maxDate, minDate, maxDate);
      this.nodePrevalenceCanvas.requestDraw();
      this.nodeListDisplay.setPrevalenceData(nodePrevalenceData, nodes, minDate, maxDate);
      mccRef.release();
    }
  }

  setSelectable(selectable: boolean) {
    this.selectable = selectable;
    const lookupInput = document.querySelector(".id-lookup--input") as HTMLInputElement;
    lookupInput.disabled = !selectable;
    // lookupInput.placeholder = selectable ? "Lookup a sequence id…" : "deselect a node below to enable search";
    // more hints...
  }

  setHint(hint: TreeHint) {
    const className = TREE_HINT_CLASSES[hint];
    this.treeHints.forEach(th => th.classList.toggle("hidden", !th.classList.contains(className)));
  }

  assembleNodePair(index1: number, index2: number, nodePairType: NodePairType, pythia: Pythia): NodePair {
    const tree = this.mccTreeCanvas.tree as SummaryTree,
      mutTimes : MutationDistribution[] = pythia.getMccMutationsBetween(index1, index2, tree);
    return new NodePair(index1, index2, nodePairType, mutTimes);
  }


  handleNodeDismiss(node:DisplayNode): void {
    switch (node) {
    case DisplayNode.node1: {
      this.node1Index = UNSET;
      this.mrcaIndex = UNSET;
      this.nodeListDisplay.clearNode1();
      this.nodeListDisplay.clearMRCA();

      if (this.node2Index !== UNSET) {
        this.node1Index = this.node2Index;
        this.node2Index = UNSET;
        this.nodeListDisplay.clearNode2();
      }
    }
      break;
    case DisplayNode.node2: {
      this.node2Index = UNSET;
      this.mrcaIndex = UNSET;
      this.nodeListDisplay.clearNode2();
      this.nodeListDisplay.clearMRCA();
    }
      break;
    }

    this.mccTreeCanvas.setFade(false);
    super.requestTreeDraw();

    this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index);
    this.setChartData(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index);

    this.nodeListDisplay.highlightNode(UNSET);
    this.nodeRelationChart.highlightNode(UNSET);
    this.nodePrevalenceCanvas.highlightNode(UNSET);
    this.nodeComparisons.forEach(nc => nc.highlightNode(UNSET))

    this.setHint(TreeHint.Hover);
  }

  handleNodeZoom(node: DisplayNode | typeof UNSET) : void {
    let zoomNode = UNSET;

    switch (node) {
    case DisplayNode.mrca:
      zoomNode = this.mrcaIndex;
      break;
    case DisplayNode.node1:
      zoomNode = this.node1Index;
      break;
    case DisplayNode.node2:
      zoomNode = this.node2Index;
      break;
    }
    if (zoomNode === UNSET) {
      this.mccTreeCanvas.resetZoom();
      this.sharedState.mccConfig.resetZoom();
    } else if (this.pythia) {
      const tips = this.pythia.getMccNodeTips(zoomNode),
        treeCanvas = this.mccTreeCanvas;
      treeCanvas.zoomToTips(tips);
      this.sharedState.mccConfig.setZoom(1, treeCanvas.verticalZoom, 0.5, treeCanvas.zoomCenterY);
    }
    super.requestTreeDraw();
    this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index);
    this.nodeRelationChart.highlightNode(node);
  }

  handleNodeHighlight(node: DisplayNode | typeof UNSET) : void {
    if (node === this.highlightNode) {
      // no need to check again
      return;
    }

    this.mccTreeCanvas.setFade(node !== UNSET);
    super.requestTreeDraw();

    this.highlightNode = node;
    let subtreeIndex = UNSET;
    switch(node) {
    case DisplayNode.root: {
      subtreeIndex = this.rootIndex;
      this.setHint(TreeHint.HoverRoot);
    }
      break;
    case DisplayNode.mrca: {
      subtreeIndex = this.mrcaIndex;
      this.setHint(TreeHint.HoverMrca);
    }
      break;
    case DisplayNode.node1: {
      subtreeIndex = this.node1Index;
      this.setHint(TreeHint.HoverNode1);
    }
      break;
    case DisplayNode.node2: {
      subtreeIndex = this.node2Index;
      if (this.node1Index !== UNSET) {
        this.setHint(TreeHint.HoverNode2Descendant);
      } else {
        this.setHint(TreeHint.HoverNode2Cousin);
      }
    }
      break;
    default: {
      if (this.node1Index !== UNSET && this.node2Index !== UNSET) {
        this.setHint(TreeHint.MaxSelections);
      } else {
        this.setHint(TreeHint.Hover);
      }
    }
      break;
    }

    this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index, subtreeIndex);
    this.nodeListDisplay.highlightNode(node);
    this.nodeRelationChart.highlightNode(node);
    this.nodePrevalenceCanvas.highlightNode(node);

    this.nodeComparisons.forEach((nc: NodeComparison)=>{
      nc.highlightNode(node);
    });

  }


  /*
  need a means for the the mccconfig to invoke drawing
  the tree and the highlights when the zoom has changed.
  So we override the default request to draw the tree
  with a version that also draws the highlight nodes.
  */
  requestTreeDraw(): void {
    super.requestTreeDraw();
    let [zoomMinDate, zoomMaxDate] = this.mccTreeCanvas.getZoomedDateRange();  // eslint-disable-line prefer-const
    const zoomDateRange = zoomMaxDate - zoomMinDate;
    zoomMinDate -= Math.round(PREVALENCE_PCT_DAYS * zoomDateRange);
    // this.nodePrevalenceCanvas.setDateRange(zoomMinDate, zoomMaxDate);
    // this.nodeComparisons.forEach((nc: NodeComparison)=>{
    //   nc.setDateRange(zoomMinDate, zoomMaxDate);
    //   nc.requestDraw();
    // });
    this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.node1Index, this.node2Index);
    this.nodePrevalenceCanvas.requestDraw();

  }




  private requestDrawHighlights(rootIndex:number, mrcaIndex:number, node1Index:number, node2Index:number, subtreeNode: number = UNSET) {
    requestAnimationFrame(()=>this.drawHighlights(rootIndex, mrcaIndex, node1Index, node2Index, subtreeNode));
  }

  private drawHighlights(rootIndex:number, mrcaIndex:number, node1Index:number, node2Index:number, subtreeNode: number):void {
    if (!this.pythia) return;

    const ctx = this.highlightCtx,
      treeCanvas = this.mccTreeCanvas,
      barTop = TREE_TEXT_TOP + TREE_TEXT_LINE_SPACING * 2;
    ctx.clearRect(0, 0, treeCanvas.width, treeCanvas.height);
    if (subtreeNode !== UNSET) {
      const color = subtreeNode === mrcaIndex ? getNodeColor(DisplayNode.mrca)
        : subtreeNode === node1Index ? getNodeColor(DisplayNode.node1)
          : subtreeNode === node2Index ? getNodeColor(DisplayNode.node2)
            // : HOVER_COLOR;
            : getNodeColor(DisplayNode.root);
      this.drawSubtree(subtreeNode, ctx, treeCanvas, color);

    }
    this.drawHighlightNode(rootIndex, DisplayNode.root, ctx, treeCanvas);
    this.drawHighlightNode(mrcaIndex, DisplayNode.mrca, ctx, treeCanvas);
    this.drawHighlightNode(node1Index, DisplayNode.node1, ctx, treeCanvas);
    this.drawHighlightNode(node2Index, DisplayNode.node2, ctx, treeCanvas);
    ctx.clearRect(0, 0, treeCanvas.width, barTop);
    // this.drawScrollBar();
  }

  private drawHighlightNode(index: number, displayNode: DisplayNode, ctx: CanvasRenderingContext2D, treeCanvas: TreeCanvas): void {
    if (index === UNSET) return;

    const mcc = treeCanvas.tree as SummaryTree,
      x = treeCanvas.getZoomX(mcc.getTimeOf(index)),
      y = treeCanvas.getZoomY(index),
      radius = 6,
      color = getNodeColor(displayNode);
    ctx.globalAlpha = this.highlightNode === UNSET || displayNode === this.highlightNode ? 1 : 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    ctx.moveTo(x + radius, y);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);

    if (index === this.rootIndex || index === this.mrcaIndex || color === getNodeColor(DisplayNode.mrca)) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      let alpha = 1.0;
      if ((displayNode === DisplayNode.node1 && this.node1Index === UNSET) ||
          (displayNode === DisplayNode.node2 && this.node2Index === UNSET)) {
        ctx.setLineDash([4, 2]);
        alpha = 0.5;
        ctx.lineWidth = 2;
      }
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
      ctx.stroke();
    }

    ctx.setLineDash([]);
  }

  drawSubtree(index: number, ctx: CanvasRenderingContext2D, treeCanvas: TreeCanvas, color: string) : void {
    ctx.fillStyle = color;
    ctx.lineWidth  = 0.75;
    ctx.strokeStyle = ctx.fillStyle;
    treeCanvas.drawSubtree(index, ctx);
  }


  private requestDrawNodeRelationChart() {
    requestAnimationFrame(() => this.drawNodeRelationChart());
  }

  private drawNodeRelationChart() {
    this.nodeRelationChart.draw();
  }

  goToMutations: MutationFunctionType = (mutation?: Mutation) => {
    if (mutation) {
      this.sharedState.addMutation(mutation);
      this.sharedState.goTo(Screens.mutations);
    }
  }



}


const getNodeDisplay = (index: DisplayNode, dn: DisplayNode) => {
  return {
    index: index,
    color: getNodeColor(dn),
    label: getNodeTypeName(dn),
    type: dn,
    className: getNodeClassName(dn)
  };
}


const getNodeMetadata = (nodeIndex:number, nodeMetadata: NodeMetadata | null, tipIds:string[])=>{
  let md = undefined;
  if (nodeMetadata) {
    md = nodeMetadata.getNodeMetadata(nodeIndex);
  } else if (nodeIndex < tipIds.length) {
    const value =  tipIds[nodeIndex],
      counts: FieldTipCount = {};
    counts[value] = 1;
    md = {id: {value, counts}};
  }
  return md;
}