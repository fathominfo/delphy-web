import { ColorOption, COLOR_CONF, COLOR_METADATA,
  CONFIDENCE_DEFAULT, ColorDict, Screens, NavigateFunctionType, UNDEF,
  UNSET} from './common';
import { ColumnSummary, Metadata} from './metadata';
import { ColorChooser, UNDEF_COLOR } from './colorchooser';
import { NodeMetadata, FieldTipCount } from './nodemetadata';
import { SummaryTree } from '../pythia/delphy_api';
import { BlockSlider } from '../util/blockslider';


type ChangeHandler = (event:Event)=>void;

export type LISTENER_CALLBACK_TYPE = ()=>void;


const COLOR_CONF_SELECTOR = `input[name=mcc-opt--color][value=${COLOR_CONF}]`,
  COLOR_META_SELECTOR = `input[name=mcc-opt--color][value=${COLOR_METADATA}]`,
  CONFIDENCE_RANGE_SELECTOR = '.mcc-opt--confidence-range',
  CONFIDENCE_READOUT_SELECTOR = '.mcc-opt--confidence-readout';


export class MccConfig {

  colorOption: ColorOption;
  confidenceThreshold: number;
  colorCallback: ChangeHandler;
  confidenceCallback: (value: number) => void;

  div: HTMLDivElement | null;
  metadata: Metadata | null;
  nodeMetadata: NodeMetadata | null;
  metadataField: string | null;
  metadataColors: {[field: string]: ColorDict};

  confidenceSlider!: BlockSlider;
  colorChooser: ColorChooser;

  metadataColorsDirty: boolean;



  /*
  used to notify a listener that a change has occurred.
  Instead of notifying of specific change, the listening
  entity can just read the state of this config.
  */
  protected updateCallback: LISTENER_CALLBACK_TYPE;


  constructor(goTo: NavigateFunctionType) {
    this.colorOption = ColorOption.confidence;
    this.confidenceThreshold = CONFIDENCE_DEFAULT / 100;
    this.colorChooser = new ColorChooser();
    this.metadataColorsDirty = false;
    this.colorCallback = event=>{
      const target = event.target as HTMLInputElement;
      if (target) {
        const color = target.value === COLOR_CONF ? ColorOption.confidence : ColorOption.metadata;
        if (color === ColorOption.metadata && this.metadataField === null) {
          /* send the user to the customize page */
          goTo(Screens.customize);
        } else {
          this.setColorSystem(color);
        }
      }
    };
    this.confidenceCallback = (value: number) => {
      const confidenceThreshold = value / 100;
      this.setConfidence(confidenceThreshold);
    };

    this.updateCallback = ()=>console.debug('mccConfig.updateCallback is unassigned');
    this.div = null;
    this.metadata = null;
    this.nodeMetadata = null;
    this.metadataField = null;
    this.metadataColors = {};
  }


  setListener(callback: LISTENER_CALLBACK_TYPE) {
    this.updateCallback = callback;
  }

  setMetadata(metadata: Metadata, tree: SummaryTree) : void {
    this.metadata = metadata;
    this.nodeMetadata = new NodeMetadata(metadata, tree, tree.getBaseTree(0));
    this.metadata.summarize(this.nodeMetadata);
    this.updateCallback();
  }

  setMetadataField(field: string, colors: ColorDict) : void {
    this.metadataField = field;
    this.metadataColors[field] = colors;
    /*
    if we have all we need, then assume we want to see the
    tree colored by metadata
    */
    if (this.nodeMetadata) {
      this.colorOption = ColorOption.metadata;
      this.updateCallback();
    }
  }


  getMetadataValue(tipName: string): string {
    if (this.nodeMetadata && this.metadataField) {
      const metadata = this.nodeMetadata.metadata;
      return metadata.getFieldValue(tipName, this.metadataField);
    }
    return UNDEF;
  }

  getMetadataColor(value: string) : string {
    let clr = UNDEF_COLOR;
    if (this.nodeMetadata && this.metadataField) {
      const colors = this.metadataColors[this.metadataField];
      if (colors && colors[value] && colors[value].active) {
        clr = colors[value].color;
      }
    }
    return clr;
  }


  bind(div:HTMLDivElement | null) : void {
    if (div) {
      this.div = div;
      /* convenience function for binding the radio button options */
      const addListener = (selector: string, callback:ChangeHandler, isSelected: boolean)=>{
        const ele = div.querySelector(selector) as HTMLInputElement;
        if (ele) {
          ele.addEventListener('change', callback);
          ele.checked = isSelected;
        } else {
          console.debug(`could not find "${selector}" on the #${div.id} page`);
        }
        return ele;
      };
      addListener(COLOR_CONF_SELECTOR, this.colorCallback, this.colorOption === ColorOption.confidence);
      addListener(COLOR_META_SELECTOR, this.colorCallback, this.colorOption === ColorOption.metadata);

      const readout = div.querySelector(CONFIDENCE_READOUT_SELECTOR) as HTMLSpanElement;
      this.confidenceCallback = (value: number)=>{
        const confidenceThreshold = value / 100;
        readout.innerHTML = `${Math.round(value)}`;
        this.setConfidence(confidenceThreshold);
      };
      const input = div.querySelector(CONFIDENCE_RANGE_SELECTOR) as HTMLElement;
      if (input) {
        this.confidenceSlider = new BlockSlider(input, this.confidenceCallback);
        this.confidenceSlider.set(this.confidenceThreshold * 100);
        readout.innerHTML = `${Math.round(this.confidenceThreshold * 100)}`;
      }

      // const addClickListener = (selector: string, callback:returnless)=>{
      //   const ele = document.querySelector(selector) as HTMLInputElement;
      //   if (ele) {
      //     ele.addEventListener('click', callback);
      //   } else {
      //     console.debug(`could not find "${selector}"`);
      //   }
      // }

    }
  }




  setColorSystem(option: ColorOption): void {
    // console.debug('setColorSystem', color);
    let updatingColor = option !== this.colorOption || (option === ColorOption.metadata && this.metadataColorsDirty);
    if (updatingColor && option === ColorOption.metadata && (!this.metadataField || !this.metadataColors)) {
      updatingColor = false;
      console.debug("can't color by metadata until metadata field and colors are set.")
    }
    if (updatingColor) {
      this.colorOption = option;
      this.updateCallback();
      if (option === ColorOption.metadata) {
        this.metadataColorsDirty = false;
      }
    }
  }

  setConfidence(confidenceThreshold: number) : void {
    // console.log(`setConfidence(${confidenceThreshold})`)
    if (confidenceThreshold !== this.confidenceThreshold) {
      this.confidenceThreshold = confidenceThreshold;
      this.updateCallback();
    }
  }

  hasMetadata() : boolean {
    return this.nodeMetadata !== null;
  }

  getMetadataFilename() : string {
    return this.nodeMetadata?.metadata?.filename || '';
  }

  getMetadataFields() : string[] {
    return this.nodeMetadata?.metadata?.header?.slice() || [];
  }

  getColumnSummary(name: string) : ColumnSummary {
    if (!this.nodeMetadata?.metadata) {
      throw new Error("can't retrieve metadata");
    }
    return this.nodeMetadata.metadata.getColumnSummary(name);
  }

  getMetadataValues() : string [] {
    if (!this.nodeMetadata) {
      throw new Error("metadata is not set");
      // console.warn("metadata is not set");
      // return [];
    }
    if (this.metadataField === null) {
      throw new Error("metadata field has not been defined");
      // console.warn("metadata field has not been defined");
      // return [];
    }
    return this.nodeMetadata.getNodeValues(this.metadataField);
  }

  getMetadataTipCounts() : FieldTipCount[] {
    if (!this.nodeMetadata) {
      // throw new Error("metadata is not set");
      console.warn("metadata is not set");
      return [];
    }
    if (this.metadataField === null) {
      // throw new Error("metadata field has not been defined");
      console.warn("metadata field has not been defined");
      return [];
    }
    return this.nodeMetadata.getNodeTipCounts(this.metadataField);
  }

  updateInnerNodeMetadata(tree: SummaryTree) : void {
    if (this.nodeMetadata) {
      this.nodeMetadata.updateTree(tree);
    }
  }


  unbind() : void {
    if (this.div) {
      console.trace('running unbind');
      const div: HTMLDivElement = this.div;
      const removeChangeListener = (selector: string, callback:ChangeHandler)=>{
        const ele = div.querySelector(selector) as HTMLInputElement;
        if (ele) {
          ele.removeEventListener('change', callback);
        } else {
          console.debug(`could not find "${selector}" on #${div.id}`);
        }
      }
      removeChangeListener(COLOR_CONF_SELECTOR, this.colorCallback);
      removeChangeListener(COLOR_META_SELECTOR, this.colorCallback);
      // const removeClickListener = (selector: string, callback:returnless)=>{
      //   const ele = div.querySelector(selector) as HTMLInputElement;
      //   if (ele) {
      //     ele.removeEventListener('click', callback);
      //   } else {
      //     // console.debug(`could not find "${selector}"`);
      //   }
      // };
    }
  }

  exportConfig() : ConfigExport {
    const exportData: ConfigExport = {
      confidence : this.confidenceThreshold * 100,
      topology : 0,
      presentation : 0,
      spacing : 0,
      colorBy : this.colorOption === ColorOption.confidence ? 0 : 1,
      burnin : 0,
      metadataPresent : 0,
      metadataText: null,
      metadataFile: null,
      metadataDelimiter: null,
      selectedMDField: UNSET,
      metadataColors : this.metadataColors
    };
    if (this.nodeMetadata) {
      const md = this.nodeMetadata.metadata;
      exportData.metadataPresent = 1;
      exportData.metadataText = md.sourceData;
      exportData.metadataFile = md.filename;
      exportData.metadataDelimiter = md.delimiter;
      if (this.colorOption === ColorOption.metadata) {
        const field = this.metadataField as string;
        exportData.selectedMDField = md.header.indexOf(field);
      }
    }
    return exportData;
  }



  importConfig(config: ConfigExport): void {
    this.confidenceThreshold = config.confidence ? config.confidence / 100.0 : CONFIDENCE_DEFAULT;
    this.colorOption = !config.colorBy ? ColorOption.confidence : ColorOption.metadata;
    if (config.metadataPresent === 1) {
      if (!this.metadata) {
        this.metadata = new Metadata(config.metadataFile || '', config.metadataText || '', config.metadataDelimiter || '');
      }
      this.metadataField = this.metadata.header[config.selectedMDField] || '';
      this.metadataColors = config.metadataColors || this.metadataColors || {};
      this.metadataColorsDirty = true;
    }
  }



  /*
  set colors for keys in a metadata field
  assuming that any key passed in will be active
  */
  setColorKeys(field: string) {
    const summ = this.getColumnSummary(field),
      keys = summ?.sorted.map(([val, ]) => val),
      colorAll: boolean = keys ? keys.length <= 10 : false,
      colorList: string[] = this.colorChooser.getPalette(keys?.length || 0),
      undefIndex = keys.indexOf(UNDEF),
      undefColor = `#${this.colorChooser.getUndefColor()}`;
    colorList[undefIndex] = this.colorChooser.getUndefColor();
    let colors: ColorDict = this.metadataColors[field];
    if (!colors) {
      colors = {};
    }
    keys.forEach((key, index) => {
      if (colors[key] ) {
        const clr = colors[key].color;
        colorList[index] = clr;
      } else {
        const clr = key === UNDEF ? undefColor : colorList[index];
        colors[key] = {color: clr, active: true};
      }
    });
    this.setMetadataField(field, colors);
    return colorAll;
  }

  setMetadataKeyColor(field: string, key: string, color: string): void {
    if (this.metadataColors[field]?.[key]) {
      this.metadataColors[field][key].color = color;
    }
  }


  setMetadataKeyActive(field: string, key: string, isActive=false): void {
    if (this.metadataColors[field]?.[key]) {
      this.metadataColors[field][key].active = isActive;
    }
  }

}


export type Flag = 0 | 1;
export type ConfigExport = {
  confidence : number,
  topology : Flag,
  presentation : Flag,
  spacing : Flag,
  colorBy: Flag,
  burnin : Flag,
  metadataPresent : Flag,
  metadataText: string | null,
  metadataFile: string | null,
  metadataDelimiter: string | null,
  selectedMDField: number,
  metadataColors: {[field: string]: ColorDict}
};

