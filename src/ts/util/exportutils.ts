export const getElementsAndStyles = (
  el: HTMLElement | SVGElement,
  elements: (HTMLElement | SVGElement)[] | null = null,
  styles: CSSStyleDeclaration[]  | null = null
)=>{
  if (elements === null) {
    elements = [];
  }
  if (styles === null) {
    styles = [];
  }
  if (el.nodeName === "#text") return;
  // console.log('getElementsAndStyles ', el)
  const style = window.getComputedStyle(el);
  elements.push(el);
  styles.push(style);
  el.childNodes.forEach( element=>getElementsAndStyles(element as HTMLElement, elements, styles));
  return {elements, styles}
};
