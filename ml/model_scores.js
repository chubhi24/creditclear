/**
 * Scores applicants through the API's model so train.py can prove JavaScript matches Python.
 * Usage: node model_scores.js <applicants.json> <probabilities.json>
 */

const fs = require("node:fs");
const { defaultProbability } = require("../infra/src/riskModel");
const { toApplication, toSignals } = require("./application");

const [inputPath, outputPath] = process.argv.slice(2);
const applicants = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const probabilities = applicants.map((a) => defaultProbability(toApplication(a), toSignals(a, 0)));
fs.writeFileSync(outputPath, JSON.stringify(probabilities));
