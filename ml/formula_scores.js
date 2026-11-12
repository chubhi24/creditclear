/**
 * Scores synthetic applicants with the rule formula, the API's fallback,
 * so the comparison uses infra/src code rather than a Python copy of it.
 * Usage: node formula_scores.js <applicants.json> <scores.json>
 */

const fs = require("node:fs");
const { computeFormulaScore } = require("../infra/src/scoringFormula");
const { toApplication, toSignals } = require("./application");

const [inputPath, outputPath] = process.argv.slice(2);
const applicants = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const scores = applicants.map((a) => computeFormulaScore(toApplication(a), toSignals(a, 1.33)).score);
fs.writeFileSync(outputPath, JSON.stringify(scores));
