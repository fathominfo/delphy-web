import { Mutation, SummaryTree } from '../../pythia/delphy_api';
import { MccUI } from '../mccui';
import { DataResolveType, Screens, SET_PREVALENCE_CALLBACK_TYPE, UNSET, ColorOption } from '../common';
import { SharedState } from '../../sharedstate';
import { HoverCallback, NodeCallback,
  OpenMutationPageFncType, TreeHint,  TREE_HINT_CLASSES,
  MetadataToggleCallback,
  DismissNodeCallback,
  MultiNodeCallback} from './selectcommon';
import autocomplete from 'autocompleter';

import { SelectTreeCanvas } from './selecttreecanvas';
import { ChartData, CoreSelectData, UpdateFunction } from './coreselectdata';
import { NodeDetails } from './nodedetails';
import { DisplayNode } from '../displaynode';
import { MccConfig } from '../mccconfig';
import { MetadataLegend } from './metadatalegend';
import { SchematicEditor } from './schematiceditor';
import { NodeSchematicData } from '../nodeschematic';



const AC_SUGGESTION_TEMPLATE = document.querySelector(".autocomplete-suggestion") as HTMLElement;
AC_SUGGESTION_TEMPLATE.remove();


export class SelectUI extends MccUI {
  coreData: CoreSelectData;
  nodeSchematic: SchematicEditor;
  nodeDetails: NodeDetails;
  metadataLegend: MetadataLegend;
  previousConfidence: number;


  nodeHighlightCallback: HoverCallback;

  treeHints: HTMLElement[];

  resetZoomButton: HTMLButtonElement;


  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector, "#select .tree-canvas");
    const updateCallback: UpdateFunction = (data: ChartData)=>this.update(data);
    this.coreData = new CoreSelectData(sharedState, updateCallback);
    const dismissCallback: DismissNodeCallback = (nodeIndex: number | number[])=>this.handleNodeDismiss(nodeIndex);
    const nodeHighlightCallback: HoverCallback = (nodeIndex, date, mutation)=>this.updateHighlight(nodeIndex, date, mutation);
    let previousNode = UNSET
    const treeHoverCallback: NodeCallback = (nodeIndex: number)=>{
      if (nodeIndex !== previousNode) {
        // console.log(`${previousNode} --> handleNodeHover(${nodeIndex})`);
        previousNode = nodeIndex;
        this.handleNodeHover(nodeIndex, UNSET);
      }
    };
    const nodeSelectCallback: NodeCallback = (nodeIndex: number)=>this.selectNode(nodeIndex);
    const rootSelectCallback: NodeCallback = (nodeIndex: number)=>{
      /* reset the root of the mcc tree so that we can get the y position of any node */
      this.mccTreeCanvas.setRootNode(UNSET);
      this.coreData.selectRoot(nodeIndex);
    };
    const prevThresholdCallback: SET_PREVALENCE_CALLBACK_TYPE = (increment = true)=>this.coreData.updatePeakPrevalenceThreshold(increment);
    const metadataTransitionCallback: MetadataToggleCallback = (fieldName: string)=>{
      this.coreData.highlightMetadataTransitions(fieldName);
    };
    const toggleAutoSelectCallback = (active: boolean)=>{
      this.coreData.togglePeakPrevalenceSelection(active);
    };
    const clearCuratedCallback = ()=>this.coreData.clearCurated();
    const introsOnlyCallback = ()=>this.coreData.removeNonTransitions();
    const legendCallback: MultiNodeCallback = (nodeIndices: number[] | null)=>this.highlightNodes(nodeIndices);
    const canvas = this.mccTreeCanvas.getCanvas();
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.mccTreeCanvas = new SelectTreeCanvas(canvas, ctx, this.highlightCanvas, this.highlightCtx, treeHoverCallback, nodeSelectCallback);
    const { node } = this.coreData.getHighlights();
    (this.mccTreeCanvas as SelectTreeCanvas).highlightedNode = node;
    const subwayContainer = document.querySelector("#select--node-layout .subway") as HTMLDivElement;
    this.nodeSchematic = new SchematicEditor(subwayContainer, nodeHighlightCallback, prevThresholdCallback, metadataTransitionCallback,
      dismissCallback, rootSelectCallback, toggleAutoSelectCallback, clearCuratedCallback, introsOnlyCallback);
    this.nodeDetails = new NodeDetails(dismissCallback, nodeHighlightCallback, rootSelectCallback);
    this.metadataLegend = new MetadataLegend(legendCallback);
    this.nodeHighlightCallback = nodeHighlightCallback;
    this.treeHints = Array.from(this.div.querySelectorAll(".tree-hint") as NodeListOf<HTMLElement>);
    this.resetZoomButton = this.div.querySelector(".mcc-zoom-button.reset") as HTMLButtonElement;
    this.previousConfidence = this.sharedState.mccConfig.confidenceThreshold;

    const lookupForm = document.querySelector(".id-lookup form") as HTMLFormElement;
    lookupForm.addEventListener("submit", e => e.preventDefault());

    const constrainHoverByCredibilityInput = document.querySelector("#select--constrain-selection") as HTMLInputElement;
    constrainHoverByCredibilityInput.addEventListener('change', ()=>{
      this.coreData.setCredibilityConstrained(constrainHoverByCredibilityInput.checked);
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
        const selectedIds = this.coreData.getSelectedTipIds();
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
    this.coreData.activate();
    const mccConfig: MccConfig = this.sharedState.mccConfig;
    const metadataFields = mccConfig.metadata ? mccConfig.metadata.getFields() : [];
    this.nodeSchematic.setMetadataSelectors(metadataFields, this.coreData.getCurrentMetadataField());
    this.metadataLegend.setLegendData(mccConfig);
    // const [minDate, maxDate] = this.mccTreeCanvas.getDateRange();
  }

  deactivate() {
    super.deactivate();
    this.coreData.setNodeSelection();
    this.coreData.deactivate();

  }


  resize(): void {
    super.resize();
    this.nodeSchematic.resize();
  }




  handleConfigChange(): void {
    super.handleConfigChange();
    this.updateNodeData();
    // console.log('handleConfigChange', this.previousConfidence, this.sharedState.mccConfig.confidenceThreshold);
    if (this.previousConfidence !== this.sharedState.mccConfig.confidenceThreshold) {
      this.previousConfidence = this.sharedState.mccConfig.confidenceThreshold;
      this.coreData.updateConfidenceThreshold(this.previousConfidence);
    }
    const mccConfig: MccConfig = this.sharedState.mccConfig;
    const metadataFields = mccConfig.metadata ? mccConfig.metadata.getFields() : [];
    this.nodeSchematic.setMetadataSelectors(metadataFields, this.coreData.getCurrentMetadataField());
    this.metadataLegend.setLegendData(mccConfig);
  }


  protected updateData(): Promise<SummaryTree> {
    const prom = new Promise((resolve: DataResolveType)=>{
      super.updateData()
        .then((summary:SummaryTree)=>{
          this.updateNodeData();
          this.requestDraw();
          resolve(summary);
        })
    });
    return prom;
  }

  private updateNodeData() : void {
    if (this.pythia) {
      const mccRef = this.pythia.getMcc();
      this.coreData.initNodeData(this.mccTreeCanvas, this.isApobecEnabled);
      mccRef.release();
    }
  }


  setChartData(): void {
    this.coreData.setChartData();
  }

  update(chartData: ChartData): void {
    const { nodes, nodePairs, rootNode, selectedRootIndex, peakPrevalence,
      metadataField, isFullyAuto, schematicData } = chartData;
    const {node} = this.coreData.getHighlights();
    const actualNodes = nodes.filter(dnc=>dnc.index !== UNSET);
    let highlightNode = node;
    (this.mccTreeCanvas as SelectTreeCanvas).setNodes(actualNodes, nodePairs, selectedRootIndex);
    this.nodeSchematic.setPrevalenceSelectors(true, peakPrevalence);
    this.nodeSchematic.setData(schematicData as NodeSchematicData);
    this.nodeSchematic.setControlsData(nodes.length, metadataField, isFullyAuto);
    this.nodeSchematic.setLayout();
    this.nodeSchematic.highlightNode(highlightNode ? highlightNode.index : UNSET);
    if (highlightNode === null || highlightNode.index === UNSET) {
      highlightNode = rootNode?.node as DisplayNode;
    }
    this.nodeDetails.setData(highlightNode);
    this.metadataLegend.highlight(highlightNode.index);
    this.requestDraw();
  }

  requestDraw() {
    (this.mccTreeCanvas as SelectTreeCanvas).requestDrawSelection();
    this.nodeSchematic.requestRender();
    this.nodeDetails.requestDraw();
    this.metadataLegend.requestDraw();
  }




  /* invoked by the tree when hovering a node */
  handleNodeHover(nodeIndex: number, date:number):void {
    this.coreData.hoverNode(nodeIndex, date);
    /* if this is a node that we have selected, highlight it */
    // const selected = this.coreData.getSelection(nodeIndex);
    // if (selected && selected.isLocked) {
    //   this.nodeDetails.setData(selected);
    // } else {
    //   this.nodeDetails.setData(this.coreData.getRootNode());
    // }

  }


  updateHighlight(nodeIndex: number, date: number, mutation: Mutation | null) {
    if (this.coreData.checkNewHighlight(nodeIndex, date, mutation)) {
      this.highlightCharts();
    }
  }

  highlightNodes(nodeIndices: number[] | null) {
    requestAnimationFrame(()=>{
      (this.mccTreeCanvas as SelectTreeCanvas).highlightNodes(nodeIndices);
      this.nodeSchematic.highlightNodes(nodeIndices);
    });
  }




  highlightCharts() {
    // const { node, date, mutation } = this.coreData.getHighlights();
    const { node, date } = this.coreData.getHighlights();
    (this.mccTreeCanvas as SelectTreeCanvas).highlightNode(node, date);
    let highlightNode = node;
    if (highlightNode === null || highlightNode.index === UNSET) {
      highlightNode = this.coreData.getRootNode();
    }
    this.nodeDetails.setData(highlightNode);
    this.nodeDetails.requestDraw();
    this.nodeSchematic.highlightNode(node.index);
    this.metadataLegend.highlight(node.index);
  }

  selectNode(nodeIndex: number): void {
    this.coreData.selectNode(nodeIndex);
  }



  setSelectable(selectable: boolean) {
    this.coreData.setSelectable(selectable);
    const lookupInput = document.querySelector(".id-lookup--input") as HTMLInputElement;
    lookupInput.disabled = !this.coreData.selectionsAvailable();
  }

  setHint(hint: TreeHint) {
    const className = TREE_HINT_CLASSES[hint];
    requestAnimationFrame(()=>this.treeHints.forEach(th => th.classList.toggle("hidden", !th.classList.contains(className))));
  }


  handleNodeDismiss(nodeIndex: number | number[]): void {
    this.coreData.dismissNode(nodeIndex);
    // this.setChartData([this.coreData.rootIndex, this.coreData.mrcaIndex, this.coreData.nodeAIndex, this.coreData.nodeBIndex]);
    // this.highlightCharts(null, UNSET, null);
    // this.setHint(TreeHint.Hover);
  }


  handleNodeZoom(nodeIndex: number) : void {
    console.log(`handleNodeZoom(${nodeIndex}) not implemented`)
    // const zoomNode: DisplayNode | null = null;

    // // switch (node) {
    // // case DisplayNodeClass.mrca:
    // //   zoomNode = this.mrcaIndex;
    // //   break;
    // // case DisplayNodeClass.nodeA:
    // //   zoomNode = this.nodeAIndex;
    // //   break;
    // // case DisplayNodeClass.nodeB:
    // //   zoomNode = this.nodeBIndex;
    // //   break;
    // // }
    // if (zoomNode === null) {
    //   this.mccTreeCanvas.resetZoom();
    //   this.sharedState.mccConfig.resetZoom();
    // } else if (this.pythia) {
    //   const tips = this.pythia.getMccNodeTips(zoomNode),
    //     treeCanvas = this.mccTreeCanvas;
    //   treeCanvas.zoomToTips(tips);
    //   this.sharedState.mccConfig.setZoom(1, treeCanvas.verticalZoom, 0.5, treeCanvas.zoomCenterY);
    // }
    // super.requestTreeDraw();
    // this.nodeSchematic.highlightNode(zoomNode, null);
  }

  /*
  this step happens in the flow after the tree colors have been set.
  so we can take this moment to set the colors for the schematic
  */
  protected requestTreeDraw(): void {
    super.requestTreeDraw();
    const metadataColors = this.mccTreeCanvas.nodeColors.slice(0);
    this.sharedState.metadataColors = metadataColors;
    const colorByMetadata = this.sharedState.mccConfig.colorOption === ColorOption.metadata;
    this.nodeSchematic.setColorMethod(colorByMetadata, metadataColors);
    requestAnimationFrame(()=>this.nodeSchematic.render());
  }



  goToMutations: OpenMutationPageFncType = (mutation?: Mutation) => {
    if (mutation) {
      this.sharedState.addMutation(mutation);
      this.sharedState.goTo(Screens.analysis);
    }
  }
}

