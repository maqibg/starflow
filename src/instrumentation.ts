import { ProxyAgent, setGlobalDispatcher } from "undici";

export async function register() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    const proxyAgent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(proxyAgent);
    console.log("Proxy configured:", proxyUrl);
  }

  // 后台定时同步只在 Node.js 运行时启动：Edge 运行时没有 Prisma 也不适合常驻定时器
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
