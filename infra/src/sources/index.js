/**
 * Gathers the live market context an application needs, driven by the applicant's own answers:
 * their operator picks the plan source, their state picks the inflation series.
 * All sources are fetched in parallel; each one falls back independently.
 */

const { getTelecomPlans } = require("./telecom");
const { getRepoRate } = require("./rbi");
const { getInflation } = require("./inflation");

async function gatherMarketData({ operator, stateCode }) {
  const [telecom, repoRate, inflation] = await Promise.all([
    getTelecomPlans(operator),
    getRepoRate(),
    getInflation(stateCode),
  ]);

  return {
    telecom: telecom.value,
    repoRate: repoRate.value,
    inflation: inflation.value,
    sources: [telecom.source, repoRate.source, inflation.source],
  };
}

module.exports = { gatherMarketData };
