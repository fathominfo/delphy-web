import { getPercentLabel, nfc, SET_PREVALENCE_CALLBACK_TYPE, UNSET } from "../common";
import { NodeSchematic, SchematicNodeDisplay } from "../nodeschematic";
import { DismissNodeCallback, HoverCallback, METADATA_NONE_OPTION,
  MetadataToggleCallback, NodeCallback } from "./selectcommon";

const METADATA_FIELD_SELECTOR = "#select--metadata-transitions label";

const CONTROLS = document.querySelector("#select #select--schematic-controls") as HTMLDivElement;
const COUNT_SPAN = document.querySelector("#select--schematic-count") as HTMLSpanElement;
const AUTO_BUTTON = CONTROLS.querySelector("#select--schematic-auto") as HTMLButtonElement;
const CLEAR_BUTTON = CONTROLS.querySelector("#select--schematic-clear") as HTMLButtonElement;
const INTROS_ONLY = CONTROLS.querySelector("#select--intros-only") as HTMLParagraphElement;
const INTROS_ONLY_INPUT = INTROS_ONLY.querySelector("button") as HTMLButtonElement;

const PREVALENCE_THRESHOLD_LESS = CONTROLS.querySelector("#select--peak-prevalence-less") as HTMLButtonElement;
const PREVALENCE_THRESHOLD_MORE = CONTROLS.querySelector("#select--peak-prevalence-more") as HTMLButtonElement;
const PREVALENCE_THRESHOLD_READOUT = CONTROLS.querySelector("#select--peak-prevalence-readout") as HTMLSpanElement
const METADATA_TRANSITION_TEMPLATE = CONTROLS.querySelector(METADATA_FIELD_SELECTOR) as HTMLDivElement;
const METADATA_PARENT = METADATA_TRANSITION_TEMPLATE.parentNode as HTMLDivElement;
METADATA_TRANSITION_TEMPLATE.remove();


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

  setMetadataSelectors(metadataFields : string[], current: string | null) : void {
    if (metadataFields.length !== this.metadataFieldCount) {
      METADATA_PARENT.querySelectorAll(METADATA_FIELD_SELECTOR).forEach((ele:Element)=>{
        ele.remove();
      });
      let anyChecked = false;
      const addMetadaOption = (mdField:string, label: string, checked=false)=>{
        if (mdField.toLowerCase() === "id" || mdField.toLowerCase() === "accession" ) return;
        const mdDiv = METADATA_TRANSITION_TEMPLATE.cloneNode(true) as HTMLDivElement;
        const input = mdDiv.querySelector("input") as HTMLInputElement;
        const fieldSpan = mdDiv.querySelector(".select--metadata-field") as HTMLSpanElement;
        fieldSpan.textContent = label;
        input.checked = !!checked;
        input.addEventListener("input", ()=>{
          this.metadataTransitionCallback(mdField);
        });
        METADATA_PARENT.appendChild(mdDiv);
        if (checked) anyChecked = true;
      };
      metadataFields.forEach(field=>addMetadaOption(field, field, field === current));
      addMetadaOption(METADATA_NONE_OPTION, 'None', !anyChecked);
      this.metadataFieldCount = metadataFields.length;
    }
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