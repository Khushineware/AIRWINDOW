import { runExposureTests } from './exposure.test';
import { runOptimizerTests } from './optimizer.test';
import { runGuardTests } from './guard.test';
import { runConfidenceTests } from './confidence.test';
import { runAgentTests } from './agent.test';

async function main() {
  console.log('==========================================');
  console.log('AirWindow Core Algorithms Test Suite');
  console.log('==========================================\n');

  try {
    runExposureTests();
    runOptimizerTests();
    runGuardTests();
    runConfidenceTests();
    runAgentTests();

    console.log('\n==========================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! (100% parity)');
    console.log('==========================================');
  } catch (error) {
    console.error('\n❌ Test Failure:', error);
    process.exit(1);
  }
}

main();
