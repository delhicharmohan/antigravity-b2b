async function simulateWebhookServiceNotifySettlement(merchantId: string, delayMs: number) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function runBenchmark() {
  const uniqueMerchants = ['merchant_1', 'merchant_2', 'merchant_3', 'merchant_4', 'merchant_5', 'merchant_6', 'merchant_7', 'merchant_8', 'merchant_9', 'merchant_10'];
  const delayMs = 50; // 50ms latency per request

  console.log('--- Sequential Execution Baseline ---');
  const startSequential = performance.now();
  for (const merchantId of uniqueMerchants) {
    await simulateWebhookServiceNotifySettlement(merchantId, delayMs);
  }
  const endSequential = performance.now();
  console.log(`Sequential execution time: ${(endSequential - startSequential).toFixed(2)} ms`);

  console.log('--- Parallel Execution (Promise.all) ---');
  const startParallel = performance.now();
  const promises = uniqueMerchants.map(merchantId =>
    simulateWebhookServiceNotifySettlement(merchantId, delayMs)
  );
  await Promise.all(promises);
  const endParallel = performance.now();
  console.log(`Parallel execution time: ${(endParallel - startParallel).toFixed(2)} ms`);
}

runBenchmark().catch(console.error);
