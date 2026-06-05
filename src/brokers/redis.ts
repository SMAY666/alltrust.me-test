import {createClient} from 'redis';
import {ENV} from '../constants/env.js';


export const redisClient = createClient({
    url: ENV.REDIS_URL,
});

redisClient.on('error', (err) => {
    console.error('Redis Error:', err);
});

export async function connectRedis() {
    await redisClient.connect();
    console.log('Redis connected');
}
