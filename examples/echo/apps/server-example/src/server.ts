import Fastify from "fastify";
import { createRouter } from "@fbrpc/fbrpc-server";

const app = Fastify({ logger: true });

const rpc = await createRouter({
  apiDir: "./src/services",
});

await app.register(rpc.register, { prefix: "/api" });

const port = 34088;
await app.listen({ port });
console.log(`echo server → http://localhost:${port}/api`);
