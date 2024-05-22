import { jsPDF, Context2d } from "jspdf";
// import {MD500FontFile} from '../lib/mdsystem-500.js';
// import {MD700FontFile} from '../lib/mdsystem-700.js';
// console.debug("jsPdf font files", MD500FontFile, MD700FontFile);

export class PdfCanvas {

  width: number;
  height: number;
  doc: jsPDF;
  ctx: Context2d;
  parentNode = null;
  style: any = {}; // eslint-disable-line  @typescript-eslint/no-explicit-any
  offsetTop = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.doc = new jsPDF({  // eslint-disable-line new-cap
      unit: "px",
      format: [width, height]
    });
    this.ctx = this.doc.context2d;
  }

  getContext(): Context2d {return this.ctx;}

  save(filename: string): void {
    /* get rid of the first blank page */
    this.doc.deletePage(1);
    this.doc.save(filename);
  }


  async addFont(path: string, name: string, weight: string) : Promise<void> {
    // console.debug(`fetching ${path} for pdf`);
    await fetch(path)
      .then(r=>r.arrayBuffer())
      .then(fontData=>{
        const encoded = base64Encode(fontData);
        this.doc.addFileToVFS(path, encoded);
        this.doc.addFont(path, name, weight);
        // console.debug(`${name} ${weight} added to pdf from ${path}`);
        /*

        Hack alert!

        We want to reuse the js canvas code as much as possible,
        but the jsPdf context2d canvas emulator has trouble with
        font specifications. As a minor protection against that,
        we set the font we just loaded as the font for this document.
        That way we'll at least get *something* within our typographic
        preferences. [mark 230714 - happy bastille day!]

        */
        this.doc.setFont(name, weight);
      });
  }

  getFontList() : {[name:string]: string[]} {
    return this.doc.getFontList();
  }

  setFont(name: string, weight: string) : void {
    this.doc.setFont(name, weight);
  }

  setFontSize(size: number): void {
    this.doc.setFontSize(size);
  }


}


const base64Encode = (buffer:ArrayBuffer)=>{
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode( bytes[ i ] );
  }
  return window.btoa(binary);
}


