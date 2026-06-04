import 'dotenv/config.js';
import {start} from './server.js';
import {connectMongoDB} from './brokers/mongodb.js';
import {connectRedis} from './brokers/redis.js';

(async () => {
    await connectMongoDB();
    await connectRedis();
    void start();
})();
