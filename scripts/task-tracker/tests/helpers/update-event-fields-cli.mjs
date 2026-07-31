#!/usr/bin/env node
import { main } from '../../../gh/update-event-fields.mjs';
import { withTestGovernedEffect } from './governed-effect.mjs';

main(process.argv.slice(2), { withGovernedEffect: withTestGovernedEffect }).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`error: event field update failed: ${error.message}`);
    process.exitCode = 1;
  }
);
