import { languages, Location, SymbolInformation, SymbolKind, workspace, Range } from 'vscode';
import {
  AI_CONSTANTS,
  AUTOIT_MODE,
  isSkippableLine,
  functionPattern,
  variablePattern,
  regionPattern,
} from './util';

const config = workspace.getConfiguration('autoit');

const createVariableSymbol = (variable, variableKind, doc, line) => {
  return new SymbolInformation(variable, variableKind, '', new Location(doc.uri, line.range));
};

/**
 * Generates a SymbolInformation object for a function from a given TextDocument
 * that includes the full range of the function's body
 * @param {String} functionName The name of the function from the AutoIt script
 * @param {TextDocument} doc The current document to search
 * @param {String} docText The text from the document (usually generated through `TextDocument.getText()`)
 * @returns SymbolInformation
 */
const createFunctionSymbol = (functionName, doc, docText) => {
  const pattern = new RegExp(
    // `^Func\\s+\\b(?<funcName>${functionName}\\b).*\\n(?:(?!EndFunc\\b).*\\n)*EndFunc.*\\n?`
    `Func\\s+\\b(?<funcName>${functionName}+\\b).*?(EndFunc)`,
    's',
  );
  const result = pattern.exec(docText);
  const endPoint = result.index + result[0].length;
  const newFunctionSymbol = new SymbolInformation(
    result[1],
    SymbolKind.Function,
    '',
    new Location(doc.uri, new Range(doc.positionAt(result.index), doc.positionAt(endPoint))),
  );

  return newFunctionSymbol;
};

export default languages.registerDocumentSymbolProvider(AUTOIT_MODE, {
  provideDocumentSymbols(doc) {
    const result = [];
    const found = [];
    let funcName;
    let variableKind;

    // Get the number of lines in the document to loop through
    const lineCount = Math.min(doc.lineCount, 10000);
    for (let lineNum = 0; lineNum < lineCount; lineNum += 1) {
      const line = doc.lineAt(lineNum);
      const { text } = line;
      const regionName = text.match(regionPattern);

      if (isSkippableLine(line) && !regionName) {
        // eslint-disable-next-line no-continue
        continue;
      }

      funcName = functionPattern.exec(text);
      if (funcName && !found.includes(funcName[1])) {
        const functionSymbol = createFunctionSymbol(funcName[1], doc, doc.getText());
        result.push(functionSymbol);
        found.push(funcName[1]);
      }

      if (config.showVariablesInGoToSymbol) {
        const variables = text.match(variablePattern);

        if (variables) {
          if (/^Const/.test(text)) {
            variableKind = SymbolKind.Constant;
          } else if (/^Enum/.test(text)) {
            variableKind = SymbolKind.Enum;
          } else {
            variableKind = SymbolKind.Variable;
          }

          // eslint-disable-next-line no-loop-func
          variables.forEach(variable => {
            if (found.includes(variable) || AI_CONSTANTS.includes(variable)) {
              return;
            }

            result.push(createVariableSymbol(variable, variableKind, doc, line));
            found.push(variable);
          });
        }
      }

      if (config.showRegionsInGoToSymbol) {
        if (regionName && !found.includes(regionName[0])) {
          const regionSymbol = new SymbolInformation(
            regionName[1],
            SymbolKind.Namespace,
            '',
            new Location(doc.uri, line.range),
          );
          result.push(regionSymbol);
          found.push(regionName[1]);
        }
      }
    }

    return result;
  },
});
