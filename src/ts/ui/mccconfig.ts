import {
  ColorOption, COLOR_CONF,
  CONFIDENCE_DEFAULT, ColorDict, UNDEF,
  UNSET,
  LISTENER_CALLBACK_TYPE
} from './common';
import { ColumnSummary, Metadata } from './metadata';
import { ColorChooser, UNDEF_COLOR } from './colorchooser';
import { NodeMetadata, FieldTipCount } from './nodemetadata';
import { SummaryTree } from '../pythia/delphy_api';
import { NodeSchematicData } from './nodeschematic';


export class MccConfig {

  colorOption: ColorOption;
  confidenceThreshold: number;
  metadata: Metadata | null;
  nodeMetadata: NodeMetadata | null;
  metadataField: string | null;
  metadataColors: { [field: string]: ColorDict };
  colorChooser: ColorChooser;
  metadataColorsDirty: boolean;
  configuredRoot: number = UNSET;
  schematicData: NodeSchematicData | null = null;



  /*
  used to notify a listener that a change has occurred.
  Instead of notifying of specific change, the listening
  entity can just read the state of this config.
  */
  protected updateCallback: LISTENER_CALLBACK_TYPE;


  constructor() {
    this.colorOption = ColorOption.confidence;
    this.confidenceThreshold = CONFIDENCE_DEFAULT / 100;
    this.colorChooser = new ColorChooser();
    this.metadataColorsDirty = false;
    this.updateCallback = () => console.debug('mccConfig.updateCallback is unassigned');
    this.metadata = null;
    this.nodeMetadata = null;
    this.metadataField = null;
    this.metadataColors = {};
  }


  setListener(callback: LISTENER_CALLBACK_TYPE) {
    this.updateCallback = callback;
  }

  setMetadata(metadata: Metadata, tree: SummaryTree): void {
    this.metadata = metadata;
    this.nodeMetadata = new NodeMetadata(metadata, tree, tree.getBaseTree(0));
    this.metadata.summarize(this.nodeMetadata);
    this.updateCallback();
  }

  setMetadataField(field: string, colors: ColorDict | null = null): void {
    this.metadataField = field;
    if (colors) {
      this.metadataColors[field] = colors;
    } else {
      this.setColorKeys(field);
    }
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

  getMetadataColor(value: string): string {
    let clr = UNDEF_COLOR;
    if (this.nodeMetadata && this.metadataField) {
      const colors = this.metadataColors[this.metadataField];
      if (colors && colors[value] && colors[value].active) {
        clr = colors[value].color;
      }
    }
    return clr;
  }


  colorBy(value: string): void {
    if (value === COLOR_CONF) {
      this.setColorSystem(ColorOption.confidence);
    } else if (this.metadata && this.metadata.getFields().map(f => f.toLowerCase()).includes(value.toLowerCase())) {
      this.setMetadataField(value);
      this.setColorSystem(ColorOption.metadata);
    } else {
      console.warn(`ignoring request to color by "${value}", since it does not match any available metadata values.`)
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

  /* expects a number between 0 and 1 */
  setConfidence(confidenceThreshold: number): void {
    if (confidenceThreshold > 1) {
      console.trace(`
        MccConfig.setConfidence() got a parameter of ${confidenceThreshold}. 
        This out of range, so assuming that we forgot to convert from a
        scale of 0-100 to 0-1. Hence, we shall divide by 100. 
      `);
      confidenceThreshold /= 100;
    }

    // console.log(`setConfidence(${confidenceThreshold})`)
    if (confidenceThreshold !== this.confidenceThreshold) {
      this.confidenceThreshold = confidenceThreshold;
      this.updateCallback();
    }
  }

  hasMetadata(): boolean {
    return this.nodeMetadata !== null;
  }

  getMetadataFilename(): string {
    return this.nodeMetadata?.metadata?.filename || '';
  }

  getMetadataFields(): string[] {
    return this.nodeMetadata?.metadata?.header?.slice() || [];
  }

  getColumnSummary(name: string): ColumnSummary {
    if (!this.nodeMetadata?.metadata) {
      throw new Error("can't retrieve metadata");
    }
    return this.nodeMetadata.metadata.getColumnSummary(name);
  }

  getMetadataValues(field = this.metadataField): string[] {
    if (!this.nodeMetadata) {
      throw new Error("metadata is not set");
    }
    if (field === null) {
      throw new Error("metadata field has not been defined");
    }
    return this.nodeMetadata.getNodeValues(field);
  }

  getMetadataTipCounts(): FieldTipCount[] {
    if (!this.nodeMetadata) {
      console.warn("metadata is not set");
      return [];
    }
    if (this.metadataField === null) {
      console.warn("metadata field has not been defined");
      return [];
    }
    return this.nodeMetadata.getNodeTipCounts(this.metadataField);
  }

  updateInnerNodeMetadata(tree: SummaryTree): void {
    if (this.nodeMetadata) {
      this.nodeMetadata.updateTree(tree);
    }
  }


  exportConfig(): ConfigExport {
    const exportData: ConfigExport = {
      confidence: this.confidenceThreshold * 100,
      topology: 0,
      presentation: 0,
      spacing: 0,
      colorBy: this.colorOption === ColorOption.confidence ? 0 : 1,
      burnin: 0,
      metadataPresent: 0,
      metadataText: null,
      metadataFile: null,
      metadataDelimiter: null,
      selectedMDField: UNSET,
      metadataColors: this.metadataColors
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
      keys = summ?.sorted.map(([val,]) => val),
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
      if (colors[key]) {
        const clr = colors[key].color;
        colorList[index] = clr;
      } else {
        const clr = key === UNDEF ? undefColor : colorList[index];
        colors[key] = { color: clr, active: true };
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


  setMetadataKeyActive(field: string, key: string, isActive = false): void {
    if (this.metadataColors[field]?.[key]) {
      this.metadataColors[field][key].active = isActive;
    }
  }

}


export type Flag = 0 | 1;
export type ConfigExport = {
  confidence: number,
  topology: Flag,
  presentation: Flag,
  spacing: Flag,
  colorBy: Flag,
  burnin: Flag,
  metadataPresent: Flag,
  metadataText: string | null,
  metadataFile: string | null,
  metadataDelimiter: string | null,
  selectedMDField: number,
  metadataColors: { [field: string]: ColorDict }
};

