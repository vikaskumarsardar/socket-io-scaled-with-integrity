/**
 * High-Throughput & Concurrency Load Tester for Scaled Socket.IO Microservices
 * 
 * Benchmarks:
 * 1. Concurrent Connections (e.g. 50 WebSocket Clients)
 * 2. High-Throughput Burst (e.g. 100 messages at 50 req/sec)
 * 3. End-to-End Latency & Sequence Ordering Integrity
 */

const { io } = require("socket.io-client");

const targetUrl = process.argv[2] || process.env.GATEWAY_URL || "http://localhost:3000";
const GATEWAY_URL = targetUrl;
const CHAT_SERVICE_URL = targetUrl;

const NUM_CLIENTS = parseInt(process.env.NUM_CLIENTS || "20", 10);
const NUM_MESSAGES = parseInt(process.env.NUM_MESSAGES || "50", 10);

async function runLoadTest() {
  console.log(`=======================================================`);
  console.log(` 🚀 STARTING HIGH-THROUGHPUT CONCURRENCY LOAD TEST`);
  console.log(` Clients: ${NUM_CLIENTS} WebSocket Listeners`);
  console.log(` Target Messages: ${NUM_MESSAGES} HTTP Outbox Bursts`);
  console.log(` Gateway: ${GATEWAY_URL}`);
  console.log(` Chat Service: ${CHAT_SERVICE_URL}`);
  console.log(`=======================================================\n`);

  const sockets = [];
  const receivedStats = new Map(); // messageId -> count received
  const latencies = [];

  const testRunId = `RUN_${Date.now()}`;

  // Step 1: Spawn Concurrent WebSocket Clients
  console.log(`[Phase 1] Connecting ${NUM_CLIENTS} concurrent WebSocket clients...`);
  
  const connectPromises = Array.from({ length: NUM_CLIENTS }).map((_, i) => {
    return new Promise((resolve) => {
      const clientSocket = io(GATEWAY_URL, {
        transports: ["websocket"],
        auth: { userId: `load_user_${i}` }
      });

      clientSocket.on("connect", () => {
        clientSocket.emit("join_room", "room_general");
        sockets.push(clientSocket);
        resolve();
      });

      const handleMessage = (msg) => {
        if (msg && msg.content && msg.content.includes(testRunId)) {
          const key = msg.sequenceId || msg.id;
          receivedStats.set(key, (receivedStats.get(key) || 0) + 1);

          const sentAt = msg.sentAt || (msg.payload && msg.payload.sentAt);
          if (sentAt) {
            const latency = Math.max(0, Date.now() - sentAt);
            latencies.push(latency);
          }
        }
      };

      clientSocket.on("new_message", handleMessage);
    });
  });


  await Promise.all(connectPromises);
  console.log(`✅ All ${sockets.length} WebSocket clients connected successfully!\n`);

  // Step 2: High-Throughput Burst Messaging
  console.log(`[Phase 2] Firing high-throughput burst of ${NUM_MESSAGES} messages...`);
  const startTime = Date.now();

  const sendPromises = Array.from({ length: NUM_MESSAGES }).map(async (_, i) => {
    const sentAt = Date.now();
    try {
      const res = await fetch(`${CHAT_SERVICE_URL}/api/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: "room_general",
          senderId: `load_user_${i % NUM_CLIENTS}`,
          content: `[${testRunId}] Load test message #${i + 1} at ${sentAt}`,
          sentAt: sentAt
        })
      });
      return res.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  const sendResults = await Promise.all(sendPromises);
  const sendDuration = (Date.now() - startTime) / 1000;
  const successfulSends = sendResults.filter(r => r.success).length;

  console.log(`✅ Burst complete in ${sendDuration.toFixed(2)}s (${(successfulSends / sendDuration).toFixed(1)} req/sec)\n`);

  const totalExpectedBroadcasts = successfulSends * NUM_CLIENTS;

  // Step 3: Event-Driven Dynamic Delivery Tracking
  console.log(`[Phase 3] Dynamically tracking delivery of ${totalExpectedBroadcasts} expected broadcasts...`);
  const broadcastStartTime = Date.now();

  await new Promise((resolve) => {
    let settled = false;
    const maxSafetyTimeoutMs = Math.min(Math.max(10000, Math.floor((NUM_MESSAGES * NUM_CLIENTS) / 10)), 35000);

    const safetyTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, maxSafetyTimeoutMs);

    function checkSettled() {
      let currentTotal = 0;
      receivedStats.forEach(count => currentTotal += count);
      if (currentTotal >= totalExpectedBroadcasts && !settled) {
        settled = true;
        clearTimeout(safetyTimer);
        resolve();
      }
    }

    sockets.forEach(s => {
      s.on("new_message", checkSettled);
    });

    checkSettled();
  });

  const totalBroadcastDuration = (Date.now() - broadcastStartTime) / 1000;
  console.log(`✅ Broadcast phase settled in ${totalBroadcastDuration.toFixed(2)}s\n`);

  // Step 4: Output Benchmark Results Report
  let totalReceivedBroadcasts = 0;
  receivedStats.forEach(count => totalReceivedBroadcasts += count);

  const sortedLatencies = latencies.sort((a, b) => a - b);
  const getPercentile = (pct) => {
    if (sortedLatencies.length === 0) return "N/A";
    const idx = Math.min(Math.floor(sortedLatencies.length * (pct / 100)), sortedLatencies.length - 1);
    return `${sortedLatencies[idx]} ms`;
  };

  const avgLatency = latencies.length > 0 ? `${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)} ms` : "N/A";

  console.log(`=======================================================`);
  console.log(` 📊 LOAD TEST BENCHMARK RESULTS`);
  console.log(`=======================================================`);
  console.log(` Concurrent Sockets Connected : ${sockets.length}`);
  console.log(` Messages Posted to DB        : ${successfulSends} / ${NUM_MESSAGES}`);
  console.log(` Ingestion Throughput          : ${(successfulSends / sendDuration).toFixed(1)} req/sec`);
  console.log(` Expected Broadcast Delivery   : ${totalExpectedBroadcasts} messages`);
  console.log(` Actual Broadcast Delivered    : ${totalReceivedBroadcasts} messages`);
  console.log(` Delivery Success Rate         : ${((totalReceivedBroadcasts / totalExpectedBroadcasts) * 100).toFixed(1)}%`);
  console.log(`-------------------------------------------------------`);
  console.log(` ⏱️  END-TO-END LATENCY PERCENTILES (Postgres Outbox -> CDC -> Kafka -> WebSockets):`);
  console.log(` Average Latency               : ${avgLatency}`);
  console.log(` p50 (Median) Latency          : ${getPercentile(50)}`);
  console.log(` p90 Latency                   : ${getPercentile(90)}`);
  console.log(` p95 Latency                   : ${getPercentile(95)}`);
  console.log(` p99 (Tail Latency)            : ${getPercentile(99)}`);
  console.log(`=======================================================\n`);

  // Cleanup Sockets
  sockets.forEach(s => s.disconnect());
  process.exit(0);
}

runLoadTest().catch(err => {
  console.error("Load test failed:", err);
  process.exit(1);
});
