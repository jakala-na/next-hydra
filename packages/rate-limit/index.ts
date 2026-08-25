import { Ratelimit } from "@upstash/ratelimit";
import type { RatelimitConfig } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { keys } from "./keys";

export const redis = new Redis({
  token: keys().UPSTASH_REDIS_REST_TOKEN,
  url: keys().UPSTASH_REDIS_REST_URL,
});

export const createRateLimiter = (props: Omit<RatelimitConfig, "redis">) =>
  new Ratelimit({
    limiter: props.limiter ?? Ratelimit.slidingWindow(10, "10 s"),
    prefix: props.prefix ?? "next-hydra",
    redis,
  });

export const { slidingWindow } = Ratelimit;
