import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'*.spec.mjs',fullyParallel:false,workers:1,retries:0,timeout:30000,reporter:[['list'],['json',{outputFile:'e2e-results/results.json'}]],use:{browserName:'chromium',trace:'off',screenshot:'off',video:'off',ignoreHTTPSErrors:false}});
