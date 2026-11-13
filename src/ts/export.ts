import { SummaryTree } from "./pythia/delphy_api";
import { MccRef } from "./pythia/mccref";
import { Pythia } from "./pythia/pythia";
import { SharedState } from "./sharedstate";
import { ColorOption, getTimelineIndices, getTimestampString } from "./ui/common";
import { MccConfig } from "./ui/mccconfig";
import { MccTreeCanvas } from "./ui/mcctreecanvas";
import { PdfCanvas } from "./util/pdfcanvas";

export function setupDownload(sharedState: SharedState) {
  const downloadBtn = document.querySelector(".nav-download-button") as HTMLButtonElement;
  const downloadMenu = document.querySelector(".mcc-download-menu") as HTMLDivElement;
  downloadBtn.addEventListener("click", () => {

    if (sharedState.mccConfig.colorOption === ColorOption.confidence) {
      credRadio.checked = true;
    } else if (sharedState.mccConfig.colorOption === ColorOption.metadata) {
      metadatRadio.checked = true;
    }else{
      noneRadio.checked = true;
    }
    downloadMenu.classList.toggle("expanded");

  });

  // TODO: clicking elsewhere should also dismiss this dialog
  const form = document.querySelector("#mcc-download-form") as HTMLFormElement;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const format = formData.get("export-format");
    const options = {
      includeZoom: formData.has("zoom-area"),
      includeNodes: formData.has("selected-nodes")
    };
    const pythia = sharedState.pythia;
    const mccRef = pythia.getMcc();
    const mcc = mccRef.getMcc() as SummaryTree;
    if (format === "pdf") exportPDF(pythia, sharedState.mccConfig, mcc, mccRef);
    else exportPNG(pythia, sharedState.mccConfig, mcc, mccRef);
  });


  const credRadio = form.querySelector("#cred-radio") as HTMLInputElement,
    metadatRadio = form.querySelector("#metadata-radio") as HTMLInputElement,
    noneRadio = form.querySelector("#none-radio") as HTMLInputElement;

  credRadio.addEventListener("change", (e) => {
    const mccConfig = sharedState.mccConfig;
    if (credRadio.checked) {
      mccConfig.setColorSystem(ColorOption.confidence)
    }
  })
  metadatRadio.addEventListener("change", (e) => {
    const mccConfig = sharedState.mccConfig;
    if (metadatRadio.checked) {
      mccConfig.setColorSystem(ColorOption.metadata)
    }
  })
  noneRadio.addEventListener("change", (e) => {
    const mccConfig = sharedState.mccConfig;
    if (noneRadio.checked) {
      mccConfig.setColorSystem(ColorOption.none)
    }
  })
}

function exportPNG(pythia: Pythia, mccConfig: MccConfig, mcc: SummaryTree, mccRef: MccRef) {
  const scale = 3;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const imgTreeCanvas = new MccTreeCanvas(canvas, ctx);
  const conf = mccRef.getNodeConfidence();

  canvas.width = 500 * scale;
  canvas.height = 750 * scale;

  imgTreeCanvas.width = 500;
  imgTreeCanvas.height = 750;

  ctx.scale(scale, scale);

  if (mccConfig) {
    imgTreeCanvas.setConfig(mccConfig);
    mccConfig.updateInnerNodeMetadata(mcc);
  }

  imgTreeCanvas.positionTreeNodes(mcc, conf, pythia?.getAbsoluteMccIndex());
  imgTreeCanvas.setColors(mcc);

  const rootIndex = mcc.getRootIndex();
  const minDate = mcc.getTimeOf(rootIndex);
  const maxDate = pythia.maxDate;
  const timelineIndices = getTimelineIndices(minDate, maxDate);

  imgTreeCanvas.draw(minDate, maxDate, timelineIndices);

  const a = document.createElement("a");
  const url = canvas.toDataURL("image/png");
  const title = `delphy-${getTimestampString()}.png`;

  a.href = url;
  a.download = title;
  document.body.appendChild(a);
  a.click();

  mccRef.release();
  setTimeout(() => a.remove(), 10000);
}

function exportPDF(pythia: Pythia, mccConfig: MccConfig, mcc: SummaryTree, mccRef: MccRef) {

  const canvas = new PdfCanvas(500, 750),
    ctx = canvas.getContext(),
    imgTreeCanvas = new MccTreeCanvas(canvas, ctx),
    conf = mccRef.getNodeConfidence();
  const promises: Promise<void>[] = [];
  /*
    jspdf does not support .otf files, so we have these home made .ttf conversions
    */
  promises.push(canvas.addFont('/assets/fonts/roboto/roboto-bold.ttf', 'Roboto', '700'));
  promises.push(canvas.addFont('/assets/fonts/roboto/roboto-medium.ttf', 'Roboto', '500'));
  Promise.all(promises).then(() => {
    // console.debug(canvas.getFontList());
    canvas.width = 500;
    canvas.height = 750;
    imgTreeCanvas.width = 500;
    imgTreeCanvas.height = 750;
    if (mccConfig) {
      imgTreeCanvas.setConfig(mccConfig);
      mccConfig.updateInnerNodeMetadata(mcc);
    }
    imgTreeCanvas.positionTreeNodes(mcc, conf, pythia?.getAbsoluteMccIndex());
    imgTreeCanvas.setColors(mcc);

    const rootIndex = mcc.getRootIndex();
    const minDate = mcc.getTimeOf(rootIndex);
    const maxDate = pythia.maxDate;
    const timelineIndices = getTimelineIndices(minDate, maxDate);
    imgTreeCanvas.draw(minDate, maxDate, timelineIndices);

    imgTreeCanvas.draw(minDate, maxDate, timelineIndices, canvas);
    canvas.save(`delphy-${getTimestampString()}.pdf`);
  });
}
