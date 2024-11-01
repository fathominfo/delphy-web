import {MccRef} from '../../pythia/mccref';
import {PhyloTree} from '../../pythia/delphy_api';
import {MU_FACTOR, FINAL_POP_SIZE_FACTOR, POP_GROWTH_RATE_FACTOR, RunParamConfig, copyDict, STAGES} from '../../constants';
import {TreeCanvas, instantiateTreeCanvas} from '../treecanvas';
import {MccTreeCanvas, instantiateMccTreeCanvas} from '../mcctreecanvas';
import {HistCanvas} from './histcanvas';
import { TreeScrubber, sampleListenerType } from './treescrubber';
import {DateLabel} from '../datelabel';
import {nfc, getTimelineIndices, getTimestampString, getPercentLabel, UNSET} from '../common';
import {SoftFloat} from '../../util/softfloat.js';
import {UIScreen} from '../uiscreen';
import {SharedState} from '../../sharedstate';
import { kneeListenerType } from './runcommon';
import { BlockSlider } from '../../util/blockslider';
import { BurninPrompt } from './burninprompt';
import { setStage } from '../../errors';

const DAYS_PER_YEAR = 365;
const POP_GROWTH_FACTOR = Math.log(2) / DAYS_PER_YEAR;
const RESET_MESSAGE = `Updating this setting will erase your current progress and start over.\nDo you wish to continue?`;


// const enum restartOption {
//   CANCEL = 2,
//   RESTART_AND_REFRESH = 1,
//   RESTART_ONLY = 3
// }

export class RunUI extends UIScreen {
  mccRef: MccRef | null;

  private runControl: HTMLInputElement;

  private stepCountText: HTMLSpanElement;
  private treeCountText: HTMLSpanElement;
  private mccTreeCountText: HTMLSpanElement;

  private stepCountPluralText: HTMLSpanElement;

  private treeCanvas: TreeCanvas;
  private mccTreeCanvas: MccTreeCanvas;
  private treeScrubber: TreeScrubber;

  private logPosteriorCanvas: HistCanvas;
  private muCanvas: HistCanvas;
  private muStarCanvas: HistCanvas;
  private TCanvas: HistCanvas;
  private mutCountCanvas: HistCanvas;
  private popGrowthCanvas: HistCanvas;
  private histCanvases: HistCanvas[];

  private credibilityInput: BlockSlider;
  private burnInWrapper: HTMLDivElement;
  private burnInToggle: HTMLInputElement;
  private hideBurnIn: boolean;
  private minDate:SoftFloat;
  private mccMinDate:SoftFloat;
  private timelineIndices:DateLabel[];
  private mccTimelineIndices:DateLabel[];
  private baseTree: PhyloTree | null;

  private burninPrompt: BurninPrompt;



  is_running: boolean;
  private timerHandle:number;
  runControlHandler:()=>void;


  stepCount: number;
  maxDate:number;
  mccIndex: number;
  private drawHandle: number;
  private runParams: RunParamConfig;


  advanced: HTMLElement;
  // mutationRateFieldset: HTMLFieldSetElement;
  siteHeterogeneityToggle: HTMLInputElement;
  fixedRateToggle: HTMLInputElement;
  mutationRateLabel: HTMLLabelElement;
  mutationRateInput: HTMLInputElement;
  // apobecFieldset: HTMLFieldSetElement;
  apobecToggle: HTMLInputElement;
  fixedFinalPopSizeToggle: HTMLInputElement;
  fixedFinalPopSizeLabel: HTMLLabelElement;
  fixedFinalPopSizeInput: HTMLInputElement;
  fixedPopGrowthRateToggle: HTMLInputElement;
  fixedPopGrowthRateLabel: HTMLLabelElement;
  fixedPopGrowthRateInput: HTMLInputElement;


  /* useful when updating the advanced run parameters */
  disableAnimation: boolean;

  kneeHandler : kneeListenerType;


  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector);
    const DEBOUNCE_TIME = 100; // ms
    let lastRequestedBurnInPct = -1;

    this.kneeHandler = (pct:number)=>{
      this.burnInToggle.disabled = pct <= 0;
      if (this.pythia) {
        const currentKnee = this.pythia.kneeIndex;
        if (pct > 0 && this.sharedState.kneeIsCurated) {
          requestAnimationFrame(()=>this.burnInWrapper.classList.remove("unset"));
        }
        lastRequestedBurnInPct = pct;
        /* wait until the pct has settled before requesting the mcc */
        setTimeout(()=>{
          console.debug(`lastRequestedBurnInPct ${lastRequestedBurnInPct}    pct ${pct}`);
          if (this.pythia && pct === lastRequestedBurnInPct) {
            this.pythia.setKneeIndexByPct(pct);
            this.pythia.recalcMccTree().then(()=>{
              if (currentKnee !== this.pythia?.kneeIndex) {
                this.updateRunData();
              }
            });
          }
        }, DEBOUNCE_TIME);
      }
    };

    const curatedKneeHandler = (pct:number)=>{
      this.sharedState.kneeIsCurated = true;
      this.kneeHandler(pct);
    }

    const sampleHandler: sampleListenerType = ()=>{
      this.updateRunData();
    };

    this.mccRef = null;
    this.treeCanvas = instantiateTreeCanvas("#ui");
    this.mccTreeCanvas = instantiateMccTreeCanvas("#ui_mcc");
    this.runControl = document.querySelector("#run-input") as HTMLInputElement;
    this.stepCountText = document.querySelector("#run-steps .digit") as HTMLSpanElement;
    this.treeCountText = document.querySelector("#run-trees") as HTMLSpanElement;
    this.mccTreeCountText = document.querySelector("#run-mcc") as HTMLSpanElement;
    this.stepCountPluralText = document.querySelector("#run-steps .plural") as HTMLSpanElement;
    this.burnInWrapper = document.querySelector("#burn-in-wrapper") as HTMLDivElement;
    this.burnInToggle = this.burnInWrapper.querySelector("#burn-in-toggle") as HTMLInputElement;
    this.runControlHandler = ()=> this.set_running();
    const stepSelector = (document.querySelector("#step-options") as HTMLSelectElement);
    const prevStepPower = stepSelector.value;
    this.treeScrubber = new TreeScrubber(document.querySelector(".tree-scrubber") as HTMLElement, sampleHandler);

    this.mutCountCanvas = new HistCanvas("Number of Mutations", '', curatedKneeHandler);
    this.logPosteriorCanvas = new HistCanvas("ln(Posterior)", '', curatedKneeHandler);
    this.muCanvas = new HistCanvas("Mutation Rate μ", "&times; 10<sup>&minus;5</sup> mutations / site / year", curatedKneeHandler);
    this.muStarCanvas = new HistCanvas("APOBEC Mutation Rate", "&times; 10<sup>&minus;5</sup> mutations / site / year", curatedKneeHandler);
    this.TCanvas = new HistCanvas("Total Evolutionary Time", 'years', curatedKneeHandler);
    this.popGrowthCanvas = new HistCanvas("Doubling time", 'years', curatedKneeHandler);
    this.histCanvases = [this.mutCountCanvas, this.logPosteriorCanvas, this.muCanvas, this.muStarCanvas, this.TCanvas, this.mutCountCanvas, this.popGrowthCanvas];
    this.mutCountCanvas.isDiscrete = true;
    this.hideBurnIn = false;
    this.timelineIndices = [];
    this.mccTimelineIndices = [];
    this.minDate = new SoftFloat(0, 0.75, 0.3);
    this.mccMinDate = new SoftFloat(0, 0.75, 0.3);
    this.is_running = false;
    this.timerHandle = 0;
    this.stepCount = -1;
    this.maxDate = -1;
    this.mccIndex = -1
    this.baseTree = null;
    this.drawHandle = 0;
    const exportButton = this.div.querySelector("#runner--export-csv") as HTMLButtonElement;

    const openAdvancedButton = this.div.querySelector("#advanced-toggle") as HTMLButtonElement;
    this.advanced = this.div.querySelector("#runner--advanced") as HTMLElement;
    // this.mutationRateFieldset = this.div.querySelector(".mutation-rate-fieldset") as HTMLFieldSetElement,
    this.siteHeterogeneityToggle = this.div.querySelector("#site-rate-heterogeneity-toggle") as HTMLInputElement,
    this.fixedRateToggle = this.div.querySelector("#fixed-mutation-rate-toggle") as HTMLInputElement,
    this.mutationRateLabel = this.div.querySelector("#overall-mutation-rate-label") as HTMLLabelElement,
    this.mutationRateInput = this.div.querySelector("#overall-mutation-rate-input") as HTMLInputElement;
    // this.apobecFieldset = this.div.querySelector(".apobec-fieldset") as HTMLFieldSetElement,
    this.apobecToggle = this.div.querySelector("#apobec-toggle") as HTMLInputElement;
    this.fixedFinalPopSizeToggle = this.div.querySelector("#fixed-final-pop-size-toggle") as HTMLInputElement,
    this.fixedFinalPopSizeLabel = this.div.querySelector("#overall-final-pop-size-label") as HTMLLabelElement,
    this.fixedFinalPopSizeInput = this.div.querySelector("#overall-final-pop-size-input") as HTMLInputElement;
    this.fixedPopGrowthRateToggle = this.div.querySelector("#fixed-pop-growth-rate-toggle") as HTMLInputElement,
    this.fixedPopGrowthRateLabel = this.div.querySelector("#overall-pop-growth-rate-label") as HTMLLabelElement,
    this.fixedPopGrowthRateInput = this.div.querySelector("#overall-pop-growth-rate-input") as HTMLInputElement;

    this.burninPrompt = new BurninPrompt();

    this.disableAnimation = false;

    this.burnInToggle.addEventListener('change', ()=>{
      this.hideBurnIn = this.burnInToggle.checked;
      this.sharedState.hideBurnIn = this.hideBurnIn;
      this.updateRunData();
    });
    const credibilityCallback = (value: number) => {
      const pct = value / 100;
      this.sharedState.mccConfig.setConfidence(pct);
      this.setCladeCred();
    }
    this.credibilityInput = new BlockSlider((this.div.querySelector(".mcc-opt--confidence-range") as HTMLElement), credibilityCallback);

    stepSelector.addEventListener('input', ()=>{
      const power = parseInt(stepSelector.value);
      this.setStepsPerRefresh(power);
    });
    exportButton.addEventListener("click", ()=>{
      if (this.pythia) {
        const {log} = this.pythia.getBeastOutputs(),
          blob = new Blob([log], { type: 'text/csv;charset=utf-8;' }),
          url = URL.createObjectURL(blob),
          a = document.createElement("a"),
          title = `delphy-parameters-${getTimestampString()}.tsv`;
        a.href = url;
        a.download = title;
        document.body.appendChild(a);
        a.click();
        setTimeout(()=>a.remove(), 10000);
      }

    });

    const restartWarning = this.div.querySelector(".warning-text") as HTMLElement;
    const submitAdvancedButton = this.div.querySelector(".advanced--submit-button") as HTMLButtonElement;
    openAdvancedButton.addEventListener("click", ()=>{
      this.advanced.classList.remove("hidden");
      restartWarning.classList.add("hidden");
      submitAdvancedButton.innerText = (this.stepCount === 0) ? "Confirm" : "Restart with selected options";
      submitAdvancedButton.classList.toggle("warning-button", this.stepCount > 0);
    });

    // this.siteHeterogeneityToggle.addEventListener("change", () => {
    //   this.apobecFieldset.disabled = this.siteHeterogeneityToggle.checked;
    // });
    this.fixedRateToggle.addEventListener("change", () => {
      this.mutationRateInput.disabled = !this.fixedRateToggle.checked;
    });
    this.fixedFinalPopSizeToggle.addEventListener("change", () => {
      this.fixedFinalPopSizeInput.disabled = !this.fixedFinalPopSizeToggle.checked;
    });
    this.fixedPopGrowthRateToggle.addEventListener("change", () => {
      this.fixedPopGrowthRateInput.disabled = !this.fixedPopGrowthRateToggle.checked;
    });
    // this.apobecToggle.addEventListener("change", ()=>{
    //   this.mutationRateFieldset.disabled = this.apobecToggle.checked;
    // });
    const advancedCancelButton = this.div.querySelector(".advanced--cancel-button") as HTMLButtonElement;
    const advancedCloseButton = this.div.querySelector(".close-button") as HTMLButtonElement;
    [advancedCancelButton, advancedCloseButton].forEach(button => button.addEventListener("click", () => {
      this.advanced.classList.add("hidden");
    }));
    const advancedForm = document.querySelector(".runner--advanced--content") as HTMLFormElement;
    advancedForm.addEventListener("input", () => {
      const willRestart = this.getWillRestart();
      if (this.stepCount > 0) {
        restartWarning.classList.toggle("hidden", !willRestart);
      }
      submitAdvancedButton.disabled = !willRestart;
    });
    advancedForm.addEventListener("submit", e => this.submitAdvancedOptions(e));
    this.advanced.addEventListener("click", e => {
      if (e.target === this.advanced) {
        e.preventDefault();
        this.advanced.classList.add("hidden");
      }
    });
    window.addEventListener("keydown", e => {
      if (e.key === "Escape" && !this.advanced.classList.contains("hidden")) {
        this.advanced.classList.add("hidden");
      }
    })

    const power = parseInt(prevStepPower);
    this.runParams = {
      stepsPerSample: Math.pow(10, power),
      mutationRate: 1.0,
      apobecEnabled: false,
      siteRateHeterogeneityEnabled: false,
      mutationRateIsFixed: false,
      finalPopSizeIsFixed: false,
      finalPopSize: 3.0, // years
      popGrowthRateIsFixed: false,
      popGrowthRate: 0.0  // e-foldings / year
    }
  }




  activate():void {
    super.activate();
    setStage(STAGES.loaded);
    if (this.sharedState.hideBurnIn) {
      this.hideBurnIn = this.sharedState.hideBurnIn;
      this.burnInToggle.checked = this.sharedState.hideBurnIn;
    }
    if (this.pythia && this.pythia.kneeIndex > 0) this.burnInToggle.disabled = false;
    this.runControl.addEventListener("change", this.runControlHandler);
    this.credibilityInput.set(this.sharedState.mccConfig.confidenceThreshold * 100);
    this.setParamsFromRun();
    setTimeout(()=>this.runControl.focus(), 100);
  }

  setParamsFromRun() : void {
    const params = this.runParams,
      pythia = this.sharedState.pythia,
      currentMu = pythia.getCurrentMu(),
      currentFinalPopSize = pythia.getFinalPopSize(),
      currentPopGrowthRate = pythia.getPopGrowthRate();
    /* TODO: why is pythia getting a mutation rate of 1 in some cases?  */
    params.stepsPerSample = pythia.stepsPerSample;
    params.apobecEnabled = pythia.getIsApobecEnabled();
    params.siteRateHeterogeneityEnabled = pythia.getSiteRateHeterogeneityEnabled();
    params.mutationRateIsFixed = !pythia.getdMutationRateMovesEnabled();
    params.mutationRate = params.mutationRateIsFixed ? currentMu : UNSET;
    params.finalPopSizeIsFixed = !pythia.getFinalPopSizeMovesEnabled();
    params.finalPopSize = params.finalPopSizeIsFixed ? currentFinalPopSize : UNSET;
    params.popGrowthRateIsFixed = !pythia.getPopGrowthRateMovesEnabled();
    params.popGrowthRate = params.popGrowthRateIsFixed ? currentPopGrowthRate : UNSET;
    const currentStepSetting = Math.round(Math.log(params.stepsPerSample) / Math.log(10));

    (document.querySelector("#step-options") as HTMLSelectElement).value = `${currentStepSetting}`;

    this.isApobecEnabled = params.apobecEnabled;

    // update checks
    this.siteHeterogeneityToggle.checked = params.siteRateHeterogeneityEnabled;
    this.fixedRateToggle.checked = params.mutationRateIsFixed;
    this.apobecToggle.checked = params.apobecEnabled;
    this.fixedFinalPopSizeToggle.checked = params.finalPopSizeIsFixed;
    this.fixedPopGrowthRateToggle.checked = params.popGrowthRateIsFixed;
    this.mutationRateInput.disabled = !params.mutationRateIsFixed;
    this.fixedFinalPopSizeInput.disabled = !params.finalPopSizeIsFixed;
    this.fixedPopGrowthRateInput.disabled = !params.popGrowthRateIsFixed;
    // set field values
    const muFixed = (currentMu * MU_FACTOR).toFixed(2);
    this.mutationRateInput.value = `${muFixed}`;
    const finalPopSizeFixed = (currentFinalPopSize * FINAL_POP_SIZE_FACTOR).toFixed(2);
    this.fixedFinalPopSizeInput.value = `${finalPopSizeFixed}`;
    const popGrowthRateFixed = (currentPopGrowthRate * POP_GROWTH_RATE_FACTOR).toFixed(2);
    this.fixedPopGrowthRateInput.value = `${popGrowthRateFixed}`;

    // toggle canvases
    this.toggleHistCanvasVisibility(this.muCanvas, !params.mutationRateIsFixed);
    this.toggleHistCanvasVisibility(this.muStarCanvas, this.isApobecEnabled);
    this.toggleHistCanvasVisibility(this.popGrowthCanvas, !params.popGrowthRateIsFixed);

    // disable fieldsets
    // this.mutationRateFieldset.disabled = params.apobecEnabled;
    // this.apobecFieldset.disabled = params.mutationRateIsFixed || params.siteRateHeterogeneityEnabled;

    const treeCount = pythia.treeHist.length;
    if (treeCount > 1) {
      const kneeIndex = pythia.kneeIndex;
      if (kneeIndex > 0) {
        this.sharedState.kneeIsCurated = true;
        this.burnInWrapper.classList.remove("pre");
        this.burnInWrapper.classList.remove("unset");
      } else {
        //
      }
    }


    console.log(`pythia? ${!!this.pythia}`, currentMu, params);
  }

  setCladeCred() : void {
    const confValue = `${getPercentLabel(this.sharedState.mccConfig.confidenceThreshold)}`;
    this.div.querySelectorAll(".cred-threshold").forEach(ele=>{
      (ele as HTMLSpanElement).innerText = `${confValue}%`;
    });
    this.credibilityInput.set(this.sharedState.mccConfig.confidenceThreshold * 100);
    this.mccTreeCanvas.confidenceThreshold = this.sharedState.mccConfig.confidenceThreshold;
    this.mccTreeCanvas.colorsUnSet = true;
    if (this.mccTreeCanvas.tree) {
      this.mccTreeCanvas.setColors(this.mccTreeCanvas.tree);
      this.requestDraw();
    }
  }



  deactivate():void {
    if (this.is_running) {
      this.stop();
    }
    super.deactivate();
    this.runControl.removeEventListener("change", this.runControlHandler);

  }

  resize():void {
    this.mccTreeCanvas.sizeCanvas();
    this.treeScrubber.sizeCanvas();

    this.histCanvases.forEach(hc => {
      if (hc.isVisible) {
        hc.sizeCanvas();
      }
    });
    // this.logPosteriorCanvas.sizeCanvas();
    // this.muCanvas.sizeCanvas();
    // this.muStarCanvas.sizeCanvas();
    // this.TCanvas.sizeCanvas();
    // this.mutCountCanvas.sizeCanvas();

    const {width, height} = this.mccTreeCanvas,
      aspectRatio = width / height;
    this.treeCanvas.setAspectRatio(aspectRatio);
    if (!this.is_running) {
      this.updateRunData();
    }
  }

  pingPythiaForUpdate(): void {
    if (!this.pythia) return;
    const stepsHist = this.pythia.stepsHist,
      last = stepsHist.length - 1;
    if (this.stepCount === stepsHist[last]) return;
    this.updateRunData();
  }




  updateRunData():void {
    if (!this.pythia) return;
    const stepsHist = this.pythia.stepsHist,
      last = stepsHist.length - 1;
    if (this.treeScrubber.showLatestBaseTree) {
      this.baseTree = this.pythia.treeHist[last];
    } else {
      this.baseTree = this.pythia.treeHist[this.treeScrubber.sampledIndex];
    }
    if (this.baseTree) {
      // const run = this.pythia.run;
      const tree = this.baseTree;
      const earliestBaseDate = tree.getTimeOf(tree.getRootIndex());
      let earliestMCCDate = earliestBaseDate;
      const mccRef = this.pythia.getMcc();
      // console.debug(`RunUI set ${mccRef.getManager().id} ${mccRef.getRefNo()}`)
      this.baseTree = this.pythia.treeHist[last];
      this.stepCount = stepsHist[last] || 0;
      this.treeCanvas.positionTreeNodes(tree);
      if (mccRef) {
        const oldRef = this.mccRef;
        this.mccRef = mccRef;
        this.mccIndex = this.pythia.getMccIndex();
        // console.log(`this.mccIndex`, this.mccIndex)
        const mccTree = mccRef.getMcc(),
          nodeConfidence = mccRef.getNodeConfidence();
        if (mccTree !== this.mccTreeCanvas.tree) {
          this.mccTreeCanvas.positionTreeNodes(mccTree, nodeConfidence);
          this.sharedState.resetSelections();
        }
        earliestMCCDate = mccRef.getMcc().getTimeOf(mccTree.getRootIndex())
        if (oldRef) {
          oldRef.release();
        }
      }
      this.minDate.setTarget(earliestBaseDate);
      this.mccMinDate.setTarget(earliestMCCDate);
    }
    this.minDate.update();
    this.mccMinDate.update();
    this.timelineIndices = getTimelineIndices(this.minDate.value, this.pythia.maxDate);
    this.mccTimelineIndices = getTimelineIndices(this.mccMinDate.value, this.pythia.maxDate);
    const hideBurnIn = this.sharedState.hideBurnIn,
      mccIndex = this.mccIndex,
      sampleIndex = this.treeScrubber.showLatestBaseTree ? UNSET : this.treeScrubber.sampledIndex,
      {muHist, muStarHist, totalBranchLengthHist, logPosteriorHist, numMutationsHist, popGHist, kneeIndex} = this.pythia;
    this.treeScrubber.setData(last, kneeIndex, mccIndex);

    const muud = muHist.map(n=>n*MU_FACTOR);
    const totalLengthYear = totalBranchLengthHist.map(t=>t/DAYS_PER_YEAR);
    const popHistGrowth = popGHist.map(g=>POP_GROWTH_FACTOR/g);
    const serieses = [
      logPosteriorHist,
      muud,
      totalLengthYear,
      //numMutationsHist, // Exclude: # of mutations is too jumpy, so equilibrium variations are nowhere close to Gaussian
      //popHistGrowth,    // Exclude: double time is very volatile & equilibrium variations are nowhere close to Gaussian
    ];
    this.logPosteriorCanvas.setData(logPosteriorHist, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    this.muCanvas.setData(muud, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    if (this.isApobecEnabled) {
      const muudStar = muStarHist.map(n=>n*MU_FACTOR);
      this.muStarCanvas.setData(muudStar, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
      serieses.push(muudStar);
    }
    this.TCanvas.setData(totalLengthYear, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    this.mutCountCanvas.setData(numMutationsHist, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    this.popGrowthCanvas.setData(popHistGrowth, kneeIndex, mccIndex, hideBurnIn, sampleIndex);

    if (!this.sharedState.kneeIsCurated) {
      const candidateIndex = this.burninPrompt.evalAllSeries(serieses);
      if (candidateIndex > 0) {
        /* calculate the pct */
        const pct = 1.0 * candidateIndex / last;
        this.kneeHandler(pct);
        // this.announceAutoKnee(candidateIndex, pct);
      }
    }
    this.requestDraw();
    // console.log('mu', this.pythia.getCurrentMu(), this.pythia.getdMutationRateMovesEnabled());
    if (this.disableAnimation || (this.minDate.atTarget() && this.mccMinDate.atTarget())) {
      if (this.drawHandle !== 0) {
        clearInterval(this.drawHandle);
        this.drawHandle = 0;
      }
    // } else if (this.drawHandle === 0) {
    //   this.drawHandle = window.setInterval(()=> this.pingPythiaForUpdate(), 30);
    }
  }

  private requestDraw():void {
    requestAnimationFrame(()=>this.draw());
  }

  private draw():void {
    if (this.pythia) {
      const {stepCount, minDate}  = this;
      const {maxDate} = this.pythia;
      // const mccRef = this.pythia.getMcc();
      this.treeCanvas.draw(minDate.value, maxDate, this.timelineIndices);
      let treeCount = 0,
        mccCount = 0;
      if (this.mccRef) {
        /* for safety, add extra ref while drawing */
        const drawRef = this.pythia.getMcc(),
          mcc = drawRef.getMcc();
        try {
          this.mccTreeCanvas.draw(this.mccMinDate.value, maxDate, this.mccTimelineIndices);
        } catch (ex) {
          console.debug(`error on id ${this.mccRef.getManager().id}`, ex);
        }
        treeCount = this.pythia.getBaseTreeCount();
        mccCount = mcc.getNumBaseTrees();
        drawRef.release();
        this.mccRef.release();
      } else {
        // console.debug('no mcc ref available')
      }
      this.logPosteriorCanvas.draw();
      this.muCanvas.draw();
      if (this.isApobecEnabled) {
        this.muStarCanvas.draw();
      }
      this.TCanvas.draw();
      this.mutCountCanvas.draw();
      this.popGrowthCanvas.draw();
      this.stepCountText.innerHTML = `${nfc(stepCount)}`;
      this.treeCountText.innerHTML = `${nfc(treeCount)}`;
      this.mccTreeCountText.innerHTML = `${nfc(mccCount)}`;
      let stepCountPlural = 's';
      if (stepCount === 1) {
        stepCountPlural = '';
      }
      if (treeCount > 1) {
        this.burnInWrapper.classList.remove("pre");
      }
      this.stepCountPluralText.innerHTML = stepCountPlural;

      const treeCountPluralText = (this.treeCountText.parentElement as HTMLElement).querySelector(".plural") as HTMLElement;
      treeCountPluralText.classList.toggle("hidden", treeCount === 1);
    }
  }

  start():void {
    if (this.timerHandle === 0) {
      this.updateRunData();
      this.timerHandle = setInterval(()=>this.pingPythiaForUpdate(), 30) as unknown as number;
    }
    if (this.pythia) {
      this.is_running = true;
      this.runControl.checked = true;
      this.pythia.startRun(null);
    }
  }

  stop():void {
    if (this.timerHandle !== 0) {
      clearTimeout(this.timerHandle);
      this.timerHandle = 0;
    }
    if (this.pythia) {
      this.is_running = false;
      this.runControl.checked = false;
      this.pythia.pauseRun();
    }
  }


  private toggleHistCanvasVisibility(canvas: HistCanvas, showIt: boolean) : void {
    canvas.setVisible(showIt);

    this.histCanvases.forEach(hc => {
      if (hc.isVisible) {
        hc.sizeCanvas();
        hc.draw();
      }
    });
  }



  private set_running() : void {
    this.is_running = this.runControl.checked;
    if (this.is_running) {
      this.start();
    } else {
      this.stop();
    }
  }


  private submitAdvancedOptions(e: SubmitEvent): void {
    e.preventDefault();

    const form = e.target as HTMLFormElement;
    const formData = Object.fromEntries(new FormData(form));

    let newParams: RunParamConfig;

    const isSiteHeterogeneity = formData.isSiteHeterogeneity === "on";
    const siteMutationRate = (formData.siteMutationRate !== undefined) ?
      parseFloat(formData.siteMutationRate as string) : this.runParams.mutationRate;
    newParams = this.setSiteRateHeterogeneityEnabled(this.runParams, isSiteHeterogeneity, siteMutationRate);

    const isFixedMutationRate = formData.isFixedMutationRate === "on";
    const overallMutationRate = (formData.overallMutationRate !== undefined) ?
      parseFloat(formData.overallMutationRate as string) : this.runParams.mutationRate;
    newParams = this.fixMutationRate(newParams, isFixedMutationRate, overallMutationRate);

    const isFixedFinalPopSize = formData.isFixedFinalPopSize === "on";
    const overallFinalPopSize = (formData.overallFinalPopSize !== undefined) ?
      parseFloat(formData.overallFinalPopSize as string) : this.runParams.finalPopSize;
    newParams = this.fixFinalPopSize(newParams, isFixedFinalPopSize, overallFinalPopSize);

    const isFixedPopGrowthRate = formData.isFixedPopGrowthRate === "on";
    const overallPopGrowthRate = (formData.overallPopGrowthRate !== undefined) ?
      parseFloat(formData.overallPopGrowthRate as string) : this.runParams.popGrowthRate;
    newParams = this.fixPopGrowthRate(newParams, isFixedPopGrowthRate, overallPopGrowthRate);

    const isApobec = formData.isApobec === "on";
    newParams = this.setApobec(newParams, isApobec);

    this.confirmRestart(newParams);
  }


  private confirmRestart(newParams: RunParamConfig, skipDialog=true): void {
    this.advanced.classList.add("hidden");

    const currentStepCount: number = this.pythia ? this.pythia.stepsHist.length  : 0,
      currentRunWouldBeErased = currentStepCount > 1;
    if (currentRunWouldBeErased) {
      if (!this.pythia) {
        throw new Error("pythia interface unavalailable, cannot restart");
      }
      const okToGo = skipDialog || window.confirm(RESET_MESSAGE);
      if (okToGo) {
        setStage(STAGES.resetting);
        if (this.mccRef) {
          this.mccRef.release();
          this.mccRef = null;
        }
        this.div.classList.add('reloading');
        this.disableAnimation = true;
        this.pythia.reset(newParams).then(()=>{
          this.div.classList.remove('reloading');
          this.stepCount = 0;
          this.setParamsFromRun();
          this.disableAnimation = false;
          setStage(STAGES.loaded);
        });
      } else {
        // they canceled
        this.setParamsFromRun();
      }
    } else {
      if (this.pythia) {
        this.pythia.setParams(newParams);
      }
      this.setParamsFromRun();
      this.updateRunData();

    }
  }

  private getWillRestart(): boolean {
    if (this.siteHeterogeneityToggle.checked !== this.runParams.siteRateHeterogeneityEnabled) return true;
    if (this.fixedRateToggle.checked !== this.runParams.mutationRateIsFixed) return true;
    const currentMu = this.sharedState.pythia.getCurrentMu();
    if (parseFloat(this.mutationRateInput.value).toFixed(2) !== (currentMu * MU_FACTOR).toFixed(2)) return true;
    const currentFinalPopSize = this.sharedState.pythia.getFinalPopSize();
    if (parseFloat(this.fixedFinalPopSizeInput.value).toFixed(2) !== (currentFinalPopSize * FINAL_POP_SIZE_FACTOR).toFixed(2)) return true;
    const currentPopGrowthRate = this.sharedState.pythia.getPopGrowthRate();
    if (parseFloat(this.fixedPopGrowthRateInput.value).toFixed(2) !== (currentPopGrowthRate * POP_GROWTH_RATE_FACTOR).toFixed(2)) return true;
    if (this.apobecToggle.checked !== this.runParams.apobecEnabled) return true;
    if (this.fixedFinalPopSizeToggle.checked !== this.runParams.finalPopSizeIsFixed) return true;
    if (this.fixedPopGrowthRateToggle.checked !== this.runParams.popGrowthRateIsFixed) return true;
    return false;
  }

  private setStepsPerRefresh(stepPower:number): void {
    const newParams = copyDict(this.runParams) as RunParamConfig,
      steps = Math.pow(10, stepPower);
    newParams.stepsPerSample = steps;
    this.confirmRestart(newParams, false);
  }

  private setApobec(runParams: RunParamConfig, enabled:boolean): RunParamConfig {
    const newParams = copyDict(runParams) as RunParamConfig;
    newParams.apobecEnabled = enabled;
    return newParams;
  }

  private fixMutationRate(runParams: RunParamConfig, isFixed: boolean, rate: number) : RunParamConfig {
    const newParams = copyDict(runParams) as RunParamConfig;
    newParams.mutationRateIsFixed = isFixed;
    newParams.mutationRate = rate / MU_FACTOR;
    return newParams;
  }

  private fixFinalPopSize(runParams: RunParamConfig, isFixed: boolean, finalPopSize: number) : RunParamConfig {
    const newParams = copyDict(runParams) as RunParamConfig;
    newParams.finalPopSizeIsFixed = isFixed;
    newParams.finalPopSize = finalPopSize / FINAL_POP_SIZE_FACTOR;
    return newParams;
  }

  private fixPopGrowthRate(runParams: RunParamConfig, isFixed: boolean, rate: number) : RunParamConfig {
    const newParams = copyDict(runParams) as RunParamConfig;
    newParams.popGrowthRateIsFixed = isFixed;
    newParams.popGrowthRate = rate / POP_GROWTH_RATE_FACTOR;
    return newParams;
  }

  private setSiteRateHeterogeneityEnabled(runParams: RunParamConfig, enabled:boolean, rate: number) : RunParamConfig {
    const newParams = copyDict(runParams) as RunParamConfig;
    newParams.siteRateHeterogeneityEnabled = enabled;
    newParams.mutationRate = rate / MU_FACTOR;
    return newParams;
  }


  // private announceAutoKnee(candidateIndex: number, pct: number) : void {
  //   console.log(`setting the knee at ${candidateIndex} ${pct* 100}%`);
  // }




}
