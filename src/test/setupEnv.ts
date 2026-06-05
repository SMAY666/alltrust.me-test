process.env.HOST = '127.0.0.1';
process.env.PORT = '8001';
process.env.MONGO_URL = process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017/alltrustme-test';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.TIMESTAMP_WINDOW = '300000';
process.env.MERCHANT_SECRET = 'test-webhook-secret';
