import { evaluateDirectFixture, type CandidateReport } from "./bridge-contract.js";
import { DIRECT_FIXTURES } from "../../tests/fixtures/bridge-events.js";

export function directFixture(): CandidateReport {
  return evaluateDirectFixture(DIRECT_FIXTURES);
}
