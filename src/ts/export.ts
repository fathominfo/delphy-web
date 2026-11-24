import { Context2d } from "jspdf";
import { MccTree, SummaryTree } from "./pythia/delphy_api";
import { MccRef } from "./pythia/mccref";
import { Pythia } from "./pythia/pythia";
import { SharedState } from "./sharedstate";
import { ColorOption, DisplayNode, getDenseTimelineIndices, getNodeColor, getTimestampString, HI_CONFIDENCE_COLOR, LOW_CONFIDENCE_COLOR } from "./ui/common";
import { MccConfig } from "./ui/mccconfig";
import { MccTreeCanvas } from "./ui/mcctreecanvas";
import { PdfCanvas } from "./util/pdfcanvas";

type CanvasCtx = Context2d | CanvasRenderingContext2D;

type ExportFormat = "pdf" | "png";

type ExportOptions = {
  colorOption: string,
  branchWidthByTips: boolean
}

type LegendBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LegendOptions = {
  fontSize: number, lineHeight: number, applyFont?: (ctx: CanvasCtx, fontSize: number) => void;
}

const pdf_dimensions = {
  width: 1200,
  height: 800,
  margin: {
    top: 60,
    bottom: 20,
    left: 40,
    right: 40
  }
}

const PADDING = 10;


export function setupDownload(sharedState: SharedState) {
  const downloadBtn = document.querySelector(".nav-download-button") as HTMLButtonElement;
  const downloadMenu = document.querySelector(".mcc-download-menu") as HTMLDivElement;
  downloadBtn.addEventListener("click", () => {
    const hasMetadata = sharedState.mccConfig.metadataField;
    if (!hasMetadata) {
      const metadataRadio = downloadMenu.querySelector("#metadata-radio") as HTMLInputElement;
      metadataRadio.disabled = true;
      metadataRadio.checked = false;
      metadataRadio.parentElement?.classList.add("disabled");
    }
    downloadMenu.classList.toggle("expanded");
  });

  // TODO: clicking elsewhere should also dismiss this dialog
  const form = document.querySelector("#mcc-download-form") as HTMLFormElement;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const format = (formData.get("export-format") === "pdf" ? "pdf" : "png") as ExportFormat;
    const options: ExportOptions = {
      colorOption: formData.get("branch-color") as string,
      branchWidthByTips: formData.has("branch-width")
    };

    const exporter = new MccExporter(options)
      .export(format, sharedState)
      .catch((err) => console.error("Export failed", err));
  });
}

function measure(ctx: CanvasCtx, text: string): number {
  return (ctx.measureText(text) as unknown as { width: number }).width;
}

function drawCredibilityLegend(ctx: CanvasCtx, bounds: LegendBounds, mccconfig: MccConfig) {
  const boxW = 20, boxH = 10;
  const x = bounds.x + bounds.width / 2 - boxW * 4;
  const y = bounds.y + bounds.height / 2 - boxH * 4;
  ctx.fillStyle = "#000";
  ctx.fillText("Credibility", x, y - 30);

  ctx.fillStyle = LOW_CONFIDENCE_COLOR;
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillText(`Under ${100 * mccconfig.confidenceThreshold}%`, x + boxW * 1.5, y + boxH);

  ctx.fillStyle = HI_CONFIDENCE_COLOR;
  ctx.fillRect(x, y + boxH * 2, boxW, boxH);
  ctx.fillText(`Over ${100 * mccconfig.confidenceThreshold}%`, x + boxW * 1.5, y + boxH + boxH * 2);
}

function drawMetadataLegend(lineHeight: number, entries: Map<string, string>, bounds: LegendBounds, ctx: CanvasCtx) {
  const labels = [...entries.keys()];
  const boxSize = lineHeight / 3;
  const textOffset = boxSize * 2;

  const longestLabelWidth = labels.reduce((max, l) => Math.max(max, measure(ctx, l)), 0) * 0.7;
  const columnWidth = textOffset + longestLabelWidth;

  const rowsPerColumn = Math.max(1, Math.floor(bounds.height / lineHeight));
  const columns = Math.ceil(labels.length / rowsPerColumn);
  const visibleRows = Math.min(labels.length, rowsPerColumn);

  const legendWidth = columns * columnWidth;
  const legendHeight = visibleRows * lineHeight;

  // center the legend inside the bounds
  const left = bounds.x + Math.max(0, (bounds.width - legendWidth) / 2);
  const top = bounds.y + Math.max(0, (bounds.height - legendHeight) / 2);

  ctx.textAlign = 'left';

  labels.forEach((label, i) => {
    const column = Math.floor(i / rowsPerColumn);
    const row = i % rowsPerColumn;
    const baselineY = top + row * lineHeight + lineHeight * 0.35;
    const colX = left + column * columnWidth;

    ctx.fillStyle = entries.get(label)!;
    ctx.fillRect(colX, baselineY - boxSize, boxSize, boxSize);
    ctx.fillText(label, colX + textOffset, baselineY);
  });
}

export function drawLegend(
  mccconfig: MccConfig,
  ctx: CanvasCtx,
  entries: Map<string, string> | null, // label -> color
  bounds: LegendBounds,
  options: LegendOptions
): void {
  const { fontSize, lineHeight, applyFont } = options;

  ctx.save();
  if (applyFont) {
    applyFont(ctx, fontSize);
  } else {
    (ctx as CanvasRenderingContext2D).font = `${fontSize}px Roboto, sans-serif`;
  }

  if (mccconfig.colorOption === ColorOption.confidence) {
    drawCredibilityLegend(ctx, bounds, mccconfig);
  } else if (entries && mccconfig.colorOption === ColorOption.metadata) {
    drawMetadataLegend(lineHeight, entries, bounds, ctx);
  }
  ctx.restore();
}
export class MccExporter {
  private mccRef!: MccRef;
  private mcc!: MccTree;
  private mccConfig!: MccConfig;
  private pythia!: Pythia;
  private options: ExportOptions;
  private selectedNodes!: number[];
  private mrcaIndex!: number | null;


  constructor(options: ExportOptions) {
    this.options = options;
  }

  async export(format: ExportFormat, sharedState: SharedState): Promise<void> {
    this.pythia = sharedState.pythia;
    this.mccConfig = sharedState.mccConfig;
    this.selectedNodes = sharedState.nodeList;
    this.mrcaIndex = sharedState.mrcaOfNodes;
    this.mccRef = this.pythia.getMcc();
    this.mcc = this.mccRef.getMcc();
    this.applyColorOption();

    if (format === "pdf") {
      await this.exportPDF();
    } else {
      this.exportPNG();
    }
    this.mccRef.release();
  }

  private applyColorOption(): void {
    const { colorOption } = this.options;
    this.mccConfig.colorOption = colorOption === "metadata" ? ColorOption.metadata : colorOption === "credibility" ? ColorOption.confidence : ColorOption.none;
  }

  private get isZoomed(): boolean {
    const { verticalZoom, horizontalZoom } = this.mccConfig;
    return verticalZoom > 1 || horizontalZoom > 1;
  }

  private legendColors(tree: MccTreeCanvas): Map<string, string> | null {
    return this.mccConfig.metadataField === null ? null : tree.getLegendColors();
  }

  private drawTree(
    treeCanvas: MccTreeCanvas,
    zoom: boolean,
    pdfCanvas: PdfCanvas | null = null
  ): void {
    const { mccRef, mccConfig, mcc, pythia } = this;

    const conf = mccRef.getNodeConfidence();
    if (!this.options.branchWidthByTips) {
      treeCanvas.uniformBranchWidth = true;
    }
    if (zoom) {
      const { verticalZoom, zoomCenterX, zoomCenterY, horizontalZoom } = mccConfig;
      treeCanvas.setZoom(verticalZoom, zoomCenterY, horizontalZoom, zoomCenterX);
    }
    treeCanvas.setConfig(mccConfig);
    mccConfig.updateInnerNodeMetadata(mcc);

    treeCanvas.setTipLabelsType(mccConfig.colorOption);
    treeCanvas.positionTreeNodes(mcc, conf, pythia?.getAbsoluteMccIndex());
    treeCanvas.setColors(mcc);

    const rootIndex = mcc.getRootIndex();
    const minDate = mcc.getTimeOf(rootIndex);
    const maxDate = pythia.maxDate;
    const timelineIndices = getDenseTimelineIndices(minDate, maxDate);
    if (pdfCanvas) {
      if (zoom) {
        const ctx = pdfCanvas.getContext();
        ctx.beginPath();
        ctx.rect(0, 0, treeCanvas.width * 1.5, treeCanvas.height);
        ctx.clip();
      }
      treeCanvas.draw(minDate, maxDate, timelineIndices, pdfCanvas);
    } else {
      treeCanvas.draw(minDate, maxDate, timelineIndices);
    }
  }

  private drawNodeOnTree(treeCanvas: MccTreeCanvas, ctx: CanvasCtx, nodeIndex: number, color: string, mrca = false) {
    const x = treeCanvas.getZoomX(this.mcc.getTimeOf(nodeIndex)),
      y = treeCanvas.getZoomY(nodeIndex);
    const radius = mrca ? 4 : 6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.moveTo(x + radius, y);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2, false);
    ctx.fillStyle = mrca ? color : `rgb(255,255,255)`;
    ctx.fill();
    ctx.stroke();
  }

  private renderTreeToCanvas(
    zoom: boolean,
    width: number,
    height: number,
    scale: number
  ): { canvas: HTMLCanvasElement; tree: MccTreeCanvas } {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const tree = new MccTreeCanvas(canvas, ctx);
    canvas.width = width * scale;
    canvas.height = height * scale;
    tree.width = width;
    tree.height = height;
    ctx.scale(scale, scale);
    this.drawTree(tree, zoom);
    return { canvas, tree };
  }

  // ----- PNG --------------------------------------------------------------

  private exportPNG(): void {
    const { width, height, margin } = pdf_dimensions;
    const scale = 3;

    const { canvas: mccTreeCanvas, tree } = this.renderTreeToCanvas(false, width / 2, height, scale);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = width * scale;
    outCanvas.height = height * scale;
    const outctx = outCanvas.getContext('2d') as CanvasRenderingContext2D;
    outctx.fillStyle = '#fff';
    outctx.fillRect(0, 0, width * scale, height * scale);
    outctx.drawImage(mccTreeCanvas, margin.left * scale, margin.top * scale);

    if (this.isZoomed) {
      const { canvas: zoomedCanvas } = this.renderTreeToCanvas(true, width / 2, height, scale);
      outctx.drawImage(zoomedCanvas, (margin.left + width / 2 + PADDING) * scale, margin.top * scale);
    } else {
      const legendBounds: LegendBounds = {
        x: margin.left + width / 2 + PADDING,
        y: margin.top,
        width: width / 2 - margin.left - margin.right - PADDING,
        height: height - margin.top - margin.bottom,
      };
      outctx.save();
      outctx.scale(scale, scale);
      drawLegend(this.mccConfig, outctx, this.legendColors(tree), legendBounds, { fontSize: 18, lineHeight: 20 });
      outctx.restore();
    }

    this.downloadDataUrl(outCanvas.toDataURL('image/png'), `delphy-${getTimestampString()}.png`);
  }

  private downloadDataUrl(href: string, filename: string): void {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 10000);
  }

  // ----- PDF --------------------------------------------------------------

  private async exportPDF(): Promise<void> {
    const { width, height, margin } = pdf_dimensions;
    const canvas = new PdfCanvas(width, height, 'landscape');
    const ctx = canvas.getContext();

    // jspdf does not support .otf files, so we have these home made .ttf conversions
    await Promise.all([
      canvas.addFont('/assets/fonts/roboto/roboto-bold.ttf', 'Roboto', '700'),
      canvas.addFont('/assets/fonts/roboto/roboto-medium.ttf', 'Roboto', '500'),
    ]);

    const drawingWidth = width - margin.left - margin.right;
    const drawingHeight = height - margin.top - margin.bottom - PADDING;

    this.drawPdfMainPage(canvas, ctx, drawingWidth, drawingHeight);


    if (this.isZoomed) {
      canvas.addPage();
      this.drawPdfZoomPage(canvas, ctx, drawingWidth, drawingHeight);
    }

    if (this.selectedNodes.length > 0) {
      canvas.addPage();
      this.drawSelectedNodePage(canvas, ctx, drawingWidth, drawingHeight);

    }
    canvas.save(`delphy-${getTimestampString()}.pdf`);
  }

  private drawSelectedNodePage(canvas: PdfCanvas, ctx: CanvasCtx, drawingWidth: number, drawingHeight: number) {
    const { margin } = pdf_dimensions;
    ctx.save();
    ctx.translate(margin.left, margin.top);
    canvas.drawTitle("Selected Nodes");

    // left: draw tree and nodes on tree
    const treeCanvas = new MccTreeCanvas(canvas, ctx);
    treeCanvas.width = drawingWidth / 3;
    treeCanvas.height = drawingHeight;
    ctx.translate(0, PADDING);
    this.drawTree(treeCanvas, false, canvas);
    const displayNodes = [DisplayNode.node1, DisplayNode.node2];
    const node1Color = getNodeColor(DisplayNode.node1),
      node2Color = getNodeColor(DisplayNode.node2), mrcaColor = getNodeColor(DisplayNode.mrca);

    for (let i = 0; i < this.selectedNodes.length; i++) {
      const nodeIndex = this.selectedNodes[i];
      this.drawNodeOnTree(treeCanvas, ctx, nodeIndex, getNodeColor(displayNodes[i]));
    }

    if (this.mrcaIndex) {
      this.drawNodeOnTree(treeCanvas, ctx, this.mrcaIndex, getNodeColor(DisplayNode.mrca), true);
    }
    ctx.restore();
    ctx.translate(treeCanvas.width + 100 + margin.left, margin.top + PADDING);

    // right: for each selected node
    const sectionHeight = 150;

    for (let i = 0; i < this.selectedNodes.length; i++) {
      const nodeIndex = this.selectedNodes[i];
      ctx.fillStyle = getNodeColor(displayNodes[i]);
      const tips = this.pythia.getMccNodeTips(nodeIndex);
      ctx.translate(0, i * sectionHeight);
      canvas.setFontSize(20);
      canvas.setFont("Roboto", "700");

      ctx.fillText(`Node ${i === 0 ? "A" : "B"}`, 0, 0);
      canvas.setFontSize(14);
      canvas.setFont("Roboto", "500");
      ctx.translate(0, 20);
      ctx.fillText(`${tips.length} tips, monophyletic in ${2}% of base trees.`, 0, 0);
      ctx.translate(0, 20);
      tips.forEach((tip, index) => {
        const tipID = this.mcc.getBaseTree(0).getNameOf(tip);
        ctx.fillText(`${tipID}`, 50, index * 20);
      })
    }

    if (this.mrcaIndex) {
      canvas.setFontSize(20);
      canvas.setFont("Roboto", "700");
      ctx.fillStyle = getNodeColor(DisplayNode.mrca);
      const tips = this.pythia.getMccNodeTips(this.mrcaIndex);
      ctx.fillText(`MRCA:  ${tips.length} tips`, 0, sectionHeight * this.selectedNodes.length);
    }
    // monophyletic in n% of base trees
    // tip id(s)


    ctx.restore();
  }

  private drawPdfLegend(canvas: PdfCanvas, bounds: LegendBounds, treeCanvas: MccTreeCanvas): void {
    drawLegend(this.mccConfig, canvas.getContext(), this.legendColors(treeCanvas), bounds, {
      fontSize: 18,
      lineHeight: 20,
      applyFont: (_, size) => {
        canvas.setFont("Roboto", "500");
        canvas.setFontSize(size);
      }
    });
  }

  private drawPdfMainPage(canvas: PdfCanvas, ctx: Context2d, drawingWidth: number, drawingHeight: number): void {
    const { margin } = pdf_dimensions;

    const treeCanvas = new MccTreeCanvas(canvas, ctx);
    ctx.save();
    ctx.translate(margin.left, margin.top);
    canvas.drawTitle('Maximum Clade Credibility Tree');
    ctx.translate(0, PADDING);

    treeCanvas.width = drawingWidth / 2;
    treeCanvas.height = drawingHeight;
    this.drawTree(treeCanvas, false, canvas);

    const bounds: LegendBounds = {
      x: treeCanvas.width + PADDING,
      y: 0,
      width: drawingWidth / 2 - PADDING,
      height: drawingHeight,
    };
    this.drawPdfLegend(canvas, bounds, treeCanvas);
    ctx.restore();
  }

  private drawPdfZoomPage(canvas: PdfCanvas, ctx: Context2d, drawingWidth: number, drawingHeight: number): void {
    const { margin } = pdf_dimensions;

    // ========= MINI MAP (full tree) =====
    const miniTreeMap = new MccTreeCanvas(canvas, ctx);
    miniTreeMap.width = drawingWidth / 5;
    miniTreeMap.height = drawingHeight / 2;

    ctx.save();
    ctx.translate(margin.left, margin.top);
    canvas.drawTitle('MCC Tree (selected area)');
    ctx.translate(0, PADDING);
    this.drawTree(miniTreeMap, false, canvas);
    ctx.restore();

    // ========= ZOOMED IN AREA =====
    const zoomedTreeCanvas = new MccTreeCanvas(canvas, ctx);
    zoomedTreeCanvas.width = drawingWidth / 3;
    zoomedTreeCanvas.height = drawingHeight;

    ctx.save();
    ctx.translate(margin.left + miniTreeMap.width + PADDING * 2, margin.top);
    ctx.translate(0, PADDING);
    this.drawTree(zoomedTreeCanvas, true, canvas);
    ctx.restore();

    // ========= SELECTION on MINI TREE =====
    this.drawMiniMapSelection(canvas, ctx, miniTreeMap, zoomedTreeCanvas);

    const bounds: LegendBounds = {
      x: miniTreeMap.width + zoomedTreeCanvas.width + PADDING * 3,
      y: margin.top,
      width: drawingWidth + PADDING - (miniTreeMap.width + zoomedTreeCanvas.width),
      height: drawingHeight,
    };
    this.drawPdfLegend(canvas, bounds, zoomedTreeCanvas);
  }

  private drawMiniMapSelection(
    canvas: PdfCanvas,
    ctx: Context2d,
    miniTreeMap: MccTreeCanvas,
    zoomedTreeCanvas: MccTreeCanvas
  ): void {
    const { margin } = pdf_dimensions;

    const bbox = zoomedTreeCanvas.getZoomBoundsNormalized();
    const miniArea = miniTreeMap.getTreeArea();

    const MIN_BOX = 1;
    const rw = Math.max(MIN_BOX, bbox.width * miniArea.width);
    const rh = Math.max(MIN_BOX, bbox.height * miniArea.height);
    const rx = Math.min(miniArea.x + bbox.x * miniArea.width, miniArea.x + miniArea.width - rw);
    const ry = Math.min(miniArea.y + bbox.y * miniArea.height, miniArea.y + miniArea.height - rh);

    const pdf = canvas.doc;

    pdf.saveGraphicsState();
    //@ts-expect-error GState isn't in the typings
    pdf.setGState(new pdf.GState({ opacity: 0.7 }));
    pdf.setFillColor(255, 255, 255);
    pdf.rect(margin.left, margin.top + PADDING, miniTreeMap.width, miniTreeMap.height, 'F');
    pdf.restoreGraphicsState();

    ctx.save();
    ctx.translate(margin.left, margin.top + PADDING);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();
    this.drawTree(miniTreeMap, false, canvas);
    ctx.restore();

    ctx.strokeStyle = '#62a6ee';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
  }
}