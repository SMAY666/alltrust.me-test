import {createClient} from 'redis';
import {ENV} from '../constants/env.js';


const client = createClient({
    url: ENV.REDIS_URL,
});

client.on('error', (err) => {
    console.error('Redis Error:', err);
});

export async function connectRedis() {
    await client.connect();
    console.log('Redis connected');
}
