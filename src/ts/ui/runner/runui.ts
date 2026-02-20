import {MccRef} from '../../pythia/mccref';
// import {ExpPopModel, SkygridPopModel, SkygridPopModelType} from '../../pythia/delphy_api';
import {SkygridPopModel, SkygridPopModelType} from '../../pythia/delphy_api';
import {MU_FACTOR, FINAL_POP_SIZE_FACTOR, POP_GROWTH_RATE_FACTOR, copyDict, STAGES} from '../../constants';
import {MccTreeCanvas, instantiateMccTreeCanvas} from '../mcctreecanvas';
import {HistCanvas} from './histcanvas';
import {DateLabel} from '../datelabel';
import {nfc, getTimelineIndices, getTimestampString, getPercentLabel, UNSET} from '../common';
import {SoftFloat} from '../../util/softfloat.js';
import {UIScreen} from '../uiscreen';
import {SharedState} from '../../sharedstate';
import { hoverListenerType, kneeHoverListenerType } from './runcommon';
import { BlockSlider } from '../../util/blockslider';
import { BurninPrompt } from './burninprompt';
import { setStage } from '../../errors';
import { convertSkygridDaysToTau, convertSkygridTauToDays, makeDefaultRunParamConfig, RunParamConfig, tauConfigOption } from '../../pythia/pythia';
import { parse_iso_date, toDateString } from '../../pythia/dates';
import { GammaHistCanvas } from './gammahistcanvas';
import { TraceCanvas } from './tracecanvas';
import { HistData } from './histdata';

const DAYS_PER_YEAR = 365;
// const POP_GROWTH_FACTOR = Math.log(2) / DAYS_PER_YEAR;

const EPSILON = 1e-7;

type ESS_THRESHOLD = {threshold: number, className: string};

const ESS_THRESHOLDS: ESS_THRESHOLD[] = [
  {threshold: 0, className: "converging"},
  {threshold: 10, className: "stable"},
  {threshold: 100, className: "robust"},
  {threshold: 200, className: "publish"}
];

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
  private stepSelector: HTMLSelectElement;

  private mccTreeCanvas: MccTreeCanvas;

  private mutCountCanvas: HistCanvas;
  private muCanvas: HistCanvas;
  private logPosteriorCanvas: HistCanvas;
  private gammaCanvas: GammaHistCanvas;
  private histCanvases: TraceCanvas[];

  private credibilityInput: BlockSlider;
  private essWrapper: HTMLDivElement;
  private essReadout: HTMLSpanElement;
  private essMeter: HTMLDivElement;
  private burnInWrapper: HTMLDivElement;
  private burnInToggle: HTMLInputElement;
  private hideBurnIn: boolean;
  private mccMinDate:SoftFloat;
  private mccTimelineIndices:DateLabel[];


  private burninPrompt: BurninPrompt;
  private ess: number;

  /*
  For the advanced Skygrid parameters form,
  we have validations that live in javascript (sadly, native HTML
  validations don't suffice). If the validation fails, we want to
  reset the form to the old value. This dictionary is where we store
  the old values.
  */
  private oldValues: { [id: string] : number; };


  is_running: boolean;
  private timerHandle:number;
  runControlHandler:()=>void;


  stepCount: number;
  mccIndex: number;
  private drawHandle: number;


  advanced: HTMLElement;
  advancedForm: HTMLFormElement;

  fixedRateToggle: HTMLInputElement;
  mutationRateInput: HTMLInputElement;
  popModelSkygridDetail: HTMLFieldSetElement;
  popModelExpDetail: HTMLDivElement;
  fixedFinalPopSizeToggle: HTMLInputElement;
  fixedFinalPopSizeInput: HTMLInputElement;
  fixedPopGrowthRateToggle: HTMLInputElement;
  fixedPopGrowthRateInput: HTMLInputElement;
  skygridStartDateInput: HTMLInputElement;
  skygridIntervalCountInput: HTMLInputElement;
  doublingInput: HTMLInputElement;
  tauInput: HTMLInputElement;
  minBarrierLocationInput: HTMLInputElement;

  submitAdvancedButton: HTMLButtonElement;
  restartWarning: HTMLElement;

  /* useful when updating the advanced run parameters */
  disableAnimation: boolean;

  kneeHandler : kneeHoverListenerType;


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
          // console.debug(`lastRequestedBurnInPct ${lastRequestedBurnInPct}    pct ${pct}`);
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

    const hoverHandler: hoverListenerType = (treeIndex:number)=>{
      // if (treeIndex === UNSET) {
      //   console.log(`hoverHandler(${treeIndex})`);
      // }
      this.histCanvases.forEach(hc=>{
        if (hc.isVisible) {
          hc.handleTreeHighlight(treeIndex);
        }
      });
      this.requestDraw();
    };

    this.mccRef = null;
    this.mccTreeCanvas = instantiateMccTreeCanvas("#runner--mcc .tree-canvas");
    this.runControl = document.querySelector("#run-input") as HTMLInputElement;
    this.stepCountText = document.querySelector("#run-steps .digit") as HTMLSpanElement;
    this.treeCountText = document.querySelector("#run-trees") as HTMLSpanElement;
    this.mccTreeCountText = document.querySelector("#run-mcc") as HTMLSpanElement;
    this.stepCountPluralText = document.querySelector("#run-steps .plural") as HTMLSpanElement;
    this.essWrapper = document.querySelector("#ess-wrapper") as HTMLDivElement;
    this.essReadout = this.essWrapper.querySelector(".readout") as HTMLSpanElement;
    this.essMeter = this.essWrapper.querySelector("#ess-meter-stages") as HTMLDivElement;
    this.burnInWrapper = document.querySelector("#burn-in-wrapper") as HTMLDivElement;
    this.burnInToggle = this.burnInWrapper.querySelector("#burn-in-toggle") as HTMLInputElement;
    this.runControlHandler = ()=> this.set_running();
    this.stepSelector = (document.querySelector("#step-options") as HTMLSelectElement);


    this.mutCountCanvas = new HistCanvas("Number of Mutations", '', curatedKneeHandler, hoverHandler);
    this.muCanvas = new HistCanvas("Mutation Rate μ", "&times; 10<sup>&minus;5</sup> mutations / site / year", curatedKneeHandler, hoverHandler);
    this.logPosteriorCanvas = new HistCanvas("ln(Posterior)", '', curatedKneeHandler, hoverHandler);
    this.gammaCanvas = new GammaHistCanvas("Effective population size in years");
    this.histCanvases = [this.mutCountCanvas, this.muCanvas, this.logPosteriorCanvas, this.gammaCanvas];
    (this.mutCountCanvas.traceData as HistData).isDiscrete = true;
    this.hideBurnIn = false;
    this.mccTimelineIndices = [];
    this.mccMinDate = new SoftFloat(0, 0.75, 0.3);
    this.is_running = false;
    this.timerHandle = 0;
    this.stepCount = -1;
    this.mccIndex = -1
    this.drawHandle = 0;
    const exportButton = this.div.querySelector("#runner--export-csv") as HTMLButtonElement;

    const openAdvancedButton = this.div.querySelector("#option--show-advanced") as HTMLDivElement;
    this.advanced = this.div.querySelector("#runner--advanced") as HTMLElement;
    this.advancedForm = document.querySelector("#runner--advanced--content") as HTMLFormElement;

    this.fixedRateToggle = this.div.querySelector("#fixed-mutation-rate-toggle") as HTMLInputElement;
    this.mutationRateInput = this.div.querySelector("#overall-mutation-rate-input") as HTMLInputElement;
    this.popModelExpDetail = this.div.querySelector("#popmodel-exponential") as HTMLInputElement;
    this.popModelSkygridDetail = this.div.querySelector("#popmodel-skygrid") as HTMLFieldSetElement;
    this.fixedFinalPopSizeToggle = this.div.querySelector("#fixed-final-pop-size-toggle") as HTMLInputElement;
    this.fixedFinalPopSizeInput = this.div.querySelector("#overall-final-pop-size-input") as HTMLInputElement;
    this.fixedPopGrowthRateToggle = this.div.querySelector("#fixed-pop-growth-rate-toggle") as HTMLInputElement;
    this.fixedPopGrowthRateInput = this.div.querySelector("#overall-pop-growth-rate-input") as HTMLInputElement;
    this.skygridStartDateInput = this.div.querySelector("#popmodel-skygrid-k") as HTMLInputElement;
    this.skygridIntervalCountInput = this.div.querySelector("#popmodel-skygrid-num-intervals") as HTMLInputElement;
    this.doublingInput = this.div.querySelector(`#advanced-skygrid-timescale-doubling-value input`) as HTMLInputElement;
    this.tauInput = this.div.querySelector(`#advanced-skygrid-timescale-tau-value input`) as HTMLInputElement;
    this.minBarrierLocationInput = this.div.querySelector(`#advanced-skygrid-barrier-values input[name="low-pop-barrier-location"]`) as HTMLInputElement;

    this.oldValues = {};

    const alphaInput = this.div.querySelector(`#advanced-skygrid-timescale-infer-values input[name="alpha-value"]`) as HTMLInputElement;
    const betaInput = this.div.querySelector(`#advanced-skygrid-timescale-infer-values input[name="beta-value"]`) as HTMLInputElement;
    const minBarrierScaleInput  = this.div.querySelector(`#advanced-skygrid-barrier-values input[name="low-pop-barrier-scale"]`) as HTMLInputElement;


    this.constrainInputRange('doublingInput', this.doublingInput, 0, null);
    this.constrainInputRange('tauInput', this.tauInput, 0, null);
    this.constrainInputRange('alphaInput', alphaInput, 0, null);
    this.constrainInputRange('betaInput', betaInput, 0, null);
    this.constrainInputRange('barrierLocationInput', this.minBarrierLocationInput, 0, null);
    this.constrainInputRange('barrierScaleInput', minBarrierScaleInput, 0, 100);

    this.burninPrompt = new BurninPrompt();
    this.ess = UNSET;

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

    this.stepSelector.addEventListener('input', ()=>{
      const power = parseInt(this.stepSelector.value);
      this.setStepsPerRefresh(power);
    });
    exportButton.addEventListener("click", ()=>{
      if (this.pythia) {
        const {log} = this.pythia.getBeastOutputs("X-10.5.0"),  // hard-code BEAST X export
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
    this.restartWarning = this.div.querySelector(".warning-text") as HTMLElement;
    this.submitAdvancedButton = this.div.querySelector(".advanced--submit-button") as HTMLButtonElement;
    console.trace('binding advanced' , Date.now());
    const advancedToggle = openAdvancedButton.querySelector("input") as HTMLInputElement;
    advancedToggle.addEventListener("change", (event)=>{
      event.stopPropagation();
      if (advancedToggle.checked) {
        openAdvancedButton.classList.add("active");
        this.advanced.classList.add("active");
        this.restartWarning.classList.add("hidden");
        this.submitAdvancedButton.innerText = (this.stepCount === 0) ? "Confirm" : "Restart with selected options";
        this.submitAdvancedButton.classList.toggle("warning-button", this.stepCount > 0);
      } else {
        this.advanced.classList.remove("active");
        openAdvancedButton.classList.remove("active");
      }
    });

    this.fixedRateToggle.addEventListener("change", () => {
      this.mutationRateInput.disabled = !this.fixedRateToggle.checked;
    });

    this.fixedFinalPopSizeToggle.addEventListener("change", () => {
      this.fixedFinalPopSizeInput.disabled = !this.fixedFinalPopSizeToggle.checked;
    });
    this.fixedPopGrowthRateToggle.addEventListener("change", () => {
      this.fixedPopGrowthRateInput.disabled = !this.fixedPopGrowthRateToggle.checked;
    });
    [this.skygridStartDateInput, this.skygridIntervalCountInput]
      .forEach(ele=>ele.addEventListener("change", () => {
        const params = this.getAdvancedFormValues();
        this.setImpliedTau(params.skygridDoubleHalfTime, params.skygridStartDate, params.skygridNumIntervals);
        this.setImpliedDays(params.skygridTau, params.skygridStartDate, params.skygridNumIntervals);
      }));
    this.doublingInput.addEventListener("change", () => {
      const params = this.getAdvancedFormValues();
      this.setImpliedTau(params.skygridDoubleHalfTime, params.skygridStartDate, params.skygridNumIntervals);
    });
    this.tauInput.addEventListener("change", () => {
      const params = this.getAdvancedFormValues();
      this.setImpliedDays(params.skygridTau, params.skygridStartDate, params.skygridNumIntervals);
    });
    this.minBarrierLocationInput.addEventListener("change", () => {
      const params = this.getAdvancedFormValues();
      this.setPopBarrierLocationPlural(params.skygridLowPopBarrierLocation);
    });



    const advancedCancelButton = this.div.querySelector(".advanced--cancel-button") as HTMLButtonElement;
    advancedCancelButton.addEventListener("click", () => this.advanced.classList.remove("active"));
    this.advancedForm.addEventListener("input", () => this.enableAdvancedFormSubmit());
    this.advancedForm.addEventListener("submit", e => this.submitAdvancedOptions(e));
    this.advanced.addEventListener("click", e => {
      if (e.target === this.advanced) {
        e.preventDefault();
        this.advanced.classList.remove("active");
      }
    });
    window.addEventListener("keydown", e => {
      if (e.key === "Escape" && this.advanced.classList.contains("active")) {
        this.advanced.classList.remove("active");
      }
    })
  }


  enableAdvancedFormSubmit() : void {
    const willRestart = this.getWillRestart();
    if (this.stepCount > 0) {
      this.restartWarning.classList.toggle("hidden", !willRestart);
    }
    /* don't enable the form while waiting for samples from the delphy engine */
    const isPausedAndWaitingForSample = !this.is_running && this.timerHandle !== 0;
    this.submitAdvancedButton.disabled = isPausedAndWaitingForSample || !willRestart;
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
    this.updateParamsUI();
    setTimeout(()=>this.runControl.focus(), 100);
  }

  getRunParams(): RunParamConfig {
    const pythia = this.sharedState.pythia;
    const params = pythia.runParams;
    if (!params) {
      throw new Error(`this.runParams needed before it's set?`);
    }
    return params;
  }

  updateParamsUI() : void {
    const pythia = this.sharedState.pythia;
    const params = this.getRunParams();

    const currentStepSetting = Math.round(Math.log(params.stepsPerSample) / Math.log(10));

    (document.querySelector("#step-options") as HTMLSelectElement).value = `${currentStepSetting}`;

    // update checks
    const popModelExponential = this.div.querySelector("#popmodel-selector-expgrowth") as HTMLInputElement;
    const popModelSkygrid = this.div.querySelector("#popmodel-selector-skygrid") as HTMLInputElement;
    const siteHeterogeneityToggle = this.div.querySelector("#site-rate-heterogeneity-toggle") as HTMLInputElement;
    const skygridFlatInterpolationInput = this.div.querySelector("#popmodel-skygrid-interpolate-flat") as HTMLInputElement;
    const skygridLogLinearInterpolationInput = this.div.querySelector("#popmodel-skygrid-interpolate-loglinear") as HTMLInputElement;
    const apobecToggle = this.div.querySelector("#apobec-toggle") as HTMLInputElement;
    const advancedSkygridToggle = this.div.querySelector("#advanced-skygrid-toggle") as HTMLInputElement;
    const defaultParams = makeDefaultRunParamConfig(pythia.treeHist[0]);
    let advancedOptionsAreDefaults = true;
    if (defaultParams.skygridTauConfig !== params.skygridTauConfig) advancedOptionsAreDefaults = false;
    if (defaultParams.skygridLowPopBarrierEnabled !== params.skygridLowPopBarrierEnabled) advancedOptionsAreDefaults = false;


    if (closeEnough(defaultParams.skygridDoubleHalfTime, params.skygridDoubleHalfTime)) {
      params.skygridDoubleHalfTime = defaultParams.skygridDoubleHalfTime;
    } else if (params.skygridTauConfig === tauConfigOption.DOUBLE_HALF_TIME) {
      advancedOptionsAreDefaults = false;
      params.skygridDoubleHalfTime = checkIfIsProllyInt(params.skygridDoubleHalfTime);
    }
    if (closeEnough(defaultParams.skygridTau, params.skygridTau)) {
      params.skygridTau = defaultParams.skygridTau;
    } else if (params.skygridTauConfig === tauConfigOption.TAU) {
      advancedOptionsAreDefaults = false;
    }
    if (closeEnough(defaultParams.skygridTauPriorAlpha, params.skygridTauPriorAlpha)) {
      params.skygridTauPriorAlpha = defaultParams.skygridTauPriorAlpha;
    } else if (params.skygridTauConfig === tauConfigOption.INFER) {
      advancedOptionsAreDefaults = false;
    }
    if (closeEnough(defaultParams.skygridTauPriorBeta, params.skygridTauPriorBeta)) {
      params.skygridTauPriorBeta = defaultParams.skygridTauPriorBeta;
    } else if (params.skygridTauConfig === tauConfigOption.INFER) {
      advancedOptionsAreDefaults = false;
    }
    if (closeEnough(defaultParams.skygridLowPopBarrierLocation, params.skygridLowPopBarrierLocation)) {
      params.skygridLowPopBarrierLocation = defaultParams.skygridLowPopBarrierLocation;
    } else if (params.skygridLowPopBarrierEnabled) {
      advancedOptionsAreDefaults = false;
      params.skygridLowPopBarrierLocation = checkIfIsProllyInt(params.skygridLowPopBarrierLocation);
    }
    if (closeEnough(defaultParams.skygridLowPopBarrierScale, params.skygridLowPopBarrierScale)) {
      params.skygridLowPopBarrierScale = defaultParams.skygridLowPopBarrierScale;
    } else if (params.skygridLowPopBarrierEnabled) {
      advancedOptionsAreDefaults = false;
      const asPct = checkIfIsProllyInt(params.skygridLowPopBarrierScale * 100);
      params.skygridLowPopBarrierScale = asPct / 100;
    }

    popModelExponential.checked = !params.popModelIsSkygrid;
    popModelSkygrid.checked = params.popModelIsSkygrid;

    siteHeterogeneityToggle.checked = params.siteRateHeterogeneityEnabled;
    this.fixedRateToggle.checked = params.mutationRateIsFixed;
    apobecToggle.checked = params.apobecEnabled;
    this.fixedFinalPopSizeToggle.checked = params.finalPopSizeIsFixed;
    this.fixedPopGrowthRateToggle.checked = params.popGrowthRateIsFixed;
    this.mutationRateInput.disabled = !params.mutationRateIsFixed;
    this.fixedFinalPopSizeInput.disabled = !params.finalPopSizeIsFixed;
    this.fixedPopGrowthRateInput.disabled = !params.popGrowthRateIsFixed;

    skygridFlatInterpolationInput.checked = !params.skygridIsLogLinear;
    skygridLogLinearInterpolationInput.checked = params.skygridIsLogLinear;
    this.skygridStartDateInput.value = toDateString(params.skygridStartDate);
    this.skygridIntervalCountInput.value = `${params.skygridNumIntervals}`;

    advancedSkygridToggle.checked = !advancedOptionsAreDefaults;
    const doublingOpt = this.div.querySelector(`#advanced-skygrid-timescale-options input[value="doubling"]`) as HTMLInputElement;
    const tauOpt = this.div.querySelector(`#advanced-skygrid-timescale-options input[value="tau"]`) as HTMLInputElement;
    const inferOpt = this.div.querySelector(`#advanced-skygrid-timescale-options input[value="infer"]`) as HTMLInputElement;
    const alphaInput = this.div.querySelector(`#advanced-skygrid-timescale-infer-values input[name="alpha-value"]`) as HTMLInputElement;
    const betaInput = this.div.querySelector(`#advanced-skygrid-timescale-infer-values input[name="beta-value"]`) as HTMLInputElement;
    const minPopEnabledInput = this.div.querySelector(`#advanced-skygrid-barrier-options input[value="on"]`) as HTMLInputElement;
    const minPopDisabledInput = this.div.querySelector(`#advanced-skygrid-barrier-options input[value="off"]`) as HTMLInputElement;
    const minBarrierScaleInput  = this.div.querySelector(`#advanced-skygrid-barrier-values input[name="low-pop-barrier-scale"]`) as HTMLInputElement;

    doublingOpt.checked = params.skygridTauConfig === tauConfigOption.DOUBLE_HALF_TIME;
    tauOpt.checked = params.skygridTauConfig === tauConfigOption.TAU;
    inferOpt.checked = params.skygridTauConfig === tauConfigOption.INFER;
    this.doublingInput.value = `${params.skygridDoubleHalfTime}`;
    this.tauInput.value = `${params.skygridTau}`;
    alphaInput.value = `${params.skygridTauPriorAlpha}`;
    betaInput.value = `${params.skygridTauPriorBeta}`;
    minPopEnabledInput.checked = params.skygridLowPopBarrierEnabled;
    minPopDisabledInput.checked = !params.skygridLowPopBarrierEnabled;
    this.minBarrierLocationInput.value = `${params.skygridLowPopBarrierLocation}`;
    minBarrierScaleInput.value = `${params.skygridLowPopBarrierScale * 100}`;
    this.setImpliedTau(params.skygridDoubleHalfTime, params.skygridStartDate, params.skygridNumIntervals);
    this.setImpliedDays(params.skygridTau, params.skygridStartDate, params.skygridNumIntervals);
    this.setPopBarrierLocationPlural(params.skygridLowPopBarrierLocation);

    // set field values
    const muFixed = (params.mutationRate * MU_FACTOR).toFixed(2);
    this.mutationRateInput.value = `${muFixed}`;
    const finalPopSizeFixed = (params.finalPopSize * FINAL_POP_SIZE_FACTOR).toFixed(2);
    this.fixedFinalPopSizeInput.value = `${finalPopSizeFixed}`;
    const popGrowthRateFixed = (params.popGrowthRate * POP_GROWTH_RATE_FACTOR).toFixed(2);
    this.fixedPopGrowthRateInput.value = `${popGrowthRateFixed}`;

    // toggle canvases
    this.toggleHistCanvasVisibility(this.muCanvas, !params.mutationRateIsFixed);
    this.toggleHistCanvasVisibility(this.gammaCanvas, params.popModelIsSkygrid)

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
  }


  setImpliedTau(doubleHalfTime: number, skygridStartDate: number,  skygridNumIntervals: number):void {
    if (this.pythia) {
      const span = this.div.querySelector("#advanced-skygrid-timescale-inputs .implied-tau") as HTMLSpanElement;
      const tau = convertSkygridDaysToTau(doubleHalfTime, skygridStartDate, this.pythia.maxDate, skygridNumIntervals);
      span.textContent = `${tau.toFixed(2)}`
    }
  }

  setImpliedDays(skygridTau: number, skygridStartDate: number,  skygridNumIntervals: number):void {
    if (this.pythia) {
      const span = this.div.querySelector("#advanced-skygrid-timescale-inputs .implied-days") as HTMLSpanElement;
      const days = convertSkygridTauToDays(skygridTau, skygridStartDate, this.pythia.maxDate, skygridNumIntervals);
      span.textContent = `${days.toFixed(2)}`;
    }
  }

  setPopBarrierLocationPlural(skygridLowPopBarrierLocation: number):void {
    const label = this.div.querySelector("#low-pop-barrier-location-label") as HTMLLabelElement;
    label.classList.toggle("plural", skygridLowPopBarrierLocation !== 1);
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
    if (!this.is_running && this.timerHandle !== 0) {
      clearTimeout(this.timerHandle);
      this.timerHandle = 0;
      this.runControl.classList.remove("stopping");
      this.enableAdvancedFormSubmit();
      this.stepSelector.disabled = false;
    }
  }




  updateRunData():void {
    if (!this.pythia) return;
    const stepsHist = this.pythia.stepsHist,
      last = stepsHist.length - 1;

    const mccRef = this.pythia.getMcc();
    this.stepCount = stepsHist[last] || 0;
    if (mccRef) {
      const oldRef = this.mccRef;
      this.mccRef = mccRef;
      this.mccIndex = this.pythia.getMccIndex();
      // console.log(`this.mccIndex`, this.mccIndex)
      const mccTree = mccRef.getMcc(),
        nodeConfidence = mccRef.getNodeConfidence();
      if (mccTree !== this.mccTreeCanvas.tree) {
        this.mccTreeCanvas.setTreeNodes(mccTree, nodeConfidence);
        this.sharedState.resetSelections();
      }
      const earliestMCCDate = mccRef.getMcc().getTimeOf(mccTree.getRootIndex())
      this.mccMinDate.setTarget(earliestMCCDate);
      if (oldRef) {
        oldRef.release();
      }
    }




    this.mccMinDate.update();

    this.mccTimelineIndices = getTimelineIndices(this.mccMinDate.value, this.pythia.maxDate);
    const hideBurnIn = this.sharedState.hideBurnIn,
      mccIndex = this.mccIndex,
      sampleIndex = UNSET,
      {muHist, logPosteriorHist, numMutationsHist, popModelHist, totalBranchLengthHist, kneeIndex} = this.pythia;
    const muud = muHist.map(n=>n*MU_FACTOR);
    const totalLengthYear = totalBranchLengthHist.map(t=>t/DAYS_PER_YEAR);
    const serieses = [
      logPosteriorHist,
      muud,
      totalLengthYear,
      //numMutationsHist, // Exclude: # of mutations is too jumpy, so equilibrium variations are nowhere close to Gaussian
      //popHistGrowth,    // Exclude: double time is very volatile & equilibrium variations are nowhere close to Gaussian
    ];


    const totalLengthData = new HistData("", "year");
    totalLengthData.setData(totalLengthYear, kneeIndex, mccIndex, hideBurnIn, sampleIndex);


    this.logPosteriorCanvas.setData(logPosteriorHist, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    this.muCanvas.setData(muud, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    this.mutCountCanvas.setData(numMutationsHist, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    const essCandidates: number[] = [
      (this.logPosteriorCanvas.traceData as HistData).ess,
      (this.muCanvas.traceData as HistData).ess,
      totalLengthData.ess,
      // this.mutCountCanvas.ess,
      // this.popGrowthCanvas.ess
    ];

    // if (this.getRunParams().apobecEnabled) {
    //   const muudStar = muStarHist.map(n=>n*MU_FACTOR);
    //   this.muStarCanvas.setData(muudStar, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    //   serieses.push(muudStar);
    //   essCandidates.push((this.muStarCanvas.traceData as HistData).ess);
    // }
    if (this.getRunParams().popModelIsSkygrid) {
      const gammaHist = popModelHist.map(popModel => (popModel as SkygridPopModel).gamma);
      console.assert(popModelHist.length > 0, 'No population models at all?  Not even in the initial tree?');
      const xHist = (popModelHist[0] as SkygridPopModel).x;
      const isLogLinear = (popModelHist[0] as SkygridPopModel).type === SkygridPopModelType.LogLinear;
      this.gammaCanvas.setRangeData(gammaHist, xHist, isLogLinear, kneeIndex, sampleIndex);
    // } else {
    //   const popHistGrowth = popModelHist.map(popModel => POP_GROWTH_FACTOR / (popModel as ExpPopModel).g);
    //   this.popGrowthCanvas.setData(popHistGrowth, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    }
    this.ess = Math.min.apply(null, essCandidates);
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
    if (this.disableAnimation || this.mccMinDate.atTarget()) {
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
      const {stepCount, ess}  = this;
      const {maxDate} = this.pythia;
      let treeCount = 0;
      // let mccCount = 0;
      if (this.mccRef) {
        /* for safety, add extra ref while drawing */
        const drawRef = this.pythia.getMcc();
        // const mcc = drawRef.getMcc();
        try {
          this.mccTreeCanvas.draw(this.mccMinDate.value, maxDate, this.mccTimelineIndices);
        } catch (ex) {
          console.debug(`error on id ${this.mccRef.getManager().id}`, ex);
        }
        treeCount = this.pythia.getBaseTreeCount();
        // mccCount = mcc.getNumBaseTrees();
        drawRef.release();
        this.mccRef.release();
      } else {
        // console.debug('no mcc ref available')
      }
      this.logPosteriorCanvas.draw();
      this.muCanvas.draw();
      // if (this.getRunParams().apobecEnabled) {
      //   this.muStarCanvas.draw();
      // }
      this.mutCountCanvas.draw();
      if (this.getRunParams().popModelIsSkygrid) {
        this.gammaCanvas.draw();
      // } else {
      //   this.popGrowthCanvas.draw();
      }
      this.stepCountText.innerHTML = `${nfc(stepCount)}`;
      // this.treeCountText.innerHTML = `${nfc(treeCount)}`;
      // this.mccTreeCountText.innerHTML = `${nfc(mccCount)}`;
      let stepCountPlural = 's';
      if (stepCount === 1) {
        stepCountPlural = '';
      }
      const essIsUsable = ess > 0;
      let essClass  = "converging";
      this.essWrapper.classList.toggle("unset", !essIsUsable);
      this.essWrapper.classList.toggle("unset", !essIsUsable);
      const integerPart = this.essReadout.querySelector(".before") as HTMLSpanElement;
      const fractionPart = this.essReadout.querySelector(".after") as HTMLSpanElement;
      const essString = (essIsUsable ? ess : 0).toLocaleString(undefined, {maximumFractionDigits: 1, minimumFractionDigits: 1});
      const tokens = essString.split('.');
      integerPart.textContent = tokens[0];
      fractionPart.textContent = `.${tokens[1]}`;
      ESS_THRESHOLDS.forEach((et: ESS_THRESHOLD)=>{
        if (ess >= et.threshold) {
          essClass = et.className;
        }
      });
      this.essMeter.setAttribute("data-stage", essClass);
      if (treeCount > 1) {
        this.burnInWrapper.classList.remove("pre");
      }
      this.stepCountPluralText.innerHTML = stepCountPlural;

      // const treeCountPluralText = (this.treeCountText.parentElement as HTMLElement).querySelector(".plural") as HTMLElement;
      // treeCountPluralText.classList.toggle("hidden", treeCount === 1);
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
      this.runControl.classList.remove("stopping");
      this.pythia.startRun(null);
    }
  }

  stop():void {
    /* don't stop checking for results until the current iteration is done. */
    // if (this.timerHandle !== 0) {
    //   clearTimeout(this.timerHandle);
    //   this.timerHandle = 0;
    // }
    if (this.pythia) {
      this.is_running = false;
      this.runControl.checked = false;
      this.runControl.classList.add("stopping");
      this.stepSelector.disabled = true;
      this.pythia.pauseRun();
    }
  }


  private toggleHistCanvasVisibility(canvas: TraceCanvas, showIt: boolean) : void {
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
    const newParams = this.getAdvancedFormValues();
    this.confirmRestart(newParams);
  }


  private getAdvancedFormValues() : RunParamConfig {
    const formData = Object.fromEntries(new FormData(this.advancedForm));

    let newParams = copyDict(this.getRunParams()) as RunParamConfig;

    const isSiteHeterogeneity = formData.isSiteHeterogeneity === "on";
    newParams = this.setSiteRateHeterogeneityEnabled(newParams, isSiteHeterogeneity);

    const isFixedMutationRate = formData.isFixedMutationRate === "on";
    const overallMutationRate = (formData.overallMutationRate !== undefined) ?
      parseFloat(formData.overallMutationRate as string) : this.getRunParams().mutationRate;
    newParams = this.fixMutationRate(newParams, isFixedMutationRate, overallMutationRate);

    const isSkygrid = formData.popmodel === 'skygrid';
    newParams = this.setPopmodel(newParams, isSkygrid);
    if (isSkygrid) {
      console.log(formData);
      const skygridK = parse_iso_date(formData['skygrid-K'] as string);
      const skygridNumIntervals = parseInt(formData['skygrid-M'] as string);
      const skygridInterpolationIsLogLinear = formData['m-interpolation'] === 'loglin';
      const timescale = formData['timescale'];
      const tauConfig = timescale === 'tau' ? tauConfigOption.TAU
        : timescale === 'infer' ? tauConfigOption.INFER
          : tauConfigOption.DOUBLE_HALF_TIME; // default
      const doubleHalfTime = parseFloat(formData['doubling-value'] as string);
      const tau = parseFloat(formData['tau-value'] as string);
      const priorAlpha = parseFloat(formData['alpha-value'] as string);
      const priorBeta = parseFloat(formData['beta-value'] as string);
      const lowPopBarrierEnabled = (formData['low-pop-protection'] as string) === 'on';
      const lowPopBarrierLocation = parseFloat(formData['low-pop-barrier-location'] as string);
      const lowPopBarrierScale = parseFloat(formData['low-pop-barrier-scale'] as string);

      newParams.skygridStartDate = skygridK;
      newParams.skygridNumIntervals = skygridNumIntervals;
      newParams.skygridIsLogLinear = skygridInterpolationIsLogLinear;
      newParams.skygridTauConfig = tauConfig;
      newParams.skygridDoubleHalfTime = doubleHalfTime;
      newParams.skygridTau = tau;
      newParams.skygridTauPriorAlpha = priorAlpha;
      newParams.skygridTauPriorBeta = priorBeta;
      newParams.skygridLowPopBarrierEnabled = lowPopBarrierEnabled;
      newParams.skygridLowPopBarrierLocation = lowPopBarrierLocation;
      newParams.skygridLowPopBarrierScale = lowPopBarrierScale / 100;

    } else {
      const isFixedFinalPopSize = formData.isFixedFinalPopSize === "on";
      const overallFinalPopSize = (formData.overallFinalPopSize !== undefined) ?
        parseFloat(formData.overallFinalPopSize as string) : this.getRunParams().finalPopSize;
      newParams = this.fixFinalPopSize(newParams, isFixedFinalPopSize, overallFinalPopSize);

      const isFixedPopGrowthRate = formData.isFixedPopGrowthRate === "on";
      const overallPopGrowthRate = (formData.overallPopGrowthRate !== undefined) ?
        parseFloat(formData.overallPopGrowthRate as string) : this.getRunParams().popGrowthRate;
      newParams = this.fixPopGrowthRate(newParams, isFixedPopGrowthRate, overallPopGrowthRate);
    }

    const isApobec = formData.isApobec === "on";
    newParams = this.setApobec(newParams, isApobec);
    return newParams;
  }


  private confirmRestart(newParams: RunParamConfig, skipDialog=true): void {
    this.advanced.classList.remove("active");

    const currentStepCount: number = this.pythia ? this.pythia.stepsHist.length  : 0,
      currentRunWouldBeErased = currentStepCount > 1;
    if (currentRunWouldBeErased) {
      if (!this.pythia) {
        throw new Error("pythia interface unavalailable, cannot restart");
      }
      const okToGo = skipDialog || window.confirm(RESET_MESSAGE);
      if (!okToGo) {
        // they canceled
        this.updateParamsUI();
        return;
      }
    }

    setStage(STAGES.resetting);
    if (this.mccRef) {
      this.mccRef.release();
      this.mccRef = null;
    }
    this.div.classList.add('reloading');
    this.disableAnimation = true;
    this.sharedState.pythia.reset(newParams).then(()=>{
      this.div.classList.remove('reloading');
      this.stepCount = 0;
      this.updateParamsUI();
      this.updateRunData();
      this.disableAnimation = false;
      setStage(STAGES.loaded);
    });
  }

  private getWillRestart(): boolean {
    const runParams = this.getRunParams();
    const formParams = this.getAdvancedFormValues();
    let same = true;
    if (runParams.popModelIsSkygrid !== formParams.popModelIsSkygrid) same = false;
    if (runParams.siteRateHeterogeneityEnabled !== formParams.siteRateHeterogeneityEnabled) same = false;
    if (runParams.skygridNumIntervals !== formParams.skygridNumIntervals) same = false;
    if (runParams.skygridStartDate !== formParams.skygridStartDate) same = false;
    if (runParams.skygridIsLogLinear !== formParams.skygridIsLogLinear) same = false;
    if (runParams.mutationRateIsFixed !== formParams.mutationRateIsFixed) same = false;
    if (runParams.apobecEnabled !== formParams.apobecEnabled) same = false;
    if (runParams.finalPopSizeIsFixed !== formParams.finalPopSizeIsFixed) same = false;
    if (runParams.popGrowthRateIsFixed !== formParams.popGrowthRateIsFixed) same = false;
    if (runParams.skygridTauConfig !== formParams.skygridTauConfig) same = false;
    if (runParams.skygridLowPopBarrierEnabled !== formParams.skygridLowPopBarrierEnabled) same = false;
    switch (formParams.skygridTauConfig) {
    case tauConfigOption.DOUBLE_HALF_TIME:
      if (!closeEnough(runParams.skygridDoubleHalfTime, formParams.skygridDoubleHalfTime)) same = false;
      break;
    case tauConfigOption.TAU:
      if (!closeEnough(runParams.skygridTau, formParams.skygridTau)) same = false;
      break;
    case tauConfigOption.INFER:
      if (!closeEnough(runParams.skygridTauPriorAlpha, formParams.skygridTauPriorAlpha)) same = false;
      if (!closeEnough(runParams.skygridTauPriorBeta, formParams.skygridTauPriorBeta)) same = false;
      break;
    }
    if (formParams.mutationRateIsFixed) {
      if (!closeEnough(runParams.mutationRate, formParams.mutationRate)) same = false;
    }
    if (formParams.finalPopSizeIsFixed) {
      if (!closeEnough(runParams.finalPopSize, formParams.finalPopSize)) same = false;
    }
    if (formParams.popGrowthRateIsFixed) {
      if (!closeEnough(runParams.popGrowthRate, formParams.popGrowthRate)) same = false;
    }
    if (formParams.skygridLowPopBarrierEnabled) {
      if (!closeEnough(runParams.skygridLowPopBarrierLocation, formParams.skygridLowPopBarrierLocation)) same = false;
      if (!closeEnough(runParams.skygridLowPopBarrierScale,formParams.skygridLowPopBarrierScale)) same = false;
    }
    return !same;
  }

  private setStepsPerRefresh(stepPower:number): void {
    const newParams = copyDict(this.getRunParams()) as RunParamConfig,
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

  private setSiteRateHeterogeneityEnabled(runParams: RunParamConfig, enabled:boolean) : RunParamConfig {
    const newParams = copyDict(runParams) as RunParamConfig;
    newParams.siteRateHeterogeneityEnabled = enabled;
    return newParams;
  }

  private setPopmodel(runParams: RunParamConfig, isSkygrid:boolean) : RunParamConfig {
    const newParams = copyDict(runParams) as RunParamConfig;
    newParams.popModelIsSkygrid = isSkygrid;
    return newParams;
  }


  /*
  HTML numeric elements allow you to set a min and max value, but it's always inclusive.
  This version is for exclusive ranges, such as > 0 and < 1
  */
  constrainInputRange(key: string, element: HTMLInputElement, minExclusive: number, maxExclusive: number|null): void {
    element.addEventListener("focus", ()=>{
      this.oldValues[key] = parseFloat(element.value);
    });

    element.addEventListener("change", (event)=>{
      let isOk = true;
      const asNum = parseFloat(element.value);
      if (asNum <= minExclusive) {
        alert(`value must be greater than ${minExclusive}`);
        isOk = false;
      }
      if (maxExclusive !== null && asNum >= maxExclusive) {
        alert(`value must be less than ${maxExclusive}`);
        isOk = false;
      }
      if (!isOk) {
        event.preventDefault();
        element.value = `${this.oldValues[key]}`;
      }
      return isOk;
    });
  }

  // private announceAutoKnee(candidateIndex: number, pct: number) : void {
  //   console.log(`setting the knee at ${candidateIndex} ${pct* 100}%`);
  // }

}

const closeEnough = (n1:number, n2:number): boolean =>{
  const diffFactor = Math.abs((n1 - n2)/n1);
  if (diffFactor < EPSILON) {
    return true;
  }
  return false;
}

const checkIfIsProllyInt = (n1:number): number=>{
  if (closeEnough(n1, Math.round(n1))) {
    return Math.round(n1);
  }
  return n1;
}