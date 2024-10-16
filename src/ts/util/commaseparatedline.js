// adopted from the processing csv handling code

let c; //char[] c;
let pieces;  //String[] pieces;
let pieceCount; //int pieceCount;
let start;  // int

const doubleQuote = '"';
const retchar = '\r';

export function handleLine(lines, delimiter) {
  const line = lines.shift();
  start = 0;
  pieceCount = 0;
  // c = line.toCharArray();
  // c = line.split('');  // wrong, won't decompose properly
  c = [...line];  // https://stackoverflow.com/a/34717402

  if (c[c.length - 1] === retchar) {
    c.pop();
  }
  // get tally of number of columns and allocate the array
  let cols = 1;  // the first comma indicates the second column
  let quote = false;
  for (let i = 0; i < c.length; i++) {
    if (!quote && (c[i] === delimiter)) {
      cols++;
    } else if (c[i] === doubleQuote) {
      // double double quotes (escaped quotes like "") will simply toggle
      // this back and forth, so it should remain accurate
      quote = !quote;
    }
  }
  // pieces = new String[cols];
  pieces = new Array(cols);

  while (start < c.length) {
    const enough = ingest(delimiter);  // boolean
    while (!enough) {
      // found a newline inside the quote, grab another line
      if (lines.length === 0) {
        throw new Error("Found a quoted line that wasn't terminated properly.");
      }
      // push this line concatenated back onto the stack and re-parse
      lines.push(`${line  }\n${  lines.pop()}`);
      return handleLine(lines);
    }
  }

  // Make any remaining entries blanks instead of nulls. Empty columns from
  // CSV are always "" not null, so this handles successive commas in a line
  for (let i = pieceCount; i < pieces.length; i++) {
    pieces[i] = '';
  }
  return pieces;
}


// protected void addPiece(int start, int stop, boolean quotes) {
function addPiece(start, stop, quotes) {
  if (quotes) {
    let dest = start;  // int
    for (let i = start; i < stop; i++) {
      if (c[i] === doubleQuote) {
        ++i;  // step over the quote
      }
      if (i !== dest) {
        c[dest] = c[i];
      }
      dest++;
    }
    // pieces[pieceCount++] = new String(c, start, dest - start);
    pieces[pieceCount++] = c.slice(start, dest).join('');

  } else {
    // pieces[pieceCount++] = new String(c, start, stop - start);
    pieces[pieceCount++] = c.slice(start, stop).join('');
  }
}

function ingest(delimiter) {  // boolean
  let hasEscapedQuotes = false;
  const quoted = c[start] === doubleQuote;
  if (quoted) {
    start++; // step over the quote
  }
  let i = start;
  while (i < c.length) {
    if (c[i] === doubleQuote) {
      // if this fella started with a quote
      if (quoted) {
        if (i === c.length-1) {
          // closing quote for field; last field on the line
          addPiece(start, i, hasEscapedQuotes);
          start = c.length;
          return true;

        } else if (c[i+1] === doubleQuote) {
          // an escaped quote inside a quoted field, step over it
          hasEscapedQuotes = true;
          i += 2;

        } else if (c[i+1] === delimiter) {
          // that was our closing quote, get outta here
          addPiece(start, i, hasEscapedQuotes);
          start = i+2;
          return true;

        } else {
          // This is a lone-wolf quote, occasionally seen in exports.
          // It's a single quote in the middle of some other text,
          // and not escaped properly. Pray for the best!
          i++;
        }

      } else {  // not a quoted line
        if (i === c.length-1) {
          // we're at the end of the line, can't have an unescaped quote
          throw new Error("Unterminated quote at end of line");

        } else if (c[i+1] === doubleQuote) {
          // step over this crummy quote escape
          hasEscapedQuotes = true;
          i += 2;

        } else {
          throw new Error("Unterminated quoted field mid-line");
        }
      }
    } else if (!quoted && c[i] === delimiter) {
      addPiece(start, i, hasEscapedQuotes);
      start = i+1;
      return true;

    } else if (!quoted && i === c.length-1) {
      addPiece(start, c.length, hasEscapedQuotes);
      start = c.length;
      return true;

    } else {  // nothing all that interesting
      i++;
    }
  }

  // if still inside a quote, indicate that another line should be read
  if (quoted) {
    return false;
  }

  // should not be possible
  throw new Error("Internal error during parse. Oops.");
}
