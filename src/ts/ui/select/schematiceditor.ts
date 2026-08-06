import { getPercentLabel, nfc, SET_PREVALENCE_CALLBACK_TYPE, UNSET } from "../common";
import { NodeSchematic, SchematicNodeDisplay } from "../nodeschematic";
import { DismissNodeCallback, HoverCallback,
  MetadataToggleCallback, NodeCallback } from "./selectcommon";

const CONTROLS = document.querySelector("#select #select--schematic-controls") as HTMLDivElement;
const COUNT_SPAN = document.querySelector("#select--schematic-count") as HTMLSpanElement;
const AUTO_BUTTON = CONTROLS.querySelector("#select--schematic-auto") as HTMLButtonElement;
const CLEAR_BUTTON = CONTROLS.querySelector("#select--schematic-clear") as HTMLButtonElement;
const INTROS_ONLY = CONTROLS.querySelector("#select--intros-only") as HTMLParagraphElement;
const INTROS_ONLY_INPUT = INTROS_ONLY.querySelector("button") as HTMLButtonElement;

const PREVALENCE_THRESHOLD_LESS = CONTROLS.querySelector("#select--peak-prevalence-less") as HTMLButtonElement;
const PREVALENCE_THRESHOLD_MORE = CONTROLS.querySelector("#select--peak-prevalence-more") as HTMLButtonElement;
const PREVALENCE_THRESHOLD_READOUT = CONTROLS.querySelector("#select--peak-prevalence-readout") as HTMLSpanElement


export class SchematicEditor extends NodeSchematic {
  metadataTransitionCallback: MetadataToggleCallback;

  constructor(wrapper: HTMLDivElement,
    nodeHighlightCallback: HoverCallback,
    prevThresholdCallback: SET_PREVALENCE_CALLBACK_TYPE,
    metadataTransitionCallback: MetadataToggleCallback,
    dismissNodeCallback: DismissNodeCallback,
    rootSelectCallback: NodeCallback,
    toggleAutoSelectCallback: (active: boolean)=>void,
    clearCuratedCallback: ()=>void,
    introsOnlyCallback: ()=>void,
  ) {
    super(wrapper, nodeHighlightCallback);
    wrapper.classList.add('toimitaja');
    // PREVALENCE_THRESHOLD_SLIDER.addEventListener("input", ()=>{
    //   prevThresholdCallback(true, parseFloat(PREVALENCE_THRESHOLD_SLIDER.value));
    // });
    // // PREVALENCE_THRESHOLD_TOGGLE.addEventListener("input", ()=>{
    //   prevThresholdCallback(PREVALENCE_THRESHOLD_TOGGLE.checked, parseFloat(PREVALENCE_THRESHOLD_SLIDER.value));
    // });
    PREVALENCE_THRESHOLD_LESS.addEventListener("click", ()=>{
      prevThresholdCallback(false);
    });
    PREVALENCE_THRESHOLD_MORE.addEventListener("click", ()=>{
      prevThresholdCallback(true);
    });
    /*
    TODO:
    if this is the behavior we want, then this should be a checkbox.
    But is this the behavior we want?
    */
    AUTO_BUTTON.addEventListener("click", ()=>{
      const isAuto = AUTO_BUTTON.classList.contains("is-auto");
      toggleAutoSelectCallback(!isAuto);
    });
    CLEAR_BUTTON.addEventListener("click", clearCuratedCallback);
    INTROS_ONLY_INPUT.addEventListener("click", ()=>introsOnlyCallback());

    this.metadataTransitionCallback = metadataTransitionCallback;
    const dismissButton = this.hoverDiv.querySelector(".subway--node-dismiss") as HTMLButtonElement;
    const setRootButton = this.hoverDiv.querySelector(".subway--set-root") as HTMLButtonElement;
    const resetRootButton = this.hoverDiv.querySelector(".subway--reset-root") as HTMLButtonElement;

    dismissButton.addEventListener("click", ()=>{
      const tnd: SchematicNodeDisplay | undefined = this.nodes.filter(n=>n.getIndex() === this.highlightIndex)[0];
      if (tnd) {
        dismissNodeCallback(this.highlightIndex);
      }
      this.highlightIndex = UNSET;
      this.setHighlightNode();
      this.hideHover();
    });
    setRootButton.addEventListener("click", ()=>{
      const tnd: SchematicNodeDisplay | undefined = this.nodes.filter(n=>n.getIndex() === this.highlightIndex)[0];
      if (tnd) {
        rootSelectCallback(tnd.getIndex());
        this.hideHover();
      }
    });
    resetRootButton.addEventListener('click', () => {
      rootSelectCallback(UNSET);
      this.hideHover();
    });

  }


  setPrevalenceSelectors(prevalenceActive: boolean, peakPrevalence: number) : void {
    const pct = getPercentLabel(peakPrevalence);
    PREVALENCE_THRESHOLD_READOUT.textContent = `${pct}%`;
  }

  /*
  @param pairs: contains mutation data for each track that we will display.
  @param rootNode: the root node of the tree we will display.
    We can traverse the entire tree by traversing the children of each node.
  */
  setControlsData(nodeCount: number, metadataField: string | null, isFullyAuto: boolean) {
    INTROS_ONLY.classList.toggle("na", metadataField === null);
    COUNT_SPAN.textContent = `${nfc(nodeCount)} node${ nodeCount === 1 ? '' : 's'}` ;
    AUTO_BUTTON.classList.toggle("is-auto", isFullyAuto);
  }

}